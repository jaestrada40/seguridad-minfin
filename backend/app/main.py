"""SecureVault API — servidor HTTP hecho solo con la librería estándar de Python.

No usa FastAPI, SQLAlchemy ni ningún paquete de PyPI: así el build de Docker
no necesita descargar nada de pypi.org (bloqueado en algunas redes
corporativas). Persiste en un archivo SQLite en vez de Postgres.
"""

import base64
import hashlib
import hmac
import http.cookies
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

from . import vault_client

DB_PATH = os.getenv("DB_PATH", "/app/data/securevault.db")
SESSION_SECRET = os.getenv("SESSION_SECRET", "change-this-local-session-secret")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin.local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "cambiar-esta-clave")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:3000")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE = "securevault_session"
TTL = 8 * 60 * 60
MAX_TRACKED_IPS = 10_000
DEFAULT_PORTALS_LIMIT = 200
MAX_PORTALS_LIMIT = 500
URL_RE = re.compile(r"^https?://\S+$")
CSRF_HEADER = "X-Requested-With"
CSRF_HEADER_VALUE = "SecureVaultFrontend"

failed_logins: dict[str, tuple[int, float]] = {}
failed_logins_lock = threading.Lock()

_local = threading.local()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def get_db() -> sqlite3.Connection:
    if not hasattr(_local, "conn"):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        _local.conn = conn
    return _local.conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Administrador',
            is_active INTEGER NOT NULL DEFAULT 1,
            email TEXT,
            department TEXT,
            auth_method TEXT NOT NULL DEFAULT 'Local (Dev)',
            last_login REAL,
            totp_secret TEXT,
            mfa_enabled INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS portals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            url TEXT NOT NULL,
            username TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Activo',
            has_vault_password INTEGER NOT NULL DEFAULT 0,
            department TEXT,
            description TEXT
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'system',
            portal_name TEXT,
            ip_address TEXT,
            created_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            logo_data_url TEXT
        );
        """
    )
    portal_columns = {row["name"] for row in conn.execute("PRAGMA table_info(portals)")}
    if "has_vault_password" not in portal_columns:
        if "password_encrypted" in portal_columns:
            # Migración desde el cifrado casero anterior: el contenido ya no es
            # legible sin la clave vieja, así que solo conservamos si tenía o no
            # contraseña; el valor real se debe volver a guardar en Vault.
            conn.execute("ALTER TABLE portals ADD COLUMN has_vault_password INTEGER NOT NULL DEFAULT 0")
            conn.execute("UPDATE portals SET has_vault_password = 1 WHERE password_encrypted IS NOT NULL")
        else:
            conn.execute("ALTER TABLE portals ADD COLUMN has_vault_password INTEGER NOT NULL DEFAULT 0")
    if "department" not in portal_columns:
        conn.execute("ALTER TABLE portals ADD COLUMN department TEXT")
    if "description" not in portal_columns:
        conn.execute("ALTER TABLE portals ADD COLUMN description TEXT")
    user_columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
    if "totp_secret" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN totp_secret TEXT")
    if "mfa_enabled" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0")
    if not conn.execute("SELECT id FROM app_settings WHERE id = 1").fetchone():
        conn.execute("INSERT INTO app_settings (id, logo_data_url) VALUES (1, NULL)")
    conn.commit()


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return "pbkdf2$310000$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()


def password_ok(password: str, encoded: str) -> bool:
    try:
        algo, rounds, salt, digest = encoded.split("$", 3)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.urlsafe_b64decode(salt), int(rounds))
        return algo == "pbkdf2" and hmac.compare_digest(actual, base64.urlsafe_b64decode(digest))
    except (ValueError, TypeError):
        return False


DUMMY_HASH = password_hash("dummy-password-for-constant-time-login")


# Las contraseñas de portal se guardan en HashiCorp Vault (KV v2), no en
# SQLite — ver vault_client.py. `has_vault_password` es solo una bandera local
# para no tener que consultar Vault en cada listado del catálogo.


def make_token(user_id: int) -> str:
    body = base64.urlsafe_b64encode(json.dumps({"sub": user_id, "exp": int(time.time()) + TTL}).encode()).decode().rstrip("=")
    signature = hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return body + "." + signature


def seed(conn: sqlite3.Connection) -> None:
    if not conn.execute("SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone():
        conn.execute(
            "INSERT INTO users (username, display_name, password_hash, role, is_active, email, department, auth_method) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                ADMIN_USERNAME,
                "Administrador local",
                password_hash(ADMIN_PASSWORD),
                "Administrador",
                1,
                f"{ADMIN_USERNAME}@institucion.local",
                "Tecnologías de la Información",
                "Local (Dev)",
            ),
        )
    if not conn.execute("SELECT id FROM portals LIMIT 1").fetchone():
        conn.executemany(
            "INSERT INTO portals (name, category, url, username, status) VALUES (?,?,?,?,?)",
            [
                ("Portal institucional", "WordPress", "https://demo.local/portal", "usuario-demo", "Activo"),
                ("Sitio informativo", "WordPress", "https://demo.local/informativo", "editor-demo", "Activo"),
                ("Servidor de monitoreo", "Aplicación", "https://demo.local/monitor", "operador-demo", "Activo"),
            ],
        )
    conn.commit()


# --- TOTP (RFC 6238), solo librería estándar --------------------------

TOTP_STEP = 30
TOTP_DIGITS = 6
TOTP_ISSUER = "SecureVault Local"


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def totp_code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    digest = hmac.new(key, counter.to_bytes(8, "big"), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    truncated = int.from_bytes(digest[offset:offset + 4], "big") & 0x7FFFFFFF
    return str(truncated % (10 ** TOTP_DIGITS)).zfill(TOTP_DIGITS)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    if not code or not code.isdigit() or len(code) != TOTP_DIGITS:
        return False
    counter = int(time.time()) // TOTP_STEP
    return any(hmac.compare_digest(totp_code_at(secret, counter + delta), code) for delta in range(-window, window + 1))


def otpauth_url(username: str, secret: str) -> str:
    label = quote(f"{TOTP_ISSUER}:{username}")
    issuer = quote(TOTP_ISSUER)
    return f"otpauth://totp/{label}?secret={secret}&issuer={issuer}&digits={TOTP_DIGITS}&period={TOTP_STEP}"


def make_pending_mfa_token(user_id: int) -> str:
    body = base64.urlsafe_b64encode(
        json.dumps({"sub": user_id, "purpose": "mfa", "exp": int(time.time()) + 120}).encode()
    ).decode().rstrip("=")
    signature = hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return body + "." + signature


def verify_pending_mfa_token(token: str) -> int:
    if not token or "." not in token:
        raise ApiError(401, "Token de MFA inválido")
    body, signature = token.rsplit(".", 1)
    expected = hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "===").decode())
        valid = (
            payload.get("purpose") == "mfa"
            and int(payload["exp"]) >= time.time()
            and hmac.compare_digest(signature, expected)
        )
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        valid = False
    if not valid:
        raise ApiError(401, "Token de MFA inválido o expirado")
    return int(payload["sub"])


def current_user(conn: sqlite3.Connection, handler: "Handler") -> sqlite3.Row:
    token = handler.cookie_value(COOKIE)
    if not token or "." not in token:
        raise ApiError(401, "Sesión requerida")
    body, signature = token.rsplit(".", 1)
    expected = hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    user, valid = None, False
    try:
        payload = json.loads(base64.urlsafe_b64decode(body + "===").decode())
        user = conn.execute("SELECT * FROM users WHERE id = ?", (int(payload["sub"]),)).fetchone()
        valid = int(payload["exp"]) >= time.time() and hmac.compare_digest(signature, expected)
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        user, valid = None, False
    if not valid or not user or not user["is_active"]:
        raise ApiError(401, "Sesión inválida")
    return user


def audit(conn: sqlite3.Connection, user_id: int | None, action: str, type: str = "system", portal_name: str | None = None, ip_address: str | None = None) -> None:
    conn.execute(
        "INSERT INTO audit_logs (user_id, action, type, portal_name, ip_address, created_at) VALUES (?,?,?,?,?,?)",
        (user_id, action, type, portal_name, ip_address, time.time()),
    )
    conn.commit()


def require_str(data: dict, key: str, min_len: int, max_len: int) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not (min_len <= len(value) <= max_len):
        raise ApiError(422, f"Campo inválido: {key}")
    return value


def portal_dict(row: sqlite3.Row, open_count: int = 0) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "category": row["category"],
        "url": row["url"],
        "username": row["username"],
        "status": row["status"],
        "hasPassword": bool(row["has_vault_password"]),
        "department": row["department"] or None,
        "description": row["description"] or None,
        "openCount": open_count,
        "createdAt": "",
    }


def open_counts_by_portal(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(
        "SELECT portal_name, COUNT(*) AS n FROM audit_logs WHERE type = 'access' AND portal_name IS NOT NULL GROUP BY portal_name"
    ).fetchall()
    return {r["portal_name"]: r["n"] for r in rows}


def get_portal_or_404(conn: sqlite3.Connection, portal_id_str: str) -> sqlite3.Row:
    try:
        portal_id = int(portal_id_str)
    except ValueError:
        raise ApiError(404, "Portal no encontrado")
    row = conn.execute("SELECT * FROM portals WHERE id = ?", (portal_id,)).fetchone()
    if not row:
        raise ApiError(404, "Portal no encontrado")
    return row


# --- Endpoints ---------------------------------------------------------

def api_portals(conn, handler, qs) -> list:
    user = current_user(conn, handler)
    search = (qs.get("search") or [None])[0]
    try:
        limit = int((qs.get("limit") or [DEFAULT_PORTALS_LIMIT])[0])
    except ValueError:
        raise ApiError(422, "Parámetro 'limit' inválido")
    limit = max(1, min(limit, MAX_PORTALS_LIMIT))
    if search:
        term = f"%{search}%"
        rows = conn.execute(
            "SELECT * FROM portals WHERE name LIKE ? OR category LIKE ? OR url LIKE ? ORDER BY category, name LIMIT ?",
            (term, term, term, limit),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM portals ORDER BY category, name LIMIT ?", (limit,)).fetchall()
    audit(conn, user["id"], "Consulta de portales", ip_address=handler.client_ip())
    counts = open_counts_by_portal(conn)
    return [portal_dict(r, counts.get(r["name"], 0)) for r in rows]


def api_login(conn, handler):
    data = handler.read_json()
    username = require_str(data, "username", 3, 120)
    password = require_str(data, "password", 1, 200)

    key = handler.client_ip()
    attempts, locked_until = failed_logins.get(key, (0, 0))
    if locked_until > time.time():
        raise ApiError(429, "Demasiados intentos. Intenta más tarde.")

    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    password_matches = password_ok(password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not user["is_active"] or not password_matches:
        attempts += 1
        with failed_logins_lock:
            if len(failed_logins) >= MAX_TRACKED_IPS:
                failed_logins.clear()
            failed_logins[key] = (0, time.time() + 900) if attempts >= 5 else (attempts, 0)
        audit(conn, user["id"] if user else None, f"Inicio de sesión fallido ({username})", type="auth", ip_address=key)
        raise ApiError(401, "Usuario o contraseña incorrectos")

    with failed_logins_lock:
        failed_logins.pop(key, None)

    pending_token = make_pending_mfa_token(user["id"])
    if not user["mfa_enabled"]:
        totp_secret = user["totp_secret"] or generate_totp_secret()
        if not user["totp_secret"]:
            conn.execute("UPDATE users SET totp_secret = ? WHERE id = ?", (totp_secret, user["id"]))
            conn.commit()
        return 200, {"mfaSetupRequired": True, "pendingToken": pending_token, "otpauthUrl": otpauth_url(user["username"], totp_secret)}, None
    return 200, {"mfaRequired": True, "pendingToken": pending_token}, None


def api_mfa_confirm(conn, handler):
    data = handler.read_json()
    pending_token = require_str(data, "pendingToken", 10, 1000)
    code = require_str(data, "code", 6, 6)

    key = handler.client_ip()
    attempts, locked_until = failed_logins.get(key, (0, 0))
    if locked_until > time.time():
        raise ApiError(429, "Demasiados intentos. Intenta más tarde.")

    user_id = verify_pending_mfa_token(pending_token)
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user or not user["is_active"] or not user["totp_secret"] or not verify_totp(user["totp_secret"], code):
        attempts += 1
        with failed_logins_lock:
            if len(failed_logins) >= MAX_TRACKED_IPS:
                failed_logins.clear()
            failed_logins[key] = (0, time.time() + 900) if attempts >= 5 else (attempts, 0)
        audit(conn, user["id"] if user else None, "Código MFA incorrecto", type="auth", ip_address=key)
        raise ApiError(401, "Código incorrecto")

    with failed_logins_lock:
        failed_logins.pop(key, None)
    first_activation = not user["mfa_enabled"]
    conn.execute("UPDATE users SET last_login = ?, mfa_enabled = 1 WHERE id = ?", (time.time(), user["id"]))
    conn.commit()
    token = make_token(user["id"])
    cookie = f"{COOKIE}={token}; HttpOnly; SameSite=Lax; Max-Age={TTL}; Path=/{cookie_attrs()}"
    audit(conn, user["id"], "MFA activado" if first_activation else "Inicio de sesión (MFA)", type="auth", ip_address=key)
    payload = {"id": str(user["id"]), "username": user["username"], "name": user["display_name"], "role": user["role"]}
    return 200, payload, cookie


def api_reset_mfa(conn, handler, user_id_str) -> dict:
    admin = current_user(conn, handler)
    if admin["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para resetear MFA")
    try:
        target_id = int(user_id_str)
    except ValueError:
        raise ApiError(404, "Usuario no encontrado")
    target = conn.execute("SELECT * FROM users WHERE id = ?", (target_id,)).fetchone()
    if not target:
        raise ApiError(404, "Usuario no encontrado")
    conn.execute("UPDATE users SET totp_secret = NULL, mfa_enabled = 0 WHERE id = ?", (target_id,))
    conn.commit()
    audit(conn, admin["id"], f"Reset de MFA ({target['username']})", type="update", ip_address=handler.client_ip())
    return {"status": "ok"}


def api_get_settings(conn, handler) -> dict:
    row = conn.execute("SELECT logo_data_url FROM app_settings WHERE id = 1").fetchone()
    return {"logoDataUrl": row["logo_data_url"] if row else None}


MAX_LOGO_DATA_URL_LENGTH = 700_000  # ~500KB de imagen tras overhead de base64
LOGO_DATA_URL_RE = re.compile(r"^data:image/(png|jpeg|jpg|svg\+xml);base64,")


def api_update_logo(conn, handler) -> dict:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para cambiar el logo")
    data = handler.read_json()
    data_url = data.get("dataUrl")
    if data_url is not None:
        if not isinstance(data_url, str) or len(data_url) > MAX_LOGO_DATA_URL_LENGTH or not LOGO_DATA_URL_RE.match(data_url):
            raise ApiError(422, "Imagen inválida: use PNG, JPG o SVG de menos de ~500KB")
    conn.execute("UPDATE app_settings SET logo_data_url = ? WHERE id = 1", (data_url,))
    conn.commit()
    audit(conn, user["id"], "Cambio de logo institucional" if data_url else "Logo institucional eliminado", type="update", ip_address=handler.client_ip())
    return {"logoDataUrl": data_url}


def api_me(conn, handler) -> dict:
    user = current_user(conn, handler)
    return {"id": str(user["id"]), "username": user["username"], "name": user["display_name"], "role": user["role"]}


def api_create_portal(conn, handler):
    user = current_user(conn, handler)
    if user["role"] not in ("Administrador", "Operador"):
        raise ApiError(403, "No tiene permisos para crear portales")
    data = handler.read_json()
    name = require_str(data, "name", 1, 120)
    category = require_str(data, "category", 1, 40)
    url = require_str(data, "url", 1, 500)
    if not URL_RE.match(url):
        raise ApiError(422, "La URL debe iniciar con http:// o https://")
    username = require_str(data, "username", 1, 120)
    status = data.get("status", "Activo")
    if not isinstance(status, str) or not (1 <= len(status) <= 30):
        raise ApiError(422, "Estado inválido")
    password = data.get("password")
    if password is not None and not isinstance(password, str):
        raise ApiError(422, "Contraseña inválida")
    department = data.get("department")
    if department is not None and (not isinstance(department, str) or len(department) > 160):
        raise ApiError(422, "Departamento inválido")
    description = data.get("description")
    if description is not None and (not isinstance(description, str) or len(description) > 2000):
        raise ApiError(422, "Descripción inválida")

    cur = conn.execute(
        "INSERT INTO portals (name, category, url, username, status, has_vault_password, department, description) VALUES (?,?,?,?,?,?,?,?)",
        (name, category, url, username, status, 1 if password else 0, department or None, description or None),
    )
    conn.commit()
    if password:
        try:
            vault_client.put_portal_password(cur.lastrowid, password)
        except vault_client.VaultError:
            conn.execute("UPDATE portals SET has_vault_password = 0 WHERE id = ?", (cur.lastrowid,))
            conn.commit()
            raise ApiError(502, "No se pudo guardar la contraseña en Vault")
    row = conn.execute("SELECT * FROM portals WHERE id = ?", (cur.lastrowid,)).fetchone()
    audit(conn, user["id"], "Creación de portal", type="create", portal_name=row["name"], ip_address=handler.client_ip())
    return 201, portal_dict(row)


def api_update_portal(conn, handler, portal_id_str):
    user = current_user(conn, handler)
    if user["role"] not in ("Administrador", "Operador"):
        raise ApiError(403, "No tiene permisos para editar portales")
    portal = get_portal_or_404(conn, portal_id_str)
    data = handler.read_json()
    name = require_str(data, "name", 1, 120)
    category = require_str(data, "category", 1, 40)
    url = require_str(data, "url", 1, 500)
    if not URL_RE.match(url):
        raise ApiError(422, "La URL debe iniciar con http:// o https://")
    username = require_str(data, "username", 1, 120)
    status = data.get("status", "Activo")
    if not isinstance(status, str) or not (1 <= len(status) <= 30):
        raise ApiError(422, "Estado inválido")

    department = data.get("department")
    if department is not None and (not isinstance(department, str) or len(department) > 160):
        raise ApiError(422, "Departamento inválido")
    description = data.get("description")
    if description is not None and (not isinstance(description, str) or len(description) > 2000):
        raise ApiError(422, "Descripción inválida")

    if "password" in data:
        password = data.get("password")
        if password is not None and not isinstance(password, str):
            raise ApiError(422, "Contraseña inválida")
        if password:
            try:
                vault_client.put_portal_password(portal["id"], password)
            except vault_client.VaultError:
                raise ApiError(502, "No se pudo guardar la contraseña en Vault")
        else:
            try:
                vault_client.delete_portal_password(portal["id"])
            except vault_client.VaultError:
                pass
        conn.execute(
            "UPDATE portals SET name=?, category=?, url=?, username=?, status=?, has_vault_password=?, department=?, description=? WHERE id=?",
            (name, category, url, username, status, 1 if password else 0, department or None, description or None, portal["id"]),
        )
    else:
        conn.execute(
            "UPDATE portals SET name=?, category=?, url=?, username=?, status=?, department=?, description=? WHERE id=?",
            (name, category, url, username, status, department or None, description or None, portal["id"]),
        )
    conn.commit()
    row = conn.execute("SELECT * FROM portals WHERE id = ?", (portal["id"],)).fetchone()
    audit(conn, user["id"], "Edición de portal", type="update", portal_name=row["name"], ip_address=handler.client_ip())
    counts = open_counts_by_portal(conn)
    return portal_dict(row, counts.get(row["name"], 0))


def api_delete_portal(conn, handler, portal_id_str) -> dict:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para eliminar portales")
    portal = get_portal_or_404(conn, portal_id_str)
    if portal["has_vault_password"]:
        try:
            vault_client.delete_portal_password(portal["id"])
        except vault_client.VaultError:
            pass
    conn.execute("DELETE FROM portals WHERE id = ?", (portal["id"],))
    conn.commit()
    audit(conn, user["id"], "Eliminación de portal", type="delete", portal_name=portal["name"], ip_address=handler.client_ip())
    return {"status": "ok"}


def api_reveal_password(conn, handler, portal_id_str) -> dict:
    user = current_user(conn, handler)
    portal = get_portal_or_404(conn, portal_id_str)
    if not portal["has_vault_password"]:
        raise ApiError(404, "Este portal no tiene una contraseña guardada")
    try:
        password = vault_client.get_portal_password(portal["id"])
    except vault_client.VaultError:
        raise ApiError(502, "No se pudo obtener la contraseña de Vault")
    if password is None:
        raise ApiError(404, "Este portal no tiene una contraseña guardada")
    audit(conn, user["id"], "Contraseña revelada", type="reveal", portal_name=portal["name"], ip_address=handler.client_ip())
    return {"password": password}


def api_copy_user(conn, handler, portal_id_str) -> dict:
    user = current_user(conn, handler)
    portal = get_portal_or_404(conn, portal_id_str)
    audit(conn, user["id"], "Copiado de usuario", type="copy", portal_name=portal["name"], ip_address=handler.client_ip())
    return {"status": "ok"}


def api_open_portal(conn, handler, portal_id_str) -> dict:
    user = current_user(conn, handler)
    portal = get_portal_or_404(conn, portal_id_str)
    audit(conn, user["id"], "Acceso directo iniciado", type="access", portal_name=portal["name"], ip_address=handler.client_ip())
    return {"status": "ok"}


def api_activity(conn, handler) -> list:
    current_user(conn, handler)
    rows = conn.execute(
        "SELECT audit_logs.*, users.username AS uname FROM audit_logs "
        "LEFT JOIN users ON users.id = audit_logs.user_id "
        "ORDER BY created_at DESC LIMIT 200"
    ).fetchall()
    return [
        {
            "id": str(r["id"]),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(r["created_at"])),
            "user": r["uname"] or "desconocido",
            "action": r["action"],
            "portalName": r["portal_name"],
            "type": r["type"],
            "ipAddress": r["ip_address"] or "desconocida",
        }
        for r in rows
    ]


def api_users(conn, handler) -> list:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para ver usuarios")
    rows = conn.execute("SELECT * FROM users ORDER BY username").fetchall()
    return [
        {
            "id": str(u["id"]),
            "name": u["display_name"],
            "username": u["username"],
            "email": u["email"] or "",
            "role": u["role"],
            "department": u["department"] or "",
            "authMethod": u["auth_method"],
            "status": "Activo" if u["is_active"] else "Suspendido",
            "lastLogin": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(u["last_login"])) if u["last_login"] else "Sin registro",
            "mfaEnabled": bool(u["mfa_enabled"]),
        }
        for u in rows
    ]


# --- Servidor HTTP -------------------------------------------------------

def cookie_attrs() -> str:
    return "; Secure" if COOKIE_SECURE else ""


DELETE_COOKIE = f"{COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/{cookie_attrs()}"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SecureVaultAPI/0.3"

    def log_message(self, format, *args):
        pass

    def set_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", CORS_ORIGIN)
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", f"Content-Type, {CSRF_HEADER}")

    def send_json(self, status: int, payload, cookie: str | None = None) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.set_cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "JSON inválido")

    def cookie_value(self, name: str) -> str | None:
        header = self.headers.get("Cookie")
        if not header:
            return None
        jar = http.cookies.SimpleCookie()
        jar.load(header)
        morsel = jar.get(name)
        return morsel.value if morsel else None

    def client_ip(self) -> str:
        return self.client_address[0]

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.set_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        self.dispatch("GET")

    def do_POST(self) -> None:
        self.dispatch("POST")

    def do_PATCH(self) -> None:
        self.dispatch("PATCH")

    def do_DELETE(self) -> None:
        self.dispatch("DELETE")

    def dispatch(self, method: str) -> None:
        parsed = urlparse(self.path)
        segments = [s for s in parsed.path.split("/") if s != ""]
        qs = parse_qs(parsed.query)
        conn = get_db()
        try:
            if method in ("POST", "PATCH", "DELETE") and self.headers.get(CSRF_HEADER) != CSRF_HEADER_VALUE:
                raise ApiError(403, "Falta encabezado de solicitud requerido")
            if method == "GET" and segments == ["health"]:
                self.send_json(200, {"status": "ok", "environment": "local-demo"})
            elif method == "GET" and segments == ["api", "portals"]:
                self.send_json(200, api_portals(conn, self, qs))
            elif method == "POST" and segments == ["api", "auth", "login"]:
                status, payload, cookie = api_login(conn, self)
                self.send_json(status, payload, cookie)
            elif method == "POST" and segments == ["api", "auth", "logout"]:
                self.send_json(200, {"status": "ok"}, DELETE_COOKIE)
            elif method == "POST" and segments == ["api", "auth", "mfa", "confirm"]:
                status, payload, cookie = api_mfa_confirm(conn, self)
                self.send_json(status, payload, cookie)
            elif method == "GET" and segments == ["api", "auth", "me"]:
                self.send_json(200, api_me(conn, self))
            elif method == "GET" and segments == ["api", "settings"]:
                self.send_json(200, api_get_settings(conn, self))
            elif method == "POST" and segments == ["api", "settings", "logo"]:
                self.send_json(200, api_update_logo(conn, self))
            elif method == "POST" and len(segments) == 4 and segments[0:2] == ["api", "users"] and segments[3] == "reset-mfa":
                self.send_json(200, api_reset_mfa(conn, self, segments[2]))
            elif method == "POST" and segments == ["api", "portals"]:
                status, payload = api_create_portal(conn, self)
                self.send_json(status, payload)
            elif method == "PATCH" and len(segments) == 3 and segments[0:2] == ["api", "portals"]:
                self.send_json(200, api_update_portal(conn, self, segments[2]))
            elif method == "DELETE" and len(segments) == 3 and segments[0:2] == ["api", "portals"]:
                self.send_json(200, api_delete_portal(conn, self, segments[2]))
            elif method == "POST" and len(segments) == 4 and segments[0:2] == ["api", "portals"] and segments[3] == "reveal-password":
                self.send_json(200, api_reveal_password(conn, self, segments[2]))
            elif method == "POST" and len(segments) == 4 and segments[0:2] == ["api", "portals"] and segments[3] == "copy-user":
                self.send_json(200, api_copy_user(conn, self, segments[2]))
            elif method == "POST" and len(segments) == 4 and segments[0:2] == ["api", "portals"] and segments[3] == "open":
                self.send_json(200, api_open_portal(conn, self, segments[2]))
            elif method == "GET" and segments == ["api", "activity"]:
                self.send_json(200, api_activity(conn, self))
            elif method == "GET" and segments == ["api", "users"]:
                self.send_json(200, api_users(conn, self))
            else:
                self.send_json(404, {"detail": "No encontrado"})
        except ApiError as e:
            self.send_json(e.status, {"detail": e.message})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"detail": "Error interno del servidor"})


def main() -> None:
    conn = get_db()
    init_db(conn)
    seed(conn)
    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    print(f"SecureVault API escuchando en 0.0.0.0:8000 (DB: {DB_PATH})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
