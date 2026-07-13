import datetime


def test_generated_daily_table_suffix_is_a_valid_date() -> None:
    group_name = "group"
    today = datetime.datetime.now()
    table_name = f"{group_name}_{today.strftime('%Y%m%d')}"
    parsed = datetime.datetime.strptime(table_name[-8:], "%Y%m%d")
    assert parsed.date() == today.date()


def test_invalid_daily_table_suffix_is_rejected() -> None:
    try:
        datetime.datetime.strptime("dasss", "%Y%m%d")
    except ValueError:
        return
    raise AssertionError("invalid date suffix must raise ValueError")
