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
import tempfile
import threading
import time
import traceback
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

from . import backup_crypto, vault_client

DB_PATH = os.getenv("DB_PATH", "/app/data/securevault.db")
BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")
MAX_BACKUP_UPLOAD_BYTES = 64 * 1024 * 1024
def required_secret(name: str, minimum_length: int = 32) -> str:
    value = os.getenv(name, "")
    unsafe_markers = ("change-this", "cambiar_esta", "cambiar-esta", "reemplazar")
    if len(value) < minimum_length or any(marker in value.lower() for marker in unsafe_markers):
        raise RuntimeError(f"{name} debe configurarse con un valor aleatorio de al menos {minimum_length} caracteres")
    return value


SESSION_SECRET = required_secret("SESSION_SECRET")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "")
ADMIN_PASSWORD = required_secret("ADMIN_PASSWORD", 12)
if not ADMIN_USERNAME:
    raise RuntimeError("ADMIN_USERNAME debe configurarse")
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:3000")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE = "securevault_session"
TTL = 8 * 60 * 60
MFA_REAUTH_TTL = 60
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/backups"))
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
            mfa_enabled INTEGER NOT NULL DEFAULT 0,
            last_totp_step INTEGER NOT NULL DEFAULT 0
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
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at REAL NOT NULL,
            revoked_at REAL,
            reauth_until REAL,
            reauth_action TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
    if "last_totp_step" not in user_columns:
        conn.execute("ALTER TABLE users ADD COLUMN last_totp_step INTEGER NOT NULL DEFAULT 0")
    session_columns = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
    if "reauth_until" not in session_columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN reauth_until REAL")
    if "reauth_action" not in session_columns:
        conn.execute("ALTER TABLE sessions ADD COLUMN reauth_action TEXT")
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
    session_id = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + TTL
    get_db().execute("INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)", (session_id, user_id, expires_at))
    get_db().commit()
    body = base64.urlsafe_b64encode(json.dumps({"sub": user_id, "sid": session_id, "exp": expires_at}).encode()).decode().rstrip("=")
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


def verify_totp(secret: str, code: str, window: int = 1) -> int | None:
    """Devuelve el contador (paso de 30 s) con el que el código es válido, o
    None si no lo es. El contador se usa para impedir reutilizar el mismo
    código dentro de su ventana de validez (anti-replay, RFC 6238 §5.2)."""
    if not code or not code.isdigit() or len(code) != TOTP_DIGITS:
        return None
    counter = int(time.time()) // TOTP_STEP
    for delta in range(-window, window + 1):
        if hmac.compare_digest(totp_code_at(secret, counter + delta), code):
            return counter + delta
    return None


def consume_totp(conn: sqlite3.Connection, user: sqlite3.Row, code: str) -> str:
    """Valida un código TOTP y lo marca como usado. Un código sirve una sola
    vez aunque siga dentro de su ventana de validez. Devuelve:
      "ok"      — válido y recién consumido
      "reused"  — era un código válido pero ya se había usado
      "invalid" — no corresponde a ningún paso vigente
    """
    step = verify_totp(user["totp_secret"], code)
    if step is None:
        return "invalid"
    if step <= (user["last_totp_step"] or 0):
        return "reused"
    conn.execute("UPDATE users SET last_totp_step = ? WHERE id = ?", (step, user["id"]))
    return "ok"


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
        user_id = int(payload["sub"])
        session_id = payload["sid"]
        session = conn.execute(
            "SELECT 1 FROM sessions WHERE id = ? AND user_id = ? AND expires_at >= ? AND revoked_at IS NULL",
            (session_id, user_id, time.time()),
        ).fetchone()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        valid = int(payload["exp"]) >= time.time() and bool(session) and hmac.compare_digest(signature, expected)
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


def portal_dict(row: sqlite3.Row, reveal_count: int = 0) -> dict:
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
        "revealCount": reveal_count,
        "createdAt": "",
    }


