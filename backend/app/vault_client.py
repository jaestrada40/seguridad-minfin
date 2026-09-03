"""Cliente mínimo de HashiCorp Vault (API REST KV v2), solo librería estándar.

No se usa `hvac` (paquete de PyPI) por el mismo motivo que el resto del
backend: no hay acceso a pypi.org en la red de la oficina. La API HTTP de
Vault es JSON plano, así que `urllib` alcanza.
"""

import json
import os
import urllib.error
import urllib.request

VAULT_ADDR = os.getenv("VAULT_ADDR", "http://vault:8200")
VAULT_KEYS_PATH = os.getenv("VAULT_KEYS_PATH", "/keys/vault-keys.json")
VAULT_MOUNT = "secret"


class VaultError(Exception):
    pass


def _token() -> str:
    try:
        with open(VAULT_KEYS_PATH, encoding="utf-8") as f:
            keys = json.load(f)
        return keys["backend_token"]
    except (OSError, KeyError, json.JSONDecodeError) as e:
        raise VaultError(f"No se pudo leer el token de Vault ({VAULT_KEYS_PATH}): {e}")


def _request(method: str, path: str, body: dict | None = None):
    url = f"{VAULT_ADDR}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Vault-Token", _token())
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise VaultError(f"{method} {path} -> {e.code}: {e.read().decode()}")
    except urllib.error.URLError as e:
        raise VaultError(f"No se pudo conectar a Vault en {VAULT_ADDR}: {e}")


def health() -> dict:
    """Estado de Vault vía el endpoint no autenticado /v1/sys/health.

    Devuelve {reachable, initialized, sealed, version} — nunca lanza, para
    poder mostrarlo en la UI aunque Vault esté caído.
    """
    url = f"{VAULT_ADDR}/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200"
    try:
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read() or "{}")
        return {
            "reachable": True,
            "initialized": bool(data.get("initialized")),
            "sealed": bool(data.get("sealed")),
            "version": data.get("version"),
        }
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError):
        return {"reachable": False, "initialized": None, "sealed": None, "version": None}


def put_portal_password(portal_id: int, password: str) -> None:
    _request("POST", f"/v1/{VAULT_MOUNT}/data/portals/{portal_id}", body={"data": {"password": password}})


def get_portal_password(portal_id: int) -> str | None:
    result = _request("GET", f"/v1/{VAULT_MOUNT}/data/portals/{portal_id}")
    if not result:
        return None
    return result.get("data", {}).get("data", {}).get("password")


def delete_portal_password(portal_id: int) -> None:
    _request("DELETE", f"/v1/{VAULT_MOUNT}/metadata/portals/{portal_id}")
