"""Inicializa/desella Vault y aprovisiona un token de acceso acotado para el backend.

Solo librería estándar (urllib). Si Vault nunca se inicializó, lo inicializa
(secret_shares=1, secret_threshold=1 — un solo operador) y crea la policy +
token para el backend; si ya existe, simplemente lo desella con la clave
guardada.

Dónde se guardan las llaves (`unseal_key`, `root_token`, `backend_token`) lo
decide `KEYS_BACKEND`:
  - `file` (por defecto, docker-compose): /keys/vault-keys.json en un volumen
    montado desde ./vault/keys (fuera de git).
  - `k8s-secret` (OpenShift): un Secret del namespace, escrito vía la API de
    Kubernetes con el token del ServiceAccount del pod. Nombre en
    `KEYS_SECRET_NAME` (default `securevault-vault-keys`), bajo la clave
    `vault-keys.json`. Requiere un Role con get/create/patch sobre secrets.
Quien pueda leer esas llaves puede desellar Vault y leer sus secretos.
"""

import base64
import json
import os
import ssl
import time
import urllib.error
import urllib.request

VAULT_ADDR = os.getenv("VAULT_ADDR", "http://vault:8200")
KEYS_BACKEND = os.getenv("KEYS_BACKEND", "file")
KEYS_PATH = os.getenv("VAULT_KEYS_PATH", "/keys/vault-keys.json")
KEYS_SECRET_NAME = os.getenv("KEYS_SECRET_NAME", "securevault-vault-keys")
KEYS_SECRET_FIELD = "vault-keys.json"
_SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"
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


def _k8s_ctx() -> tuple[str, str, str]:
    with open(f"{_SA_DIR}/namespace", encoding="utf-8") as f:
        namespace = f.read().strip()
    with open(f"{_SA_DIR}/token", encoding="utf-8") as f:
        token = f.read().strip()
    host = os.getenv("KUBERNETES_SERVICE_HOST", "kubernetes.default.svc")
    port = os.getenv("KUBERNETES_SERVICE_PORT", "443")
    return f"https://{host}:{port}", namespace, token


def _k8s_request(method: str, path: str, body: dict | None = None, content_type: str = "application/json") -> tuple[int, dict]:
    api, _, token = _k8s_ctx()
    ctx = ssl.create_default_context(cafile=f"{_SA_DIR}/ca.crt")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{api}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def load_keys() -> dict:
    if KEYS_BACKEND == "k8s-secret":
        _, namespace, _ = _k8s_ctx()
        status, secret = _k8s_request("GET", f"/api/v1/namespaces/{namespace}/secrets/{KEYS_SECRET_NAME}")
        if status == 404:
            return {}
        if status != 200:
            raise RuntimeError(f"No se pudo leer el Secret {KEYS_SECRET_NAME}: {status} {secret}")
        raw = (secret.get("data") or {}).get(KEYS_SECRET_FIELD)
        return json.loads(base64.b64decode(raw)) if raw else {}
    if os.path.exists(KEYS_PATH):
        with open(KEYS_PATH, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_keys(keys: dict) -> None:
    if KEYS_BACKEND == "k8s-secret":
        _, namespace, _ = _k8s_ctx()
        payload = base64.b64encode(json.dumps(keys, indent=2).encode()).decode()
        status, _ = _k8s_request(
            "PATCH",
            f"/api/v1/namespaces/{namespace}/secrets/{KEYS_SECRET_NAME}",
            {"data": {KEYS_SECRET_FIELD: payload}},
            content_type="application/merge-patch+json",
        )
        if status == 404:
            status, resp = _k8s_request(
                "POST",
                f"/api/v1/namespaces/{namespace}/secrets",
                {
                    "apiVersion": "v1",
                    "kind": "Secret",
                    "metadata": {"name": KEYS_SECRET_NAME},
                    "type": "Opaque",
                    "data": {KEYS_SECRET_FIELD: payload},
                },
            )
            if status not in (200, 201):
                raise RuntimeError(f"No se pudo crear el Secret {KEYS_SECRET_NAME}: {status} {resp}")
        elif status != 200:
            raise RuntimeError(f"No se pudo actualizar el Secret {KEYS_SECRET_NAME}: {status}")
        return
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