def reveal_counts_by_portal(conn: sqlite3.Connection) -> dict:
    rows = conn.execute(
        "SELECT portal_name, COUNT(*) AS n FROM audit_logs WHERE type = 'reveal' AND portal_name IS NOT NULL GROUP BY portal_name"
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
    counts = reveal_counts_by_portal(conn)
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
    totp_result = consume_totp(conn, user, code) if (user and user["is_active"] and user["totp_secret"]) else "invalid"
    if totp_result != "ok":
        attempts += 1
        with failed_logins_lock:
            if len(failed_logins) >= MAX_TRACKED_IPS:
                failed_logins.clear()
            failed_logins[key] = (0, time.time() + 900) if attempts >= 5 else (attempts, 0)
        audit(conn, user["id"] if user else None, "Código MFA incorrecto", type="auth", ip_address=key)
        if totp_result == "reused":
            raise ApiError(401, "Ese código ya se usó. Espera a que tu app genere el siguiente.")
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


def api_change_password(conn, handler) -> dict:
    user = current_user(conn, handler)
    data = handler.read_json()
    current_password = require_str(data, "currentPassword", 1, 200)
    new_password = require_str(data, "newPassword", 8, 200)
    if not password_ok(current_password, user["password_hash"]):
        audit(conn, user["id"], "Cambio de contraseña fallido (contraseña actual incorrecta)", type="auth", ip_address=handler.client_ip())
        raise ApiError(401, "La contraseña actual es incorrecta")
    if password_ok(new_password, user["password_hash"]):
        raise ApiError(422, "La nueva contraseña debe ser distinta de la actual")
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash(new_password), user["id"]))
    conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", (time.time(), user["id"]))
    conn.commit()
    audit(conn, user["id"], "Cambio de contraseña propia", type="auth", ip_address=handler.client_ip())
    return {"status": "ok"}


