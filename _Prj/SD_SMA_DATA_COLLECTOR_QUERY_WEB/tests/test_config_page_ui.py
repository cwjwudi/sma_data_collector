from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_HTML = ROOT / "app" / "static" / "config.html"
CONFIG_JS = ROOT / "app" / "static" / "config.js"
QUERY_HTML = ROOT / "app" / "static" / "query.html"
QUERY_JS = ROOT / "app" / "static" / "query.js"
SPECIALIZED_QUERY_HTML = ROOT / "app" / "static" / "specialized_query.html"
SPECIALIZED_QUERY_JS = ROOT / "app" / "static" / "specialized_query.js"
STYLES_CSS = ROOT / "app" / "static" / "styles.css"
TOUCH_TIME_RANGE_JS = ROOT / "app" / "static" / "touch_time_range.js"
TOUCH_TIME_RANGE_CSS = ROOT / "app" / "static" / "touch_time_range.css"


def test_config_page_has_persistent_status_bar() -> None:
    html = CONFIG_HTML.read_text(encoding="utf-8")
    css = STYLES_CSS.read_text(encoding="utf-8")

    assert 'id="configStatusBar"' in html
    assert 'aria-live="polite"' in html
    assert ".config-status-bar" in css
    assert "position: sticky" in css
    assert "top: 8px" in css
    assert html.index('id="configStatusBar"') < html.index('class="layout layout-stack"')


def test_local_storage_denial_does_not_interrupt_pages() -> None:
    config_script = CONFIG_JS.read_text(encoding="utf-8")
    query_script = QUERY_JS.read_text(encoding="utf-8")
    specialized_script = SPECIALIZED_QUERY_JS.read_text(encoding="utf-8")

    assert "function safeStorageGet(key)" in config_script
    assert "function safeStorageSet(key, value)" in config_script
    assert "function safeStorageRemove(key)" in config_script
    assert "safeStorageSet(CONFIG_STATE_KEY" in config_script
    assert "safeStorageGet(CONFIG_STATE_KEY)" in config_script
    assert "safeStorageRemove(CONFIG_STATE_KEY)" in config_script
    assert config_script.count("window.localStorage.") == 3

    assert "function safeStorageGet(key)" in query_script
    assert "function safeStorageSet(key, value)" in query_script
    assert "safeStorageSet(QUERY_STATE_KEY" in query_script
    assert "safeStorageGet(QUERY_STATE_KEY)" in query_script
    assert query_script.count("window.localStorage.") == 2

    assert "function safeStorageGet(key)" in specialized_script
    assert "function safeStorageSet(key, value)" in specialized_script
    assert "safeStorageSet(pluginStateKey" in specialized_script
    assert "safeStorageGet(pluginStateKey)" in specialized_script
    assert specialized_script.count("window.localStorage.") == 2


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
    assert 'id="pluginTableListQueryNode"' in html
    assert "query_node: document.getElementById('pluginTableListQueryNode')" in script
    assert "hasBatchNode !== hasTriggerNode" in script
    assert "仅使用翻页时可留空" in script
    assert "高级模式仅翻页时可留空" in html


def test_query_pages_have_touch_friendly_controls_and_scrollable_results() -> None:
    query_html = QUERY_HTML.read_text(encoding="utf-8")
    specialized_html = SPECIALIZED_QUERY_HTML.read_text(encoding="utf-8")
    css = STYLES_CSS.read_text(encoding="utf-8")

    assert '<body class="query-page">' in query_html
    assert 'class="query-table-wrap"' in query_html
    assert 'aria-label="查询结果，可横向滚动"' in query_html
    assert "@media (pointer: coarse), (max-width: 900px)" in css
    assert ".query-page button," in css
    assert "min-height: 44px" in css
    assert "touch-action: manipulation" in css
    assert "-webkit-overflow-scrolling: touch" in css
    assert ".query-page .layout,\n.query-page .panel {\n  min-width: 0;" in css

    assert "@media (pointer: coarse), (max-width: 900px)" in specialized_html
    assert "touch-action: manipulation" in specialized_html
    assert "min-height: 44px" in specialized_html
    assert '.toolbar input[type="radio"]' in specialized_html


def test_plugin_query_shows_total_pages_without_recounting_adjacent_pages() -> None:
    html = SPECIALIZED_QUERY_HTML.read_text(encoding="utf-8")
    script = SPECIALIZED_QUERY_JS.read_text(encoding="utf-8")

    assert 'id="totalPageCount"' in html
    assert 'id="recordSummary"' in html
    assert 'aria-live="polite"' in html
    assert 'document.getElementById("totalPageCount").textContent' in script
    assert "`共 ${totalRecords} 条`" in script
    assert "include_total: advancedOpcuaMode || Boolean(includeTotal)" in script
    assert "buildPayload(lastQueryContext, targetPage, null, true)" in script
    assert "buildPayload(lastQueryContext, targetPage, requestedCursor)" in script
    assert "if (data.total != null) totalRecords =" in script


def test_query_pages_share_touch_friendly_precise_time_picker() -> None:
    query_html = QUERY_HTML.read_text(encoding="utf-8")
    query_script = QUERY_JS.read_text(encoding="utf-8")
    specialized_html = SPECIALIZED_QUERY_HTML.read_text(encoding="utf-8")
    specialized_script = SPECIALIZED_QUERY_JS.read_text(encoding="utf-8")
    picker_script = TOUCH_TIME_RANGE_JS.read_text(encoding="utf-8")
    picker_css = TOUCH_TIME_RANGE_CSS.read_text(encoding="utf-8")

    for html in (query_html, specialized_html):
        assert 'href="/static/touch_time_range.css' in html
        assert 'src="/static/touch_time_range.js' in html
        assert 'id="btnRange15Min"' in html
        assert 'id="btnRange1H"' in html
        assert 'id="btnRange8H"' in html
        assert 'id="btnRangeToday"' in html
        assert 'id="btnRangeYesterday"' in html
        assert 'id="btnRange1W"' in html
        assert 'id="btnRange1M"' in html
        assert 'id="btnPreciseTime"' in html
        assert 'type="datetime-local"' not in html
        assert "本班次" not in html

    assert "window.TouchTimeRange.attach" in query_script
    assert "window.TouchTimeRange.attach" in specialized_script
    assert "setAttribute('aria-pressed', 'true')" in query_script
    assert 'setAttribute("aria-pressed", "true")' in specialized_script
    assert 'btnRange1W: "last1w"' in specialized_script
    assert "btnRange1W: 'last1w'" in query_script
    assert 'else if (preset === "last1w")' in picker_script
    assert 'else if (preset === "last1m")' in picker_script
    assert 'data-adjust-seconds="-60"' in picker_script
    assert 'data-adjust-seconds="60"' in picker_script
    assert "结束时间不能早于开始时间" in picker_script
    assert ".touch-time-segments input" in picker_css
    assert "min-height: 52px" in picker_css
