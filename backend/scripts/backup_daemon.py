"""Backups cifrados automáticos de la base SQLite de SecureVault.

Solo librería estándar. Corre como un servicio aparte de Docker Compose,
lee la base en modo solo lectura desde el volumen `backend_data` y escribe
respaldos cifrados en `/backups` (montado en ./backups del host — "otro
disco" respecto al volumen de datos, cumpliendo el mínimo de la estrategia
3-2-1). No sube nada a la nube: eso requiere credenciales del operador,
ver README para conectar rclone/aws-cli manualmente sobre esta carpeta.

Cifrado: misma construcción Encrypt-then-MAC con HMAC-SHA256 en modo
contador que se usaba antes para las contraseñas de portal (ver historial),
pero con una clave completamente separada (BACKUP_ENCRYPTION_KEY) — un
atacante que solo comprometa la clave de la app no puede leer los backups,
y viceversa.
"""

import glob
import os
import sqlite3
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.backup_crypto import encrypt_file  # noqa: E402

DB_PATH = os.getenv("DB_PATH", "/app/data/securevault.db")
BACKUP_DIR = os.getenv("BACKUP_DIR", "/backups")
BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")
INTERVAL_SECONDS = int(os.getenv("BACKUP_INTERVAL_SECONDS", str(24 * 60 * 60)))
RETENTION_COUNT = int(os.getenv("BACKUP_RETENTION_COUNT", "14"))


def snapshot_db(tmp_path: str) -> None:
    # sqlite3 backup API: copia consistente aunque el proceso principal esté escribiendo
    src = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    dst = sqlite3.connect(tmp_path)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()


def prune_old_backups() -> None:
    files = sorted(glob.glob(os.path.join(BACKUP_DIR, "securevault-*.enc")))
    excess = len(files) - RETENTION_COUNT
    for old_file in files[:max(excess, 0)]:
        os.remove(old_file)


def run_backup() -> None:
    if not os.path.exists(DB_PATH):
        print(f"[backup] {DB_PATH} no existe todavía, se omite este ciclo", flush=True)
        return

    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    tmp_snapshot = os.path.join(BACKUP_DIR, f".tmp-{timestamp}.db")
    final_path = os.path.join(BACKUP_DIR, f"securevault-{timestamp}.enc")

    try:
        snapshot_db(tmp_snapshot)
        encrypt_file(tmp_snapshot, final_path, BACKUP_ENCRYPTION_KEY)
        size_kb = os.path.getsize(final_path) / 1024
        print(f"[backup] OK: {final_path} ({size_kb:.1f} KB)", flush=True)
    finally:
        if os.path.exists(tmp_snapshot):
            os.remove(tmp_snapshot)

    prune_old_backups()


def main() -> None:
    from app.backup_crypto import require_key
    require_key(BACKUP_ENCRYPTION_KEY)

    # --once: una sola pasada y termina (para un CronJob de OpenShift/k8s en vez
    # del loop). Sale con código != 0 si el backup falla, para que el CronJob
    # lo marque como fallido.
    if "--once" in sys.argv:
        print(f"[backup] Pasada única. Destino: {BACKUP_DIR}", flush=True)
        run_backup()
        return

    print(f"[backup] Iniciando daemon. Intervalo: {INTERVAL_SECONDS}s. Destino: {BACKUP_DIR}", flush=True)
    while True:
        try:
            run_backup()
        except Exception as e:
            print(f"[backup] ERROR: {e}", file=sys.stderr, flush=True)
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
