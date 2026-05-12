"""密码字段加密（存储于 config.json 中的 *_enc 字段）。"""
from __future__ import annotations

import base64
from pathlib import Path

from cryptography.fernet import Fernet


def _load_or_create_key(key_file: Path) -> bytes:
    key_file.parent.mkdir(parents=True, exist_ok=True)
    if key_file.exists():
        return key_file.read_bytes().strip()
    key = Fernet.generate_key()
    key_file.write_bytes(key)
    key_file.chmod(0o600)
    return key


def get_fernet(data_dir: Path) -> Fernet:
    key = _load_or_create_key(data_dir / ".report_editor_fernet.key")
    return Fernet(key)


def encrypt_secret(data_dir: Path, plain: str | None) -> str | None:
    if plain is None or plain == "":
        return None
    f = get_fernet(data_dir)
    return f.encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_secret(data_dir: Path, token: str | None) -> str:
    if not token:
        return ""
    f = get_fernet(data_dir)
    return f.decrypt(token.encode("ascii")).decode("utf-8")
