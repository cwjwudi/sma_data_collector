"""配置包 v3：审计字段校验与识别。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from modules import config_bundle as cb
from modules import json_head_scan as jhs


class ConfigBundleV3Test(unittest.TestCase):
    def test_bundle_version_is_3(self) -> None:
        self.assertEqual(cb.BUNDLE_VERSION, 3)

    def test_validate_accepts_audit_entries(self) -> None:
        data = cb.validate_bundle_payload(
            {
                "bundle_version": 3,
                "db_connections": [],
                "opcua_servers": [],
                "templates": [],
                "layout_presets": [],
                "signature_assets": [],
                "audit_entries": [{"id": "a1", "ts": 1.0, "action": "x"}],
            }
        )
        self.assertEqual(len(data["audit_entries"]), 1)

    def test_validate_defaults_missing_audit_entries(self) -> None:
        data = cb.validate_bundle_payload(
            {"bundle_version": 3, "db_connections": [], "opcua_servers": []}
        )
        self.assertEqual(data["audit_entries"], [])

    def test_is_bundle_payload_detects_audit_only(self) -> None:
        self.assertTrue(cb.is_bundle_payload({"audit_entries": []}))
        self.assertTrue(cb.is_bundle_payload({"bundle_version": 2}))

    def test_looks_like_template_summary_payload(self) -> None:
        self.assertTrue(
            cb._looks_like_template_summary_payload(
                {
                    "id": "a",
                    "name": "n",
                    "updatedAt": "t",
                    "paperKind": "A4",
                    "orientation": "portrait",
                }
            )
        )
        self.assertFalse(
            cb._looks_like_template_summary_payload(
                {
                    "id": "a",
                    "name": "n",
                    "updatedAt": "t",
                    "paperKind": "A4",
                    "orientation": "portrait",
                    "layoutPresetId": "lp1",
                }
            )
        )
        self.assertFalse(
            cb._looks_like_template_summary_payload(
                {"id": "a", "name": "n", "schemaVersion": 4, "elements": []}
            )
        )

    def test_dedupe_templates_prefer_full_skips_meta(self) -> None:
        """回归：旧备份把 *.meta.json 摘要打进 templates[]，导入后覆盖完整模版导致版式引用丢失。"""
        full = {
            "id": "t1",
            "name": "报警信息报表",
            "updatedAt": "2026-05-19T04:53:48.000Z",
            "paperKind": "A4",
            "orientation": "portrait",
            "schemaVersion": 4,
            "layoutPresetId": "body-1",
            "coverLayoutPresetId": "cover-1",
            "backLayoutPresetId": "back-1",
            "elements": [],
            "bodyPages": [[]],
            "layoutSnapshot": {},
        }
        meta = {
            "id": "t1",
            "name": "报警信息报表",
            "updatedAt": "2026-05-19T04:53:48.000Z",
            "paperKind": "A4",
            "orientation": "portrait",
        }
        out = cb._dedupe_templates_prefer_full([full, meta])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["layoutPresetId"], "body-1")
        self.assertEqual(out[0]["coverLayoutPresetId"], "cover-1")
        self.assertEqual(out[0]["backLayoutPresetId"], "back-1")

    def test_load_json_files_skips_meta_sidecar(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "t1.json").write_text(
                '{"id":"t1","name":"full","schemaVersion":4,"layoutPresetId":"lp"}',
                encoding="utf-8",
            )
            (root / "t1.meta.json").write_text(
                '{"id":"t1","name":"full","updatedAt":"t","paperKind":"A4","orientation":"portrait"}',
                encoding="utf-8",
            )
            loaded = cb._load_json_files(root)
            self.assertEqual(len(loaded), 1)
            self.assertEqual(loaded[0]["layoutPresetId"], "lp")

    def test_validate_bundle_strips_meta_summaries(self) -> None:
        data = cb.validate_bundle_payload(
            {
                "bundle_version": 3,
                "db_connections": [],
                "opcua_servers": [],
                "templates": [
                    {
                        "id": "t1",
                        "name": "报警信息报表",
                        "updatedAt": "t",
                        "paperKind": "A4",
                        "orientation": "portrait",
                        "schemaVersion": 4,
                        "layoutPresetId": "body-1",
                        "elements": [],
                    },
                    {
                        "id": "t1",
                        "name": "报警信息报表",
                        "updatedAt": "t",
                        "paperKind": "A4",
                        "orientation": "portrait",
                    },
                ],
                "layout_presets": [],
                "signature_assets": [],
            }
        )
        self.assertEqual(len(data["templates"]), 1)
        self.assertEqual(data["templates"][0]["layoutPresetId"], "body-1")


class JsonHeadScanTest(unittest.TestCase):
    def test_extract_top_level_string(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.json"
            doc = {
                "schemaVersion": 4,
                "id": "tpl-1",
                "name": "现场日报",
                "updatedAt": "2026-07-06",
                "elements": [{"id": "nested-id", "type": "image"}],
                "paperKind": "A3",
            }
            p.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
            head = jhs.read_head(p)
            self.assertEqual(jhs.extract_string(head, "id"), "tpl-1")  # 顶层 id 先于嵌套 id
            self.assertEqual(jhs.extract_string(head, "name"), "现场日报")
            self.assertEqual(jhs.extract_string(head, "updatedAt"), "2026-07-06")
            self.assertEqual(jhs.extract_string(head, "paperKind"), "A3")


if __name__ == "__main__":
    unittest.main()
