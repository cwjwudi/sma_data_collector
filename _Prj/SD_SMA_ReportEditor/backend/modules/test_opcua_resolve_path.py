"""opcua_service 父链裁剪纯函数测试（不连真实 OPC）。"""

from __future__ import annotations

from modules.opcua_service import trim_path_below_objects


def test_trim_path_below_objects_keeps_objects_subtree():
    leaf_to_root = [
        {"node_id": "ns=2;s=Tag"},
        {"node_id": "ns=2;s=Device"},
        {"node_id": "i=85"},
        {"node_id": "i=84"},
    ]
    path = trim_path_below_objects(
        leaf_to_root,
        objects_node_id="i=85",
        root_node_id="i=84",
    )
    assert [p["node_id"] for p in path] == ["ns=2;s=Device", "ns=2;s=Tag"]


def test_trim_path_direct_child_of_objects():
    leaf_to_root = [
        {"node_id": "ns=2;s=Only"},
        {"node_id": "i=85"},
    ]
    path = trim_path_below_objects(
        leaf_to_root,
        objects_node_id="i=85",
        root_node_id="i=84",
    )
    assert [p["node_id"] for p in path] == ["ns=2;s=Only"]


def test_trim_path_empty_when_only_objects():
    path = trim_path_below_objects(
        [{"node_id": "i=85"}],
        objects_node_id="i=85",
        root_node_id="i=84",
    )
    assert path == []
