"""048 support_pack 单元测试。"""

from __future__ import annotations

import io
import json
import time
import zipfile
from pathlib import Path

import pytest

from modules import support_pack as sp


def test_slice_audit_fail_first_and_cap():
    now = time.time()
    entries = []
    for i in range(10):
        entries.append({"ts": now - 60 - i, "action": "export.manual_pdf", "result": "ok", "id": f"ok{i}"})
    for i in range(3):
        entries.append(
            {
                "ts": now - 10 + i,  # fail0 oldest among fails, fail2 newest
                "action": "export.manual_pdf",
                "result": "fail",
                "id": f"fail{i}",
                "object_id": f"tmpl-{i}",
            }
        )
    # 8 天前应被丢掉
    entries.append({"ts": now - 9 * 86400, "action": "export.manual_pdf", "result": "fail", "id": "old"})
    sliced = sp.slice_audit_entries(entries, now=now)
    assert all(e["id"] != "old" for e in sliced)
    assert sliced[0]["result"] == "fail"
    assert {e["id"] for e in sliced[:3]} == {"fail0", "fail1", "fail2"}
    assert sliced[0]["id"] == "fail2"


def test_failed_template_ids_and_connection_skeleton():
    now = time.time()
    entries = [
        {
            "ts": now,
            "action": "export.manual_pdf",
            "result": "fail",
            "object_id": "aaa",
            "detail": {"filePath": "/tmp/a.pdf"},
        },
        {"ts": now, "action": "template.save", "result": "fail", "object_id": "bbb"},
        {
            "ts": now,
            "action": "export.auto_pdf",
            "result": "fail",
            "object_id": "aaa",
        },
    ]
    assert sp.failed_template_ids_from_audit(entries) == ["aaa"]
    sk = sp.connection_skeleton(
        [{"id": "d1", "name": "db", "host": "h", "password": "secret", "password_enc": "x"}],
        [{"id": "o1", "endpoint": "opc.tcp://x", "password_enc": "y"}],
    )
    assert "password" not in sk["db_connections"][0]
    assert "password_enc" not in sk["db_connections"][0]
    assert sk["db_connections"][0]["has_password"] is True
    assert sk["opcua_servers"][0]["endpoint"] == "opc.tcp://x"


def test_build_zip_markdown_and_no_secrets(tmp_path: Path):
    pdf = tmp_path / "failed-report.pdf"
    pdf.write_bytes(b"%PDF-1.4 fake")
    now = time.time()
    audit = [
        {
            "ts": now,
            "action": "export.manual_pdf",
            "result": "fail",
            "object_id": "t1",
            "summary": "boom",
            "detail": {"filePath": str(pdf), "password": "should-strip-in-prefs-not-here"},
        }
    ]
    zip_bytes, manifest = sp.build_support_pack_zip(
        title="SIGSEGV",
        symptom="闪退",
        expected="不崩",
        steps="1. 导出",
        occurred_at="2026-08-08",
        env={"appVersion": "0.3.146", "platform": "darwin"},
        templates_raw=[
            {
                "id": "t1",
                "name": "冒烟",
                "password": "nope",
                "elements": [],
            }
        ],
        generator_prefs={"auto": {"bindings": []}, "llm_api_key": "SECRET"},
        connections=sp.connection_skeleton(
            [{"id": "d", "host": "127.0.0.1", "password_enc": "enc"}],
            [],
        ),
        audit_entries=audit,
        include_failed_pdf=True,
        pdf_paths=[str(pdf)],
        app_version="0.3.146",
    )
    assert manifest["auditCount"] >= 1
    assert manifest["templateIds"] == ["t1"]
    assert any(a.endswith(".pdf") for a in manifest["attachments"])
    sp.assert_no_sensitive_in_zip(zip_bytes)
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = set(zf.namelist())
        assert "ISSUE.md" in names
        assert "AGENT_PROMPT.md" in names
        assert "ENV.md" in names
        assert "manifest.json" in names
        assert "data/generator-prefs.json" in names
        assert "data/connections-skeleton.json" in names
        assert "data/audit.jsonl" in names
        assert "data/templates/t1.json" in names
        issue = zf.read("ISSUE.md").decode("utf-8")
        assert "SIGSEGV" in issue
        prefs = json.loads(zf.read("data/generator-prefs.json"))
        assert "llm_api_key" not in prefs
        tmpl = json.loads(zf.read("data/templates/t1.json"))
        assert "password" not in tmpl


def test_include_pdf_off_skips_attachment(tmp_path: Path):
    pdf = tmp_path / "x.pdf"
    pdf.write_bytes(b"%PDF")
    zip_bytes, manifest = sp.build_support_pack_zip(
        include_failed_pdf=False,
        pdf_paths=[str(pdf)],
        templates_raw=[],
        audit_entries=[],
    )
    assert manifest["attachments"] == []
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        assert not any(n.startswith("attachments/") for n in zf.namelist())
