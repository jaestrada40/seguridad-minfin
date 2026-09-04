"""Backups cifrados automáticos del storage de Vault (`storage "file"`).

Solo librería estándar. Corre como sidecar dentro del pod de Vault (comparte
el mismo volumen `data`, montado acá de solo lectura) y escribe los `.tar.enc`
en otro PVC aparte — igual estrategia 3-2-1 que `backup_daemon.py` para la
SQLite, pero para las contraseñas de portal.

Advertencia: a diferencia de la SQLite (que usa la API `sqlite3.backup()`
para una copia consistente aunque el proceso siga escribiendo), Vault con
storage "file" no ofrece una forma de tomar un snapshot en caliente — este
script simplemente empaqueta el directorio con `tarfile` mientras Vault sigue
corriendo. El backend de Vault escribe/reescribe un archivo por secreto de
forma casi atómica, así que el riesgo de capturar un archivo a medio escribir
es bajo pero no nulo. Si se necesita una garantía fuerte, la alternativa es
migrar Vault a `storage "raft"` y usar `vault operator raft snapshot save`.
"""

import os
import sys
import tarfile
import time
import glob

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.backup_crypto import encrypt_file, require_key  # noqa: E402

VAULT_DATA_DIR = os.getenv("VAULT_DATA_DIR", "/vault/data")
BACKUP_DIR = os.getenv("BACKUP_DIR", "/vault-backups")
BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")
INTERVAL_SECONDS = int(os.getenv("BACKUP_INTERVAL_SECONDS", str(24 * 60 * 60)))
RETENTION_COUNT = int(os.getenv("BACKUP_RETENTION_COUNT", "14"))


def snapshot_vault_dir(tmp_path: str) -> None:
    with tarfile.open(tmp_path, "w") as tar:
        tar.add(VAULT_DATA_DIR, arcname="data")


def prune_old_backups() -> None:
    files = sorted(glob.glob(os.path.join(BACKUP_DIR, "vault-*.tar.enc")))
    excess = len(files) - RETENTION_COUNT
    for old_file in files[:max(excess, 0)]:
        os.remove(old_file)


def run_backup() -> None:
    if not os.path.isdir(VAULT_DATA_DIR):
        print(f"[vault-backup] {VAULT_DATA_DIR} no existe todavía, se omite este ciclo", flush=True)
        return

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    tmp_tar = os.path.join(BACKUP_DIR, f".tmp-{timestamp}.tar")
    final_path = os.path.join(BACKUP_DIR, f"vault-{timestamp}.tar.enc")

    try:
        snapshot_vault_dir(tmp_tar)
        encrypt_file(tmp_tar, final_path, BACKUP_ENCRYPTION_KEY)
        size_kb = os.path.getsize(final_path) / 1024
        print(f"[vault-backup] OK: {final_path} ({size_kb:.1f} KB)", flush=True)
    finally:
        if os.path.exists(tmp_tar):
            os.remove(tmp_tar)

    prune_old_backups()


def main() -> None:
    require_key(BACKUP_ENCRYPTION_KEY)

    if "--once" in sys.argv:
        print(f"[vault-backup] Pasada única. Origen: {VAULT_DATA_DIR}. Destino: {BACKUP_DIR}", flush=True)
        run_backup()
        return

    print(f"[vault-backup] Iniciando daemon. Intervalo: {INTERVAL_SECONDS}s. Origen: {VAULT_DATA_DIR}. Destino: {BACKUP_DIR}", flush=True)
    while True:
        try:
            run_backup()
        except Exception as e:
            print(f"[vault-backup] ERROR: {e}", file=sys.stderr, flush=True)
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
