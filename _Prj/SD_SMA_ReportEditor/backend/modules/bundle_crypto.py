"""配置备份包加解密。

使用**内置固定密钥**（Fernet）对完整配置包整体加密，得到不可读的二进制备份文件（`.rebak`）：

- 换机导入无需口令：密钥由程序内置常量派生，任何安装了本软件的机器都能解密导入。
- 防篡改：Fernet 为带认证的对称加密，任何对密文的修改都会导致解密失败，从而拒绝导入。

注意：内置密钥仅用于「让备份不是明文、避免被随手编辑」，并非对抗掌握源码者的强安全边界。
真正的机密（数据库/OPC UA 口令）在 config.json 内仍另用本机随机 Fernet 密钥加密（见 modules/secrets.py）。
"""
from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

MAGIC = b"SDRE1"
_SEP = b"\n"

# 内置固定口令，派生出稳定的 Fernet 密钥（SHA256 -> 32 bytes -> urlsafe b64）。
_APP_SECRET = b"SD_SMA_ReportEditor::config-bundle-key::v1"


def _bundle_key() -> bytes:
    return base64.urlsafe_b64encode(hashlib.sha256(_APP_SECRET).digest())


def _fernet() -> Fernet:
    return Fernet(_bundle_key())


def is_encrypted_bundle(raw: bytes) -> bool:
    """判断字节内容是否为本软件导出的加密备份（按魔术头）。"""
    if not isinstance(raw, (bytes, bytearray)):
        return False
    return bytes(raw).startswith(MAGIC + _SEP)


def encrypt_bundle_obj(obj: dict[str, Any]) -> bytes:
    """把配置包对象加密为 `.rebak` 字节（魔术头 + Fernet 密文）。"""
    plaintext = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    token = _fernet().encrypt(plaintext)
    return MAGIC + _SEP + token


def decrypt_bundle_bytes(raw: bytes) -> dict[str, Any]:
    """解密 `.rebak` 字节为配置包对象；损坏/被改动/非本软件文件时抛出 ValueError。"""
    if not is_encrypted_bundle(raw):
        raise ValueError("不是有效的加密备份文件。")
    token = bytes(raw)[len(MAGIC) + len(_SEP):]
    try:
        plaintext = _fernet().decrypt(token)
    except InvalidToken as e:
        raise ValueError("备份文件已损坏或被修改，无法导入（完整性校验未通过）。") from e
    try:
        obj = json.loads(plaintext.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ValueError("备份内容解析失败。") from e
    if not isinstance(obj, dict):
        raise ValueError("备份内容格式不正确。")
    return obj
