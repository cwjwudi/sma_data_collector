"""模版/版式保存审计：对比与 15 分钟合并。"""
from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from modules import audit_log
from modules.audit_asset_diff import (
    diff_report_template,
    merge_changes,
    truncate_value,
)
from modules.audit_asset_write import record_asset_save


def _el(eid: str, **kwargs):
    base = {"id": eid, "type": "text", "x": 0, "y": 0, "w": 100, "h": 20, "text": "hi"}
    base.update(kwargs)
    return base


class DiffTest(unittest.TestCase):
    def test_text_change_chinese(self):
        old = {
            "id": "t1",
            "name": "日报表",
            "bodyPages": [[_el("e1", text="月报", name="标题")]],
            "headerElements": [],
            "footerElements": [],
        }
        new = {
            "id": "t1",
            "name": "日报表",
            "bodyPages": [[_el("e1", text="日报", name="标题", fontSize=18)]],
            "headerElements": [],
            "footerElements": [],
        }
        # also change fontSize from default absence
        old["bodyPages"][0][0]["fontSize"] = 14
        d = diff_report_template(old, new)
        self.assertGreaterEqual(d["change_count"], 2)
        fields = {c["field"] for c in d["changes"]}
        self.assertIn("文字内容", fields)
        self.assertIn("字号", fields)
        for c in d["changes"]:
            self.assertFalse(any(k.isascii() and k.isalpha() and k.islower() and c["field"] == k for k in ("text", "fontSize")))
        lines = "\n".join(d["change_lines"])
        self.assertIn("第 1 页", lines)
        self.assertIn("文本", lines)
        self.assertNotIn("PUT", lines)

    def test_no_change_skips_noise_updatedAt(self):
        old = {
            "id": "t1",
            "name": "A",
            "updatedAt": "2020-01-01T00:00:00Z",
            "bodyPages": [[_el("e1")]],
            "headerElements": [],
            "footerElements": [],
        }
        new = {
            "id": "t1",
            "name": "A",
            "updatedAt": "2026-01-01T00:00:00Z",
            "bodyPages": [[_el("e1")]],
            "headerElements": [],
            "footerElements": [],
        }
        d = diff_report_template(old, new)
        self.assertEqual(d["change_count"], 0)
        self.assertEqual(d["changes"], [])

    def test_add_remove_element(self):
        old = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1", name="旧")]],
            "headerElements": [],
            "footerElements": [],
        }
        new = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e2", name="新", type="box")]],
            "headerElements": [],
            "footerElements": [],
        }
        d = diff_report_template(old, new)
        kinds = {c["kind"] for c in d["changes"]}
        self.assertIn("add", kinds)
        self.assertIn("remove", kinds)

    def test_truncate(self):
        s = truncate_value("x" * 100, 80)
        self.assertTrue(s.endswith("…"))
        self.assertLessEqual(len(s), 80)

    def test_merge_keeps_earliest_before(self):
        a = [
            {
                "key": "p|e|text",
                "location": "第 1 页",
                "field": "文字内容",
                "before": "A",
                "after": "B",
                "kind": "modify",
            }
        ]
        b = [
            {
                "key": "p|e|text",
                "location": "第 1 页",
                "field": "文字内容",
                "before": "B",
                "after": "C",
                "kind": "modify",
            }
        ]
        m = merge_changes(a, b)
        self.assertEqual(len(m), 1)
        self.assertEqual(m[0]["before"], "A")
        self.assertEqual(m[0]["after"], "C")

    def test_sql_cell_truncated(self):
        long_sql = "SELECT " + ("col," * 40) + "1"
        old = {
            "id": "t1",
            "name": "A",
            "bodyPages": [
                [
                    {
                        "id": "tb",
                        "type": "table",
                        "name": "产量表",
                        "x": 0,
                        "y": 0,
                        "w": 200,
                        "h": 100,
                        "tableCells": [[{"text": "", "sqlText": "SELECT 1"}]],
                    }
                ]
            ],
            "headerElements": [],
            "footerElements": [],
        }
        new = {
            "id": "t1",
            "name": "A",
            "bodyPages": [
                [
                    {
                        "id": "tb",
                        "type": "table",
                        "name": "产量表",
                        "x": 0,
                        "y": 0,
                        "w": 200,
                        "h": 100,
                        "tableCells": [[{"text": "", "sqlText": long_sql}]],
                    }
                ]
            ],
            "headerElements": [],
            "footerElements": [],
        }
        d = diff_report_template(old, new)
        self.assertGreaterEqual(d["change_count"], 1)
        sql_changes = [c for c in d["changes"] if c.get("field") == "SQL"]
        self.assertTrue(sql_changes)
        self.assertIn("…", sql_changes[0]["after"])
        self.assertIn("单元格", sql_changes[0]["location"])


class CoalesceWriteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_coalesce_within_window(self):
        old = {
            "id": "t1",
            "name": "日报表",
            "bodyPages": [[_el("e1", text="A")]],
            "headerElements": [],
            "footerElements": [],
        }
        mid = {
            "id": "t1",
            "name": "日报表",
            "bodyPages": [[_el("e1", text="B")]],
            "headerElements": [],
            "footerElements": [],
        }
        new = {
            "id": "t1",
            "name": "日报表",
            "bodyPages": [[_el("e1", text="C")]],
            "headerElements": [],
            "footerElements": [],
        }
        e1 = record_asset_save(self.data_dir, kind="template", object_id="t1", old=old, new=mid)
        self.assertIsNotNone(e1)
        e2 = record_asset_save(self.data_dir, kind="template", object_id="t1", old=mid, new=new)
        self.assertIsNotNone(e2)
        listed = audit_log.list_audit(self.data_dir, limit=50)
        saves = [x for x in listed["entries"] if x.get("action") == "template.save"]
        self.assertEqual(len(saves), 1)
        self.assertIn("共 2 次", saves[0]["summary"])
        detail = saves[0]["detail"]
        self.assertEqual(detail["save_count"], 2)
        text_c = [c for c in detail["changes"] if c.get("field") == "文字内容"]
        self.assertEqual(len(text_c), 1)
        self.assertEqual(text_c[0]["before"], "A")
        self.assertEqual(text_c[0]["after"], "C")

    def test_no_change_no_audit(self):
        doc = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1")]],
            "headerElements": [],
            "footerElements": [],
        }
        r = record_asset_save(self.data_dir, kind="template", object_id="t1", old=doc, new=dict(doc))
        self.assertIsNone(r)
        listed = audit_log.list_audit(self.data_dir, limit=50)
        self.assertEqual(listed["total"], 0)

    def test_outside_window_two_rows(self):
        old = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1", text="1")]],
            "headerElements": [],
            "footerElements": [],
        }
        mid = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1", text="2")]],
            "headerElements": [],
            "footerElements": [],
        }
        new = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1", text="3")]],
            "headerElements": [],
            "footerElements": [],
        }
        e1 = record_asset_save(self.data_dir, kind="template", object_id="t1", old=old, new=mid)
        # 把已有记录时间拨到窗口外
        path = audit_log._audit_path(self.data_dir)
        rows = audit_log._read_all_rows(path)
        rows[0]["ts"] = time.time() - 16 * 60
        path.write_text(
            __import__("json").dumps(rows[0], ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        e2 = record_asset_save(self.data_dir, kind="template", object_id="t1", old=mid, new=new)
        self.assertIsNotNone(e1)
        self.assertIsNotNone(e2)
        listed = audit_log.list_audit(self.data_dir, limit=50)
        saves = [x for x in listed["entries"] if x.get("action") == "template.save"]
        self.assertEqual(len(saves), 2)

    def test_fail_does_not_block_coalesce(self):
        old = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1", text="1")]],
            "headerElements": [],
            "footerElements": [],
        }
        mid = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1", text="2")]],
            "headerElements": [],
            "footerElements": [],
        }
        new = {
            "id": "t1",
            "name": "A",
            "bodyPages": [[_el("e1", text="3")]],
            "headerElements": [],
            "footerElements": [],
        }
        record_asset_save(self.data_dir, kind="template", object_id="t1", old=old, new=mid)
        audit_log.append_audit(
            self.data_dir,
            action="template.save",
            result="fail",
            summary="保存报表模版「A」失败：网络中断",
            object_type="template",
            object_id="t1",
        )
        record_asset_save(self.data_dir, kind="template", object_id="t1", old=mid, new=new)
        listed = audit_log.list_audit(self.data_dir, limit=50)
        ok_saves = [
            x
            for x in listed["entries"]
            if x.get("action") == "template.save" and x.get("result") == "ok"
        ]
        fails = [x for x in listed["entries"] if x.get("result") == "fail"]
        self.assertEqual(len(ok_saves), 1)
        self.assertEqual(len(fails), 1)
        self.assertIn("共 2 次", ok_saves[0]["summary"])

    def test_created(self):
        new = {
            "id": "t2",
            "name": "新模版",
            "bodyPages": [[]],
            "headerElements": [],
            "footerElements": [],
        }
        e = record_asset_save(self.data_dir, kind="template", object_id="t2", old=None, new=new)
        self.assertIsNotNone(e)
        self.assertIn("新建并保存", e["summary"])


if __name__ == "__main__":
    unittest.main()
