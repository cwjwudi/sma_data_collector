"""Regression: sized DB/table options must never become '[object Object]'."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main

ROOT = Path(__file__).resolve().parents[1]
ADMIN_JS = ROOT / "app" / "static" / "admin.js"


def _extract_admin_helpers() -> str:
    text = ADMIN_JS.read_text(encoding="utf-8")
    names = (
        "coerceIdentName",
        "formatBytes",
        "sizedLabel",
        "normalizeSizedItems",
        "appendOption",
    )
    chunks: list[str] = []
    for name in names:
        match = re.search(
            rf"function {name}\(.*?\n\}}",
            text,
            flags=re.DOTALL,
        )
        assert match, f"helper {name} not found in admin.js"
        chunks.append(match.group(0))
    return "\n".join(chunks)


def test_admin_js_helpers_reject_object_object_option_values() -> None:
    helpers = _extract_admin_helpers()
    script = f"""
{helpers}

globalThis.document = {{
  createElement(tag) {{
    if (tag !== 'option') throw new Error('unexpected tag ' + tag);
    return {{ value: '', textContent: '' }};
  }},
}};

function makeSelect() {{
  return {{
    options: [],
    appendChild(op) {{ this.options.push(op); }},
  }};
}}

const apiDatabases = [
  {{ name: 'prod_db', size_bytes: 1048576 }},
  {{ name: 'test_db', size_bytes: 2048 }},
];

// Legacy bug: passing the whole object as option value.
const broken = makeSelect();
for (const item of apiDatabases) {{
  const op = {{ value: '', textContent: '' }};
  op.value = item; // browser coerces to [object Object]
  op.textContent = String(item);
  broken.options.push(op);
}}
if (!broken.options.every(op => String(op.value) === '[object Object]')) {{
  throw new Error('expected baseline object coercion');
}}

const items = normalizeSizedItems(apiDatabases);
const fixed = makeSelect();
for (const item of items) appendOption(fixed, item, sizedLabel(item.name, item.size_bytes));

if (fixed.options.length !== 2) throw new Error('expected 2 options, got ' + fixed.options.length);
for (const op of fixed.options) {{
  if (String(op.value).includes('object Object')) {{
    throw new Error('option value leaked object: ' + op.value);
  }}
  if (!/^[A-Za-z0-9_]+$/.test(op.value)) {{
    throw new Error('invalid option value: ' + op.value);
  }}
  if (String(op.textContent).includes('object Object')) {{
    throw new Error('option label leaked object: ' + op.textContent);
  }}
}}
if (fixed.options[0].value !== 'prod_db') throw new Error('first value');
if (!String(fixed.options[0].textContent).includes('prod_db')) throw new Error('first label');

// Passing the raw API object (no .name) must still work.
const raw = makeSelect();
appendOption(raw, apiDatabases[0]);
if (raw.options[0].value !== 'prod_db') throw new Error('raw object value');

// Nested mistaken wrap must unwrap.
const nested = normalizeSizedItems([{{ name: {{ name: 'nested_db', size_bytes: 1 }}, size_bytes: 1 }}]);
if (nested.length !== 1 || nested[0].name !== 'nested_db') {{
  throw new Error('nested unwrap failed: ' + JSON.stringify(nested));
}}

if (coerceIdentName('[object Object]') !== '') throw new Error('literal object string');
if (coerceIdentName({{ foo: 1 }}) !== '') throw new Error('nameless object');

const backupName = 'wn_10_backup_20260716_114759_755395.sql';
if (coerceIdentName(backupName) !== backupName) throw new Error('filename coerce');
if (/^[A-Za-z0-9_]+$/.test(backupName)) throw new Error('backup name unexpectedly looks like ident');

console.log('ok');
"""
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        pytest.fail(f"node helper test failed:\nstdout={result.stdout}\nstderr={result.stderr}")
    assert "ok" in result.stdout


def test_databases_api_returns_named_objects(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        main,
        "list_mysql_databases",
        lambda _conn: [{"name": "alpha_db", "size_bytes": 10}, {"name": "beta_db", "size_bytes": 20}],
    )
    with TestClient(main.app, client=("127.0.0.1", 50000)) as client:
        resp = client.post(
            "/api/databases",
            json={"host": "127.0.0.1", "port": 3306, "username": "u", "password": "p"},
        )
    assert resp.status_code == 200
    databases = resp.json()["databases"]
    assert databases[0]["name"] == "alpha_db"
    assert isinstance(databases[0]["name"], str)
    assert "[object Object]" not in databases[0]["name"]


def test_tables_api_rejects_object_object_database_name() -> None:
    with TestClient(main.app, client=("127.0.0.1", 50000)) as client:
        resp = client.post(
            "/api/tables",
            json={
                "connection": {"host": "127.0.0.1", "port": 3306, "username": "u", "password": "p"},
                "database": "[object Object]",
            },
        )
    assert resp.status_code == 400
    assert "object Object" in str(resp.json().get("detail", ""))
