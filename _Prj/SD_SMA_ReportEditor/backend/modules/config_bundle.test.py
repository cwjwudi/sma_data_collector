from modules import config_bundle as cb


def test_is_bundle_payload_detects_v2():
    assert cb.is_bundle_payload({"bundle_version": 2, "templates": []})


def test_validate_bundle_minimal():
    data = cb.validate_bundle_payload(
        {
            "bundle_version": 2,
            "db_connections": [],
            "opcua_servers": [],
            "templates": [],
            "layout_presets": [],
            "signature_assets": [],
        }
    )
    assert data["bundle_version"] == 2