def current_session_id(handler: "Handler") -> str:
    token = handler.cookie_value(COOKIE)
    try:
        body, signature = token.rsplit(".", 1)
        expected = hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        payload = json.loads(base64.urlsafe_b64decode(body + "===").decode())
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        return str(payload["sid"])
    except (AttributeError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise ApiError(401, "Sesión inválida")


def consume_mfa_reauth(conn, handler, action: str) -> None:
    cur = conn.execute(
        "UPDATE sessions SET reauth_until = NULL, reauth_action = NULL "
        "WHERE id = ? AND reauth_action = ? AND reauth_until >= ? AND revoked_at IS NULL",
        (current_session_id(handler), action, time.time()),
    )
    conn.commit()
    if cur.rowcount != 1:
        raise ApiError(403, "Reautenticación MFA requerida para esta acción")


def api_mfa_reauth(conn, handler) -> dict:
    user = current_user(conn, handler)
    data = handler.read_json()
    code = require_str(data, "code", 6, 6)
    action = require_str(data, "action", 1, 20)
    if action not in ("reveal", "backup", "import", "restore"):
        raise ApiError(422, "Acción MFA inválida")
    totp_result = consume_totp(conn, user, code) if user["totp_secret"] else "invalid"
    if totp_result != "ok":
        audit(conn, user["id"], "Reautenticación MFA fallida", type="auth", ip_address=handler.client_ip())
        if totp_result == "reused":
            raise ApiError(401, "Ese código ya se usó. Espera a que tu app genere el siguiente.")
        raise ApiError(401, "Código MFA incorrecto")
    conn.execute(
        "UPDATE sessions SET reauth_until = ?, reauth_action = ? WHERE id = ?",
        (time.time() + MFA_REAUTH_TTL, action, current_session_id(handler)),
    )
    conn.commit()
    audit(conn, user["id"], "Reautenticación MFA para acción sensible", type="auth", ip_address=handler.client_ip())
    return {"status": "ok", "expiresInSeconds": MFA_REAUTH_TTL, "oneTime": True}


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
    conn.execute("UPDATE users SET totp_secret = NULL, mfa_enabled = 0, last_totp_step = 0 WHERE id = ?", (target_id,))
    conn.execute("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", (time.time(), target_id))
    conn.commit()
    audit(conn, admin["id"], f"Reset de MFA ({target['username']})", type="update", ip_address=handler.client_ip())
    return {"status": "ok"}


def api_get_settings(conn, handler) -> dict:
    row = conn.execute("SELECT logo_data_url FROM app_settings WHERE id = 1").fetchone()
    return {"logoDataUrl": row["logo_data_url"] if row else None}


MAX_LOGO_DATA_URL_LENGTH = 700_000  # ~500KB de imagen tras overhead de base64
LOGO_DATA_URL_RE = re.compile(r"^data:image/(png|jpeg|jpg|webp);base64,")


def api_update_logo(conn, handler) -> dict:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para cambiar el logo")
    data = handler.read_json()
    data_url = data.get("dataUrl")
    if data_url is not None:
        if not isinstance(data_url, str) or len(data_url) > MAX_LOGO_DATA_URL_LENGTH or not LOGO_DATA_URL_RE.match(data_url):
            raise ApiError(422, "Imagen inválida: use PNG, JPG o WebP de menos de ~500KB")
    conn.execute("UPDATE app_settings SET logo_data_url = ? WHERE id = 1", (data_url,))
    conn.commit()
    audit(conn, user["id"], "Cambio de logo institucional" if data_url else "Logo institucional eliminado", type="update", ip_address=handler.client_ip())
    return {"logoDataUrl": data_url}


def api_system_settings(conn, handler) -> dict:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para ver la configuración del entorno")

    portals = conn.execute(
        "SELECT COUNT(*) AS total, "
        "SUM(CASE WHEN status = 'Activo' THEN 1 ELSE 0 END) AS activos, "
        "SUM(has_vault_password) AS con_password FROM portals"
    ).fetchone()
    users_total = conn.execute("SELECT COUNT(*) AS n FROM users WHERE is_active = 1").fetchone()["n"]
    reveals_total = conn.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE type = 'reveal'").fetchone()["n"]

    try:
        vault = vault_client.health()
    except Exception:
        vault = {"reachable": False, "initialized": None, "sealed": None, "version": None}

    return {
        "session": {
            "cookieSecure": COOKIE_SECURE,
            "corsOrigin": CORS_ORIGIN,
            "sessionTtlHours": TTL // 3600,
            "mfaRequired": True,
            "mfaAlgorithm": "TOTP (RFC 6238), 6 dígitos / 30 s",
            "loginLockout": "5 intentos fallidos por IP → bloqueo 15 min",
            "csrfHeader": f"{CSRF_HEADER}: {CSRF_HEADER_VALUE}",
        },
        "vault": {
            "address": vault_client.VAULT_ADDR,
            "secretPath": f"{vault_client.VAULT_MOUNT}/data/portals/<id>",
            "engine": "KV v2",
            "reachable": vault["reachable"],
            "initialized": vault["initialized"],
            "sealed": vault["sealed"],
            "version": vault["version"],
        },
        "backups": {
            "restoreAvailable": bool(BACKUP_ENCRYPTION_KEY),
            "maxUploadMb": MAX_BACKUP_UPLOAD_BYTES // (1024 * 1024),
        },
        "catalog": {
            "portalsTotal": portals["total"] or 0,
            "portalsActive": portals["activos"] or 0,
            "portalsWithPassword": portals["con_password"] or 0,
            "activeUsers": users_total,
            "passwordReveals": reveals_total,
            "portalsLimit": MAX_PORTALS_LIMIT,
        },
    }


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


def api_import_portals(conn, handler):
    admin = current_user(conn, handler)
    if admin["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para importar")
    consume_mfa_reauth(conn, handler, "import")
    rows = handler.read_json().get("rows")
    if not isinstance(rows, list) or not rows or len(rows) > 200:
        raise ApiError(422, "Importación inválida: máximo 200 filas")
    urls = []
    for data in rows:
        if not isinstance(data, dict) or not isinstance(data.get("url"), str):
            raise ApiError(422, "Fila inválida")
        urls.append(data["url"])
    repeated = {url for url in urls if urls.count(url) > 1}
    existing = {row[0] for row in conn.execute("SELECT url FROM portals WHERE url IN (%s)" % ",".join("?" * len(urls)), urls)}
    duplicates = sorted(repeated | existing)
    if duplicates:
        raise ApiError(409, "Hay URLs duplicadas: " + ", ".join(duplicates[:5]))
    imported = 0
    for data in rows:
        if not isinstance(data, dict): raise ApiError(422, "Fila inválida")
        name = require_str(data, "name", 1, 120); url = require_str(data, "url", 1, 500); username = require_str(data, "username", 1, 120)
        if not URL_RE.match(url): raise ApiError(422, "URL inválida")
        password = data.get("password")
        cur = conn.execute("INSERT INTO portals (name, category, url, username, has_vault_password) VALUES (?,?,?,?,?)", (name, "Aplicación", url, username, 1 if password else 0))
        if password:
            if not isinstance(password, str): raise ApiError(422, "Contraseña inválida")
            vault_client.put_portal_password(cur.lastrowid, password)
        imported += 1
    conn.commit(); audit(conn, admin["id"], f"Importación Excel ({imported} portales)", type="import", ip_address=handler.client_ip())
    return {"imported": imported}


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
    counts = reveal_counts_by_portal(conn)
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
    if user["role"] not in ("Administrador", "Operador"):
        raise ApiError(403, "No tiene permisos para revelar contraseñas")
    consume_mfa_reauth(conn, handler, "reveal")
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


def backup_files() -> list[Path]:
    if not BACKUP_DIR.is_dir():
        return []
    return sorted((p for p in BACKUP_DIR.glob("securevault-*.enc") if p.is_file()), reverse=True)


def api_backups(conn, handler) -> list:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para ver respaldos")
    return [{"name": p.name, "size": p.stat().st_size, "createdAt": int(p.stat().st_mtime)} for p in backup_files()]


def api_download_backup(conn, handler, filename: str) -> Path:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para descargar respaldos")
    consume_mfa_reauth(conn, handler, "backup")
    if Path(filename).name != filename or not re.fullmatch(r"securevault-\d{8}-\d{6}\.enc", filename):
        raise ApiError(404, "Respaldo no encontrado")
    path = BACKUP_DIR / filename
    if not path.is_file():
        raise ApiError(404, "Respaldo no encontrado")
    audit(conn, user["id"], f"Descarga de respaldo ({filename})", type="backup", ip_address=handler.client_ip())
    return path


SQLITE_MAGIC = b"SQLite format 3\x00"


def _assert_valid_sqlite(path: str) -> None:
    with open(path, "rb") as f:
        if f.read(16) != SQLITE_MAGIC:
            raise ApiError(422, "El archivo restaurado no es una base de datos SQLite válida")
    probe = sqlite3.connect(path)
    try:
        if probe.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ApiError(422, "La base restaurada no pasó el chequeo de integridad")
        tables = {row[0] for row in probe.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    except sqlite3.DatabaseError:
        raise ApiError(422, "El archivo restaurado está dañado o no es una base SQLite legible")
    finally:
        probe.close()
    missing = {"users", "portals", "audit_logs"} - tables
    if missing:
        raise ApiError(422, "El backup no parece de SecureVault (faltan tablas: %s)" % ", ".join(sorted(missing)))


def api_restore_backup(conn, handler) -> dict:
    user = current_user(conn, handler)
    if user["role"] != "Administrador":
        raise ApiError(403, "No tiene permisos para restaurar respaldos")
    if not BACKUP_ENCRYPTION_KEY:
        raise ApiError(503, "Restauración no disponible: falta BACKUP_ENCRYPTION_KEY en el backend")
    consume_mfa_reauth(conn, handler, "restore")

    payload = handler.read_body_bytes(MAX_BACKUP_UPLOAD_BYTES)
    work_dir = os.path.dirname(DB_PATH)
    fd_enc, enc_path = tempfile.mkstemp(suffix=".enc", dir=work_dir)
    with os.fdopen(fd_enc, "wb") as f:
        f.write(payload)
    fd_db, restored_path = tempfile.mkstemp(suffix=".db", dir=work_dir)
    os.close(fd_db)
    os.remove(restored_path)  # decrypt_file lo vuelve a crear
    snapshot_path = os.path.join(work_dir, time.strftime("securevault-pre-restore-%Y%m%d-%H%M%S.db"))

    try:
        try:
            backup_crypto.decrypt_file(enc_path, restored_path, BACKUP_ENCRYPTION_KEY)
        except ValueError as e:
            raise ApiError(422, str(e))
        _assert_valid_sqlite(restored_path)

        snapshot = sqlite3.connect(snapshot_path)
        try:
            conn.backup(snapshot)   # copia previa de la base actual, por si hay que volver atrás
        finally:
            snapshot.close()

        source = sqlite3.connect(restored_path)
        try:
            source.backup(conn)     # reemplaza la base viva in-place; otras conexiones ven el estado nuevo
        finally:
            source.close()
        conn.commit()
    finally:
        for path in (enc_path, restored_path):
            try:
                os.remove(path)
            except OSError:
                pass

    audit(conn, user["id"], f"Restauración de respaldo ({len(payload)} bytes)", type="backup", ip_address=handler.client_ip())
    return {"status": "ok", "snapshotBefore": os.path.basename(snapshot_path)}


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
MAX_REQUEST_BODY_BYTES = 1_048_576


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

    def send_backup(self, path: Path) -> None:
        size = path.stat().st_size
        self.send_response(200)
        self.set_cors()
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f'attachment; filename="{path.name}"')
        self.send_header("Content-Length", str(size))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        with path.open("rb") as f:
            while chunk := f.read(64 * 1024):
                self.wfile.write(chunk)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            raise ApiError(400, "Content-Length inválido")
        if length < 0 or length > MAX_REQUEST_BODY_BYTES:
            raise ApiError(413, "Solicitud demasiado grande")
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "JSON inválido")

    def read_body_bytes(self, max_bytes: int) -> bytes:
        """Lee el cuerpo crudo de la request (para subidas binarias como un
        backup .enc), con un tope propio distinto al de los JSON."""
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            raise ApiError(400, "Content-Length inválido")
        if length <= 0:
            raise ApiError(400, "El cuerpo de la solicitud está vacío")
        if length > max_bytes:
            raise ApiError(413, "El archivo es demasiado grande")
        data = self.rfile.read(length)
        if len(data) != length:
            raise ApiError(400, "La subida quedó incompleta")
        return data

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
            elif method == "POST" and segments == ["api", "auth", "change-password"]:
                self.send_json(200, api_change_password(conn, self))
            elif method == "POST" and segments == ["api", "auth", "logout"]:
                user = current_user(conn, self)
                token = self.cookie_value(COOKIE)
                body, _ = token.rsplit(".", 1)
                payload = json.loads(base64.urlsafe_b64decode(body + "===").decode())
                conn.execute("UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?", (time.time(), payload["sid"], user["id"]))
                conn.commit()
                audit(conn, user["id"], "Cierre de sesión", type="auth", ip_address=self.client_ip())
                self.send_json(200, {"status": "ok"}, DELETE_COOKIE)
            elif method == "POST" and segments == ["api", "auth", "mfa", "confirm"]:
                status, payload, cookie = api_mfa_confirm(conn, self)
                self.send_json(status, payload, cookie)
            elif method == "POST" and segments == ["api", "auth", "mfa", "reauth"]:
                self.send_json(200, api_mfa_reauth(conn, self))
            elif method == "GET" and segments == ["api", "auth", "me"]:
                self.send_json(200, api_me(conn, self))
            elif method == "GET" and segments == ["api", "settings"]:
                self.send_json(200, api_get_settings(conn, self))
            elif method == "GET" and segments == ["api", "settings", "system"]:
                self.send_json(200, api_system_settings(conn, self))
            elif method == "POST" and segments == ["api", "settings", "logo"]:
                self.send_json(200, api_update_logo(conn, self))
            elif method == "POST" and len(segments) == 4 and segments[0:2] == ["api", "users"] and segments[3] == "reset-mfa":
                self.send_json(200, api_reset_mfa(conn, self, segments[2]))
            elif method == "POST" and segments == ["api", "portals"]:
                status, payload = api_create_portal(conn, self)
                self.send_json(status, payload)
            elif method == "POST" and segments == ["api", "portals", "import"]:
                self.send_json(201, api_import_portals(conn, self))
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
            elif method == "GET" and segments == ["api", "backups"]:
                self.send_json(200, api_backups(conn, self))
            elif method == "GET" and len(segments) == 4 and segments[0:3] == ["api", "backups", "download"]:
                self.send_backup(api_download_backup(conn, self, segments[3]))
            elif method == "POST" and segments == ["api", "backups", "restore"]:
                self.send_json(200, api_restore_backup(conn, self))
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
