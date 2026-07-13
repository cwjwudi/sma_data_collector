"""CORS 策略：不得 wildcard + credentials 同时存在，且只放行实际来源。

前端实际来源：
- Electron 生产（file:// 加载）→ 请求头 ``Origin: null``
- Vite 开发服务器 ``http://localhost:5173`` / ``http://127.0.0.1:5173``
陌生来源（如 http://evil.example）必须被拒绝（不回显）。
"""
from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

import main
from main import _cors_allow_origins


class CorsOriginListTest(unittest.TestCase):
    def test_wildcard_not_present(self) -> None:
        self.assertNotIn("*", _cors_allow_origins())

    def test_electron_and_dev_origins_present(self) -> None:
        origins = _cors_allow_origins()
        self.assertIn("null", origins)
        self.assertIn("http://localhost:5173", origins)


class CorsResponseHeaderTest(unittest.TestCase):
    def setUp(self) -> None:
        # 不用 with 上下文，避免触发 lifespan 副作用（建目录/写信标）
        self.client = TestClient(main.app)

    def test_electron_null_origin_allowed(self) -> None:
        r = self.client.get("/health", headers={"Origin": "null"})
        self.assertEqual(r.headers.get("access-control-allow-origin"), "null")

    def test_dev_origin_allowed(self) -> None:
        origin = "http://localhost:5173"
        r = self.client.get("/health", headers={"Origin": origin})
        self.assertEqual(r.headers.get("access-control-allow-origin"), origin)

    def test_unknown_origin_not_echoed(self) -> None:
        r = self.client.get("/health", headers={"Origin": "http://evil.example"})
        self.assertNotEqual(
            r.headers.get("access-control-allow-origin"), "http://evil.example"
        )

    def test_no_wildcard_with_credentials(self) -> None:
        r = self.client.get("/health", headers={"Origin": "http://evil.example"})
        acao = r.headers.get("access-control-allow-origin")
        acac = r.headers.get("access-control-allow-credentials")
        # 绝不允许 * 与 credentials 同时出现
        self.assertFalse(acao == "*" and acac == "true")


if __name__ == "__main__":
    unittest.main()
