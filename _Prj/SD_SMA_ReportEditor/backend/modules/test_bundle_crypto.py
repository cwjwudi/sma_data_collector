"""加密配置备份包：往返、篡改检测、格式识别。"""
from __future__ import annotations

import unittest

from modules import bundle_crypto as bc


class BundleCryptoTest(unittest.TestCase):
    def test_encrypt_decrypt_roundtrip(self) -> None:
        obj = {
            "bundle_version": 3,
            "db_connections": [{"id": "c1", "engine": "mysql"}],
            "templates": [],
            "audit_entries": [{"id": "a1", "ts": 1.0, "action": "x"}],
            "client_prefs": {"ui_prefs": {"tm-view-mode": "list"}},
        }
        blob = bc.encrypt_bundle_obj(obj)
        self.assertTrue(bc.is_encrypted_bundle(blob))
        self.assertTrue(blob.startswith(b"SDRE1\n"))
        self.assertEqual(bc.decrypt_bundle_bytes(blob), obj)

    def test_plaintext_json_not_detected_as_encrypted(self) -> None:
        self.assertFalse(bc.is_encrypted_bundle(b'{"bundle_version": 3}'))

    def test_tampered_bundle_rejected(self) -> None:
        blob = bytearray(bc.encrypt_bundle_obj({"a": 1}))
        blob[-1] ^= 0x01  # 破坏密文末字节
        with self.assertRaises(ValueError):
            bc.decrypt_bundle_bytes(bytes(blob))

    def test_non_bundle_bytes_rejected(self) -> None:
        with self.assertRaises(ValueError):
            bc.decrypt_bundle_bytes(b"not an encrypted bundle")


if __name__ == "__main__":
    unittest.main()
