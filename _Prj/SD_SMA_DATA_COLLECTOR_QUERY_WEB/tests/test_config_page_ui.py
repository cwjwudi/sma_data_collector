from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_HTML = ROOT / "app" / "static" / "config.html"
CONFIG_JS = ROOT / "app" / "static" / "config.js"
STYLES_CSS = ROOT / "app" / "static" / "styles.css"


def test_config_page_has_persistent_status_bar() -> None:
    html = CONFIG_HTML.read_text(encoding="utf-8")
    css = STYLES_CSS.read_text(encoding="utf-8")

    assert 'id="configStatusBar"' in html
    assert 'aria-live="polite"' in html
    assert ".config-status-bar" in css
    assert "position: fixed" in css
    assert "bottom: 0" in css


def test_bind_group_change_reloads_complete_writeback_form() -> None:
    script = CONFIG_JS.read_text(encoding="utf-8")
    handler_start = script.index("document.getElementById('pluginBindGroup').addEventListener")
    handler_end = script.index("});", handler_start) + 3
    handler = script[handler_start:handler_end]

    assert "loadPluginWritebackSettingsForGroup(group)" in handler
    assert "loadPluginTableListWritebackForm(tableListDraft)" in script
    assert "pluginOpcuaWritebackDraft" in script
    assert "读取成功：module=" in script
    assert "保存成功：module=" in script


def test_advanced_pagination_only_does_not_require_batch_writeback_fields() -> None:
    script = CONFIG_JS.read_text(encoding="utf-8")
    html = CONFIG_HTML.read_text(encoding="utf-8")

    assert "hasPaginationNode" in script
    assert "hasBatchNode !== hasTriggerNode" in script
    assert "仅使用翻页时可留空" in script
    assert "高级模式仅翻页时可留空" in html
