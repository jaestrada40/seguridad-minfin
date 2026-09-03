"""Inicializa/desella Vault y aprovisiona un token de acceso acotado para el backend.

Solo librería estándar (urllib). Se ejecuta como un servicio "one-shot" de
Docker Compose en cada `docker compose up`: si Vault nunca se inicializó, lo
inicializa (secret_shares=1, secret_threshold=1 — un solo operador local) y
crea la policy + token para el backend; si ya existe, simplemente lo desella
con la clave guardada. Las claves quedan en /keys/vault-keys.json, montado
desde el host en ./vault/keys (fuera de git) — quien tenga acceso a esa
carpeta puede desellar Vault, así que se documenta como sensible.
"""

import json
import os
import time
import urllib.error
import urllib.request

VAULT_ADDR = os.getenv("VAULT_ADDR", "http://vault:8200")
KEYS_PATH = "/keys/vault-keys.json"
BACKEND_POLICY = "securevault-backend"
BACKEND_POLICY_HCL = """
path "secret/data/portals/*" {
  capabilities = ["create", "read", "update", "delete"]
}
path "secret/metadata/portals/*" {
  capabilities = ["read", "list", "delete"]
}
"""


def vault_request(method: str, path: str, token: str | None = None, body: dict | None = None) -> dict:
    url = f"{VAULT_ADDR}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Vault-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()}")


def wait_for_vault() -> None:
    for _ in range(60):
        try:
            urllib.request.urlopen(f"{VAULT_ADDR}/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200", timeout=3)
            return
        except Exception:
            time.sleep(2)
    raise RuntimeError("Vault no respondió a tiempo")


def load_keys() -> dict:
    if os.path.exists(KEYS_PATH):
        with open(KEYS_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_keys(keys: dict) -> None:
    os.makedirs(os.path.dirname(KEYS_PATH), exist_ok=True)
    with open(KEYS_PATH, "w", encoding="utf-8") as f:
        json.dump(keys, f, indent=2)
    os.chmod(KEYS_PATH, 0o600)


def main() -> None:
    wait_for_vault()
    health = vault_request("GET", "/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200")
    keys = load_keys()

    if not health.get("initialized"):
        print("Vault no inicializado. Inicializando con 1 clave de unseal (operador único)...")
        init = vault_request("PUT", "/v1/sys/init", body={"secret_shares": 1, "secret_threshold": 1})
        keys["unseal_key"] = init["keys"][0]
        keys["root_token"] = init["root_token"]
        save_keys(keys)
        print("Vault inicializado. Guarda una copia de vault/keys/vault-keys.json en un lugar seguro y separado.")

    health = vault_request("GET", "/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200")
    if health.get("sealed"):
        print("Vault sellado. Desellando...")
        vault_request("PUT", "/v1/sys/unseal", body={"key": keys["unseal_key"]})

    root_token = keys["root_token"]

    if "backend_token" not in keys:
        print("Aprovisionando policy y token acotado para el backend...")
        vault_request(
            "POST",
            "/v1/sys/mounts/secret",
            token=root_token,
            body={"type": "kv", "options": {"version": "2"}},
        )
        vault_request(
            "PUT",
            f"/v1/sys/policies/acl/{BACKEND_POLICY}",
            token=root_token,
            body={"policy": BACKEND_POLICY_HCL},
        )
        token_resp = vault_request(
            "POST",
            "/v1/auth/token/create",
            token=root_token,
            body={"policies": [BACKEND_POLICY], "ttl": "768h", "renewable": True, "display_name": "securevault-backend"},
        )
        keys["backend_token"] = token_resp["auth"]["client_token"]
        save_keys(keys)
        print("Token del backend creado.")
    else:
        print("Token del backend ya existía, reutilizando.")

    print("Bootstrap de Vault completo.")


if __name__ == "__main__":
    main()
