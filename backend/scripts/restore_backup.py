"""Restaura un backup cifrado generado por backup_daemon.py.

Uso (desde dentro del contenedor backend, o localmente con Python 3.12+):
    python scripts/restore_backup.py /backups/securevault-20260902-120000.enc /app/data/securevault.db

Sobrescribe el archivo de destino — hacer una copia de seguridad de lo
que haya ahí antes de restaurar sobre una base en uso.
"""

import hashlib
import hmac
import os
import sys

BACKUP_ENCRYPTION_KEY = os.getenv("BACKUP_ENCRYPTION_KEY", "change-this-local-backup-key")
CHUNK_SIZE = 64 * 1024


def _keystream_at(key: bytes, offset: int, length: int) -> bytes:
    block_size = hashlib.sha256().digest_size
    block_index = offset // block_size
    skip = offset % block_size
    out = b""
    counter = block_index
    while len(out) < skip + length:
        out += hmac.new(key, counter.to_bytes(8, "big"), hashlib.sha256).digest()
        counter += 1
    return out[skip:skip + length]


def decrypt_file(src_path: str, dst_path: str) -> None:
    master_key = hashlib.sha256(BACKUP_ENCRYPTION_KEY.encode()).digest()
    with open(src_path, "rb") as src:
        nonce = src.read(16)
        expected_tag = src.read(32)
        enc_key = hmac.new(master_key, nonce + b"enc", hashlib.sha256).digest()
        mac_key = hmac.new(master_key, nonce + b"mac", hashlib.sha256).digest()
        mac = hmac.new(mac_key, nonce, hashlib.sha256)

        offset = 0
        with open(dst_path, "wb") as dst:
            while True:
                chunk = src.read(CHUNK_SIZE)
                if not chunk:
                    break
                mac.update(chunk)
                ks = _keystream_at(enc_key, offset, len(chunk))
                pt = bytes(a ^ b for a, b in zip(chunk, ks))
                offset += len(chunk)
                dst.write(pt)

    if not hmac.compare_digest(mac.digest(), expected_tag):
        os.remove(dst_path)
        raise ValueError("El backup está corrupto o la clave de cifrado no coincide (BACKUP_ENCRYPTION_KEY)")


def main() -> None:
    if len(sys.argv) != 3:
        print("Uso: python restore_backup.py <archivo.enc> <destino.db>", file=sys.stderr)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    decrypt_file(src, dst)
    print(f"Restaurado correctamente en {dst}")


if __name__ == "__main__":
    main()
