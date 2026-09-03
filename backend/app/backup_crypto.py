"""Cifrado de los backups de la base SQLite. Solo librería estándar.

Construcción Encrypt-then-MAC con HMAC-SHA256 en modo contador y una clave
propia (`BACKUP_ENCRYPTION_KEY`), separada de la de la app. Formato del
archivo `.enc`:

    [ nonce: 16 bytes ][ tag HMAC: 32 bytes ][ ciphertext... ]

Antes había tres copias de esta lógica (`backup_daemon.py`,
`scripts/restore_backup.py` y el endpoint de restauración). Vive acá una
sola vez: el keystream se deriva por **offset absoluto**, no por número de
chunk — reusar el offset por chunk fue un bug real que costó encontrar.
"""

import hashlib
import hmac
import os
import secrets

CHUNK_SIZE = 64 * 1024
_UNSAFE_KEY_MARKERS = ("change-this", "cambiar_esta", "cambiar-esta", "reemplazar")


def require_key(key: str) -> str:
    if len(key) < 32 or any(marker in key.lower() for marker in _UNSAFE_KEY_MARKERS):
        raise RuntimeError("BACKUP_ENCRYPTION_KEY debe configurarse con un valor aleatorio de al menos 32 caracteres")
    return key


def _keystream_at(key: bytes, offset: int, length: int) -> bytes:
    """Keystream determinista para el rango [offset, offset+length), sin
    reutilizar bytes entre llamadas siempre que offset avance monótonamente
    — necesario para cifrar/descifrar en streaming por chunks."""
    block_size = hashlib.sha256().digest_size
    block_index = offset // block_size
    skip = offset % block_size
    out = b""
    counter = block_index
    while len(out) < skip + length:
        out += hmac.new(key, counter.to_bytes(8, "big"), hashlib.sha256).digest()
        counter += 1
    return out[skip:skip + length]


def _derived_keys(master_key: bytes, nonce: bytes) -> tuple[bytes, bytes]:
    enc_key = hmac.new(master_key, nonce + b"enc", hashlib.sha256).digest()
    mac_key = hmac.new(master_key, nonce + b"mac", hashlib.sha256).digest()
    return enc_key, mac_key


def encrypt_file(src_path: str, dst_path: str, key: str) -> None:
    master_key = hashlib.sha256(key.encode()).digest()
    nonce = secrets.token_bytes(16)
    enc_key, mac_key = _derived_keys(master_key, nonce)

    mac = hmac.new(mac_key, nonce, hashlib.sha256)
    offset = 0
    with open(src_path, "rb") as src, open(dst_path, "wb") as dst:
        dst.write(nonce)
        dst.write(b"\x00" * 32)  # placeholder del tag, se rellena al final
        while chunk := src.read(CHUNK_SIZE):
            ks = _keystream_at(enc_key, offset, len(chunk))
            ct = bytes(a ^ b for a, b in zip(chunk, ks))
            offset += len(chunk)
            mac.update(ct)
            dst.write(ct)
        dst.seek(16)
        dst.write(mac.digest())


def decrypt_file(src_path: str, dst_path: str, key: str) -> None:
    """Descifra `src_path` en `dst_path`. Lanza ValueError si el tag HMAC no
    valida (clave incorrecta o archivo corrupto/manipulado); en ese caso
    borra el destino a medio escribir."""
    master_key = hashlib.sha256(key.encode()).digest()
    with open(src_path, "rb") as src:
        nonce = src.read(16)
        expected_tag = src.read(32)
        if len(nonce) != 16 or len(expected_tag) != 32:
            raise ValueError("El backup está truncado o no tiene el formato esperado")
        enc_key, mac_key = _derived_keys(master_key, nonce)
        mac = hmac.new(mac_key, nonce, hashlib.sha256)

        offset = 0
        with open(dst_path, "wb") as dst:
            while chunk := src.read(CHUNK_SIZE):
                mac.update(chunk)
                ks = _keystream_at(enc_key, offset, len(chunk))
                dst.write(bytes(a ^ b for a, b in zip(chunk, ks)))
                offset += len(chunk)

    if not hmac.compare_digest(mac.digest(), expected_tag):
        os.remove(dst_path)
        raise ValueError("El backup está corrupto o la clave de cifrado no coincide (BACKUP_ENCRYPTION_KEY)")
