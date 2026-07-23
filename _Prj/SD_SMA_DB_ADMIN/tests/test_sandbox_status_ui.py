from pathlib import Path


STATIC_DIR = Path(__file__).resolve().parents[1] / "app" / "static"


def test_local_storage_is_only_accessed_inside_safe_wrappers() -> None:
    script = (STATIC_DIR / "admin.js").read_text(encoding="utf-8")

    assert "function safeStorageGet" in script
    assert "function safeStorageSet" in script
    assert script.count("window.localStorage.getItem(") == 1
    assert script.count("window.localStorage.setItem(") == 1
    assert "localStorage.getItem(" not in script.replace("window.localStorage.getItem(", "")
    assert "localStorage.setItem(" not in script.replace("window.localStorage.setItem(", "")


def test_browser_alarm_popups_are_not_used() -> None:
    script = (STATIC_DIR / "admin.js").read_text(encoding="utf-8")

    assert "alert(" not in script
    assert "window.alert" not in script
    assert "window.confirm" not in script


def test_admin_page_uses_sticky_status_bar() -> None:
    html = (STATIC_DIR / "admin.html").read_text(encoding="utf-8")
    styles = (STATIC_DIR / "styles.css").read_text(encoding="utf-8")

    assert 'id="appStatusBar"' in html
    assert 'role="status"' in html
    assert "20260723-sandbox-status" in html
    assert ".app-status-bar" in styles
    assert "position: sticky;" in styles
    assert 'data-tone="ok"' in styles
    assert 'data-tone="warn"' in styles
    assert 'data-tone="error"' in styles
