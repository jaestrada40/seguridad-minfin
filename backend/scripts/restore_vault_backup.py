"""Restaura un backup cifrado del storage de Vault generado por vault_backup_daemon.py.

Uso:
    python scripts/restore_vault_backup.py /vault-backups/vault-20260904-030000.tar.enc /vault/data

IMPORTANTE:
  - Vault debe estar DETENIDO (pod escalado a 0, o contenedor parado) antes de
    restaurar — se sobrescribe el directorio de datos mientras el proceso lo
    tiene abierto y corrompe el storage.
  - El directorio de destino se reemplaza por completo con el contenido del
    backup. Si hay datos ahí que no querés perder, movelos a otro lado antes.
  - La `unseal_key` del backup restaurado es la que estaba vigente cuando se
    tomó ese backup — si desde entonces rotaste la clave, el Secret
    `securevault-vault-keys` actual ya no la desella. Guardá también una copia
    del `vault-keys.json` de esa misma fecha.
"""

import os
import shutil
import sys
import tarfile
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.backup_crypto import decrypt_file, require_key  # noqa: E402

BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "")


def main() -> None:
    require_key(BACKUP_ENCRYPTION_KEY)
    if len(sys.argv) != 3:
        print("Uso: python restore_vault_backup.py <vault-backup.tar.enc> <directorio /vault/data>", file=sys.stderr)
        sys.exit(1)
    src, data_dir = sys.argv[1], sys.argv[2]

    with tempfile.TemporaryDirectory() as tmp:
        tmp_tar = os.path.join(tmp, "vault-data.tar")
        decrypt_file(src, tmp_tar, BACKUP_ENCRYPTION_KEY)

        extract_dir = os.path.join(tmp, "extracted")
        with tarfile.open(tmp_tar) as tar:
            tar.extractall(extract_dir, filter="data")

        extracted_data = os.path.join(extract_dir, "data")
        if not os.path.isdir(extracted_data):
            print("El backup no contiene el directorio 'data' esperado", file=sys.stderr)
            sys.exit(1)

        if os.path.isdir(data_dir):
            shutil.rmtree(data_dir)
        shutil.move(extracted_data, data_dir)

    print(f"Restaurado correctamente en {data_dir}. Iniciá Vault y desellalo con la unseal_key de esa fecha.")


if __name__ == "__main__":
    main()
