from __future__ import annotations

from types import SimpleNamespace

from launcher_settings import FirewallManager, NetworkAccessController, NetworkSettingsStore, apply_network_host


class FakeSupervisor:
    def __init__(self) -> None:
        self.hosts = []

    def set_listen_host(self, host: str) -> None:
        self.hosts.append(host)


class FakeManagementServer:
    def __init__(self, error=None) -> None:
        self.error = error
        self.hosts = []

    def rebind_async(self, host, callback) -> None:
        self.hosts.append(host)
        callback(self.error)


class FailingSupervisor(FakeSupervisor):
    def set_listen_host(self, host: str) -> None:
        super().set_listen_host(host)
        if len(self.hosts) == 1:
            raise RuntimeError("service bind failed")


def test_network_defaults_global_and_overrides_all_service_hosts(tmp_path) -> None:
    store = NetworkSettingsStore(tmp_path / "network.json")
    services = apply_network_host([{"name": "one", "host": "127.0.0.1"}], store.mode)
    assert store.mode == "global"
    assert services[0]["host"] == "0.0.0.0"


def test_network_switch_applies_immediately(tmp_path) -> None:
    commands = []
    runner = lambda command, **_kwargs: commands.append(command) or SimpleNamespace(returncode=0, stdout="", stderr="")
    store = NetworkSettingsStore(tmp_path / "network.json")
    supervisor = FakeSupervisor()
    server = FakeManagementServer()
    controller = NetworkAccessController(store, supervisor, FirewallManager(runner))
    controller.attach_management_server(server)

    result = controller.apply("local")

    assert result["mode"] == "local"
    assert controller.status()["applying"] is False
    assert supervisor.hosts == ["127.0.0.1"]
    assert server.hosts == ["127.0.0.1"]
    assert any("delete" in command for command in commands)


def test_failed_rebind_rolls_back_mode_and_service_hosts(tmp_path) -> None:
    runner = lambda _command, **_kwargs: SimpleNamespace(returncode=0, stdout="", stderr="")
    store = NetworkSettingsStore(tmp_path / "network.json")
    supervisor = FakeSupervisor()
    controller = NetworkAccessController(store, supervisor, FirewallManager(runner))
    controller.attach_management_server(FakeManagementServer(RuntimeError("port busy")))

    controller.apply("local")

    status = controller.status()
    assert status["mode"] == "global"
    assert "已恢复" in status["last_error"]
    assert supervisor.hosts == ["127.0.0.1", "0.0.0.0"]


def test_synchronous_service_switch_failure_rolls_back_and_unlocks_controller(tmp_path) -> None:
    runner = lambda _command, **_kwargs: SimpleNamespace(returncode=0, stdout="", stderr="")
    store = NetworkSettingsStore(tmp_path / "network.json")
    supervisor = FailingSupervisor()
    controller = NetworkAccessController(store, supervisor, FirewallManager(runner))
    controller.attach_management_server(FakeManagementServer())

    try:
        controller.apply("local")
    except RuntimeError as exc:
        assert "已恢复" in str(exc)
    else:
        raise AssertionError("expected the synchronous switch to fail")

    status = controller.status()
    assert status["mode"] == "global"
    assert status["applying"] is False
    assert supervisor.hosts == ["127.0.0.1", "0.0.0.0"]
