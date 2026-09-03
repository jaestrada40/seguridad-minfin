"""Restaura un backup cifrado generado por backup_daemon.py.

Uso (desde dentro del contenedor backend, o localmente con Python 3.12+):
    python scripts/restore_backup.py /backups/securevault-20260902-120000.enc /app/data/securevault.db

Sobrescribe el archivo de destino — hacer una copia de seguridad de lo
que haya ahí antes de restaurar sobre una base en uso. Desde la UI hay
un flujo equivalente en Configuración (POST /api/backups/restore) que
además guarda una copia previa automática.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.backup_crypto import decrypt_file, require_key  # noqa: E402

BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")


def main() -> None:
    require_key(BACKUP_ENCRYPTION_KEY)
    if len(sys.argv) != 3:
        print("Uso: python restore_backup.py <archivo.enc> <destino.db>", file=sys.stderr)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    decrypt_file(src, dst, BACKUP_ENCRYPTION_KEY)
    print(f"Restaurado correctamente en {dst}")


if __name__ == "__main__":
    main()
