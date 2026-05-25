from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, PlainTextResponse

from core.settings import CONFIG_FILE, DATA_DIR
from modules import audit_log, config_store
from schemas.common import AuditLogAppend

router = APIRouter(tags=["audit"])


def _cfg():
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


@router.post("/audit/log")
async def append_audit(body: AuditLogAppend):
    try:
        entry = audit_log.append_audit(
            DATA_DIR,
            action=body.action,
            result=body.result,
            summary=body.summary,
            object_type=body.object_type,
            object_id=body.object_id,
            detail=body.detail,
        )
        return {"ok": True, "entry": entry}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(503, f"写入审计失败: {e}") from e


@router.get("/audit/entries")
async def list_audit_entries(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    action: str | None = Query(None),
    result: str | None = Query(None),
    from_ts: float | None = Query(None),
    to_ts: float | None = Query(None),
):
    try:
        return audit_log.list_audit(
            DATA_DIR,
            limit=limit,
            offset=offset,
            action=action,
            result=result,
            from_ts=from_ts,
            to_ts=to_ts,
        )
    except Exception as e:
        raise HTTPException(503, f"读取审计失败: {e}") from e


@router.get("/audit/export")
async def export_audit(
    action: str | None = Query(None),
    result: str | None = Query(None),
    from_ts: float | None = Query(None),
    to_ts: float | None = Query(None),
):
    try:
        entries = audit_log.export_audit(
            DATA_DIR,
            action=action,
            result=result,
            from_ts=from_ts,
            to_ts=to_ts,
        )
        return JSONResponse({"entries": entries, "total": len(entries)})
    except Exception as e:
        raise HTTPException(503, f"导出审计失败: {e}") from e


@router.get("/audit/export.csv")
async def export_audit_csv(
    action: str | None = Query(None),
    result: str | None = Query(None),
    from_ts: float | None = Query(None),
    to_ts: float | None = Query(None),
):
    try:
        csv_text = audit_log.export_audit_csv(
            DATA_DIR,
            action=action,
            result=result,
            from_ts=from_ts,
            to_ts=to_ts,
        )
        return PlainTextResponse(
            csv_text,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="report-editor-audit.csv"'},
        )
    except Exception as e:
        raise HTTPException(503, f"导出 CSV 失败: {e}") from e
