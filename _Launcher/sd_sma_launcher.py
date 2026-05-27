from __future__ import annotations

import argparse
import http.client
import json
import os
import socket
import subprocess
import sys
import time
import urllib.parse
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Any


LAUNCHER_DIR = Path(__file__).resolve().parent
PACKAGE_ROOT = LAUNCHER_DIR.parent
DEFAULT_CONFIG = LAUNCHER_DIR / "launcher_config.json"


@dataclass
class ServiceProcess:
    name: str
    title: str
    url: str
    log_path: Path
    process: subprocess.Popen
    log_file: Any


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"Config must be a JSON object: {path}")
    return data


def resolve_path(value: str | os.PathLike[str], *, base: Path = PACKAGE_ROOT) -> Path:
    raw = str(value)
    raw = raw.replace("${PACKAGE_ROOT}", str(PACKAGE_ROOT))
    raw = raw.replace("${LAUNCHER_DIR}", str(LAUNCHER_DIR))
    raw = os.path.expandvars(raw)
    path = Path(raw)
    if not path.is_absolute():
        path = base / path
    return path.resolve()


def find_python(config: dict[str, Any]) -> Path:
    configured = resolve_path(str(config.get("python", "")))
    if configured.is_file():
        return configured

    if config.get("allow_current_python_fallback", False):
        current = Path(sys.executable).resolve()
        print(f"[env] configured Python not found: {configured}")
        print(f"[env] using current Python instead: {current}")
        return current

    raise FileNotFoundError(
        f"Configured Python does not exist: {configured}\n"
        "Edit _Launcher/launcher_config.json or build the portable package first."
    )


def apply_proxy_env(env: dict[str, str], config: dict[str, Any]) -> None:
    proxy = config.get("proxy") if isinstance(config.get("proxy"), dict) else {}
    if not proxy.get("enabled", False):
        return
    url = str(proxy.get("url", "")).strip()
    if not url:
        return
    no_proxy = str(proxy.get("no_proxy", "localhost,127.0.0.1,::1"))
    env["HTTP_PROXY"] = url
    env["HTTPS_PROXY"] = url
    env["NO_PROXY"] = no_proxy
    env["http_proxy"] = url
    env["https_proxy"] = url
    env["no_proxy"] = no_proxy


