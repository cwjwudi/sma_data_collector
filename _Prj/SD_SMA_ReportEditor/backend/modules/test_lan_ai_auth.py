"""局域网应用内 AI 鉴权守卫。"""
from __future__ import annotations

import unittest
from unittest import mock

from modules import ai_config


class LocalOrLanAiAuthTest(unittest.TestCase):
    def test_loopback_ok(self):
        self.assertIsNone(ai_config.local_or_lan_ai_auth_error("127.0.0.1", None))
        self.assertIsNone(ai_config.local_or_lan_ai_auth_error("::1", ""))
        self.assertIsNone(ai_config.local_or_lan_ai_auth_error("localhost", "x"))

    def test_lan_switch_off(self):
        settings = ai_config.normalize_ai_settings({"allow_lan_access": False})
        err = ai_config.local_or_lan_ai_auth_error("192.168.1.10", "any", settings)
        self.assertIsNotNone(err)
        self.assertIn("允许局域网", err or "")

    def test_lan_switch_on_needs_token(self):
        settings = ai_config.normalize_ai_settings({"allow_lan_access": True})
        with mock.patch.object(ai_config, "verify_agent_token", side_effect=lambda t, s=None: t == "secret-token-xyz"):
            err = ai_config.local_or_lan_ai_auth_error("192.168.1.10", None, settings)
            self.assertIsNotNone(err)
            self.assertIn("Token", err or "")
            self.assertIsNone(
                ai_config.local_or_lan_ai_auth_error("192.168.1.10", "secret-token-xyz", settings)
            )
            err2 = ai_config.local_or_lan_ai_auth_error("192.168.1.10", "wrong", settings)
            self.assertIsNotNone(err2)


if __name__ == "__main__":
    unittest.main()
