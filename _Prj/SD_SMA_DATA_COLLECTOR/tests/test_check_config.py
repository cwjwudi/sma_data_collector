"""check_config 不再硬编码 motor_group：对配置中实际存在的组做检查。"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

import check_config

MINIMAL_CONFIG: dict[str, Any] = {
    "groups": [
        {
            "name": "sensor_group_1",
            "trigger": "time",
            "data_points": ["rA", "rShared"],
            "trigger_point": None,
        },
        {
            "name": "trigger_group_1",
            "trigger": "variable",
            "data_points": ["rShared", "rB"],
            "trigger_point": "bTrig",
        },
    ],
    "database": {"data_groups": ["sensor_group_1", "trigger_group_1"]},
}


def _write_config(directory: str, config: dict[str, Any]) -> Path:
    path = Path(directory) / "config.json"
    path.write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    return path


def test_main_does_not_crash_when_motor_group_absent(capsys) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_config(tmp, MINIMAL_CONFIG)
        assert check_config.main([str(path)]) == 0
    out = capsys.readouterr().out
    assert "=== 数据组配置 ===" in out
    assert "sensor_group_1" in out
    assert "trigger_group_1" in out
    assert "=== 详细分析 ===" in out


def test_report_shows_overlap_and_exclusive_points(capsys) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_config(tmp, MINIMAL_CONFIG)
        check_config.main([str(path)])
    out = capsys.readouterr().out
    assert "重复的数据点: {'rShared'}" in out
    assert "sensor_group_1 独有: {'rA'}" in out
    assert "trigger_group_1 独有: {'rB'}" in out


def test_analyze_group_overlaps_is_pairwise() -> None:
    overlaps = check_config.analyze_group_overlaps(MINIMAL_CONFIG["groups"])
    assert overlaps == [
        ("sensor_group_1", "trigger_group_1", {"rShared"}, {"rA"}, {"rB"}),
    ]


def test_single_group_config_does_not_crash(capsys) -> None:
    config = {
        "groups": [
            {"name": "only_group", "trigger": "time", "data_points": ["x"], "trigger_point": None}
        ],
        "database": {"data_groups": ["only_group"]},
    }
    with tempfile.TemporaryDirectory() as tmp:
        path = _write_config(tmp, config)
        assert check_config.main([str(path)]) == 0
    out = capsys.readouterr().out
    assert "only_group 应该采集: ['x']" in out