def run_python(
    python: Path,
    args: list[str],
    *,
    config: dict[str, Any],
    cwd: Path | None = None,
    check: bool = False,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    apply_proxy_env(env, config)
    return subprocess.run(
        [str(python), *args],
        cwd=str(cwd or PACKAGE_ROOT),
        env=env,
        text=True,
        capture_output=True,
        check=check,
    )


def import_check(python: Path, import_name: str, config: dict[str, Any]) -> bool:
    snippet = (
        "import importlib.util, sys; "
        f"sys.exit(0 if importlib.util.find_spec({import_name!r}) else 1)"
    )
    result = run_python(python, ["-c", snippet], config=config)
    return result.returncode == 0


def pip_check(python: Path, config: dict[str, Any]) -> subprocess.CompletedProcess[str]:
    return run_python(python, ["-m", "pip", "check"], config=config)


def install_requirements(python: Path, config: dict[str, Any]) -> None:
    requirements = resolve_path(str(config.get("requirements", "_Launcher/requirements-unified.txt")))
    if not requirements.is_file():
        raise FileNotFoundError(f"Requirements file not found: {requirements}")

    wheelhouse = resolve_path(str(config.get("wheelhouse", "wheelhouse")))
    args = ["-m", "pip", "install", "-r", str(requirements)]
    if wheelhouse.is_dir():
        args.extend(["--no-index", "--find-links", str(wheelhouse)])

    print("[env] installing missing dependencies...")
    result = run_python(python, args, config=config)
    if result.returncode != 0:
        print(result.stdout)
        print(result.stderr)
        raise RuntimeError("pip install failed")


def check_environment(python: Path, config: dict[str, Any], *, install_missing: bool) -> None:
    version = run_python(
        python,
        ["-c", "import sys; print('.'.join(map(str, sys.version_info[:3])))"],
        config=config,
        check=True,
    ).stdout.strip()
    print(f"[env] Python: {python}")
    print(f"[env] Version: {version}")

    required = config.get("required_imports", [])
    missing: list[str] = []
    for item in required:
        if not isinstance(item, dict):
            continue
        package = str(item.get("package", "")).strip()
        import_name = str(item.get("import", package)).strip()
        if not import_name:
            continue
        if import_check(python, import_name, config):
            print(f"[env] ok: import {import_name}")
        else:
            print(f"[env] missing: {package or import_name}")
            missing.append(package or import_name)

    if missing:
        if install_missing:
            install_requirements(python, config)
            for item in required:
                import_name = str(item.get("import", item.get("package", ""))).strip()
                if import_name and not import_check(python, import_name, config):
                    raise RuntimeError(f"Package still missing after install: {import_name}")
        else:
            raise RuntimeError(
                "Missing Python packages: "
                + ", ".join(missing)
                + "\nRun _Launcher/scripts/build_portable_package.ps1 or enable auto_install_missing."
            )

    result = pip_check(python, config)
    if result.returncode == 0:
        print("[env] pip check: ok")
    else:
        print("[env] pip check reported dependency issues:")
        print(result.stdout.strip() or result.stderr.strip())
        raise RuntimeError("pip check failed")


def is_port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def assert_service_paths(config: dict[str, Any]) -> None:
    services = config.get("services", [])
    if not isinstance(services, list) or not services:
        raise ValueError("Config must contain a non-empty services array.")

    for service in services:
        cwd = resolve_path(str(service.get("cwd", "")))
        if not cwd.is_dir():
            raise FileNotFoundError(f"Service cwd not found: {service.get('name')}: {cwd}")


def assert_ports_free(config: dict[str, Any]) -> None:
    for service in config.get("services", []):
        host = str(service.get("host", "127.0.0.1"))
        port = int(service.get("port", 0))
        if port <= 0:
            raise ValueError(f"Invalid port for service {service.get('name')}: {port}")
        if is_port_open(host, port):
            raise RuntimeError(f"Port already in use: {host}:{port} ({service.get('name')})")


def wait_for_http(url: str, timeout_seconds: float) -> bool:
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        conn: http.client.HTTPConnection | None = None
        try:
            if parsed.scheme == "https":
                conn = http.client.HTTPSConnection(host, port, timeout=2.0)
            else:
                conn = http.client.HTTPConnection(host, port, timeout=2.0)
            conn.request("GET", path, headers={"Host": host, "Connection": "close"})
            response = conn.getresponse()
            response.read()
            if response.status < 500:
                return True
        except OSError:
            pass
        finally:
            if conn is not None:
                conn.close()
        time.sleep(0.5)
    return False


def start_services(python: Path, config: dict[str, Any]) -> list[ServiceProcess]:
    log_dir = resolve_path("logs/launcher")
    log_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    apply_proxy_env(env, config)

    processes: list[ServiceProcess] = []
    for service in config.get("services", []):
        name = str(service["name"])
        title = str(service.get("title", name))
        cwd = resolve_path(str(service["cwd"]))
        app = str(service["app"])
        host = str(service.get("host", "127.0.0.1"))
        port = int(service["port"])
        log_path = log_dir / f"{name}.log"
        log_file = log_path.open("a", encoding="utf-8")
        command = [
            str(python),
            "-m",
            "uvicorn",
            app,
            "--host",
            host,
            "--port",
            str(port),
        ]

        print(f"[start] {title}: http://{host}:{port}")
        print(f"[start] log: {log_path}")
        process = subprocess.Popen(
            command,
            cwd=str(cwd),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        processes.append(
            ServiceProcess(
                name=name,
                title=title,
                url=str(service.get("open_url", f"http://{host}:{port}")),
                log_path=log_path,
                process=process,
                log_file=log_file,
            )
        )

    return processes


def wait_for_services(config: dict[str, Any], processes: list[ServiceProcess]) -> None:
    by_name = {p.name: p for p in processes}
    for service in config.get("services", []):
        name = str(service["name"])
        proc = by_name[name]
        host = str(service.get("host", "127.0.0.1"))
        port = int(service["port"])
        health_path = str(service.get("health_path", "/"))
        url = f"http://{host}:{port}{health_path}"
        print(f"[health] waiting for {proc.title}: {url}")
        ok = wait_for_http(url, timeout_seconds=30.0)
        if not ok:
            if proc.process.poll() is not None:
                raise RuntimeError(f"{proc.title} exited early. See log: {proc.log_path}")
            raise RuntimeError(f"{proc.title} did not become ready in time. See log: {proc.log_path}")
        print(f"[health] ready: {proc.title}")


def open_browser_tabs(config: dict[str, Any], processes: list[ServiceProcess], *, no_browser: bool) -> None:
    if no_browser or not config.get("open_browser", True):
        return
    for proc in processes:
        print(f"[open] {proc.url}")
        webbrowser.open(proc.url)


def terminate_processes(processes: list[ServiceProcess]) -> None:
    for proc in processes:
        if proc.process.poll() is None:
            print(f"[stop] {proc.title}")
            proc.process.terminate()
    deadline = time.monotonic() + 10.0
    for proc in processes:
        while proc.process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.2)
        if proc.process.poll() is None:
            print(f"[stop] force kill: {proc.title}")
            proc.process.kill()
        try:
            proc.log_file.close()
        except OSError:
            pass


def monitor(processes: list[ServiceProcess]) -> int:
    print("")
    print("Services are running. Press Ctrl+C to stop all services.")
    print("")
    while True:
        for proc in processes:
            code = proc.process.poll()
            if code is not None:
                print(f"[exit] {proc.title} exited with code {code}. See log: {proc.log_path}")
                return code or 1
        time.sleep(1.0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SD SMA unified launcher")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG), help="Path to launcher_config.json")
    parser.add_argument("--check", action="store_true", help="Only check Python and package dependencies")
    parser.add_argument("--smoke", action="store_true", help="Start services, wait for health checks, then stop")
    parser.add_argument("--install-missing", action="store_true", help="Install missing dependencies before start")
    parser.add_argument("--no-browser", action="store_true", help="Do not open browser tabs")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config_path = resolve_path(args.config, base=Path.cwd()) if args.config != str(DEFAULT_CONFIG) else DEFAULT_CONFIG
    config = load_json(config_path)
    install_missing = args.install_missing or bool(config.get("auto_install_missing", False))
    python = find_python(config)

    try:
        check_environment(python, config, install_missing=install_missing)
        assert_service_paths(config)
        if args.check:
            print("[check] ok")
            return 0
        assert_ports_free(config)
        processes = start_services(python, config)
        try:
            wait_for_services(config, processes)
            if args.smoke:
                print("[smoke] ok")
                return 0
            open_browser_tabs(config, processes, no_browser=args.no_browser)
            return monitor(processes)
        finally:
            terminate_processes(processes)
    except KeyboardInterrupt:
        print("")
        print("[stop] interrupted")
        return 130
    except Exception as exc:  # noqa: BLE001
        print("")
        print(f"[error] {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
