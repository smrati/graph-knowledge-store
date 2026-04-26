from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Integer, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.llm_call_log import LLMCallLog
from app.schemas.llm_log import (
    LLMCallLogListResponse,
    LLMCallLogResponse,
    LLMOperationStats,
    LLMStatsResponse,
)

router = APIRouter(prefix="/api/llm-logs", tags=["LLM Logs"])


@router.get("/stats", response_model=LLMStatsResponse)
async def get_stats(
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    session: AsyncSession = Depends(get_session),
):
    base = select(LLMCallLog)
    if from_date:
        base = base.where(LLMCallLog.created_at >= from_date)
    if to_date:
        base = base.where(LLMCallLog.created_at <= to_date)

    total_q = await session.execute(
        select(func.count(), func.sum(func.cast(LLMCallLog.success, Integer)))
        .select_from(LLMCallLog)
    )
    total_calls, total_success = total_q.one()
    total_calls = total_calls or 0
    total_success = total_success or 0

    agg_q = await session.execute(
        select(
            func.avg(LLMCallLog.latency_ms),
            func.sum(func.coalesce(LLMCallLog.total_tokens, 0)),
            func.sum(func.coalesce(LLMCallLog.prompt_tokens, 0)),
            func.sum(func.coalesce(LLMCallLog.completion_tokens, 0)),
        ).select_from(LLMCallLog)
    )
    avg_latency, total_tok, total_prompt_tok, total_comp_tok = agg_q.one()

    ops_q = await session.execute(
        select(
            LLMCallLog.operation,
            func.count().label("cnt"),
            func.sum(func.cast(LLMCallLog.success, Integer)).label("ok"),
            func.avg(LLMCallLog.latency_ms).label("avg_lat"),
            func.sum(func.coalesce(LLMCallLog.total_tokens, 0)).label("tok"),
            func.avg(func.coalesce(LLMCallLog.prompt_tokens, 0)).label("avg_pt"),
            func.avg(func.coalesce(LLMCallLog.completion_tokens, 0)).label("avg_ct"),
        )
        .group_by(LLMCallLog.operation)
        .order_by(desc("cnt"))
    )
    operations = [
        LLMOperationStats(
            operation=row.operation,
            call_count=row.cnt,
            success_count=row.ok or 0,
            avg_latency_ms=round(row.avg_lat or 0, 1),
            total_tokens=row.tok or 0,
            avg_prompt_tokens=round(row.avg_pt or 0, 1),
            avg_completion_tokens=round(row.avg_ct or 0, 1),
        )
        for row in ops_q
    ]

    errors_q = await session.execute(
        select(LLMCallLog)
        .where(LLMCallLog.success == False)
        .order_by(desc(LLMCallLog.created_at))
        .limit(10)
    )
    recent_errors = [LLMCallLogResponse.model_validate(r) for r in errors_q.scalars().all()]

    return LLMStatsResponse(
        total_calls=total_calls,
        total_success=total_success,
        total_failures=total_calls - total_success,
        success_rate=round(total_success / total_calls * 100, 1) if total_calls else 0,
        avg_latency_ms=round(avg_latency or 0, 1),
        total_tokens=total_tok or 0,
        total_prompt_tokens=total_prompt_tok or 0,
        total_completion_tokens=total_comp_tok or 0,
        operations=operations,
        recent_errors=recent_errors,
    )


@router.get("", response_model=LLMCallLogListResponse)
async def list_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=10, le=100),
    operation: str | None = Query(None),
    success: bool | None = Query(None),
    from_date: datetime | None = Query(None, alias="from"),
    to_date: datetime | None = Query(None, alias="to"),
    session: AsyncSession = Depends(get_session),
):
    q = select(LLMCallLog)
    if operation:
        q = q.where(LLMCallLog.operation == operation)
    if success is not None:
        q = q.where(LLMCallLog.success == success)
    if from_date:
        q = q.where(LLMCallLog.created_at >= from_date)
    if to_date:
        q = q.where(LLMCallLog.created_at <= to_date)

    total_q = await session.execute(
        select(func.count()).select_from(q.subquery())
    )
    total = total_q.scalar() or 0

    rows_q = await session.execute(
        q.order_by(desc(LLMCallLog.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
    )
    logs = [LLMCallLogResponse.model_validate(r) for r in rows_q.scalars().all()]

    return LLMCallLogListResponse(logs=logs, total=total, page=page, limit=limit)


@router.get("/operations", response_model=list[LLMOperationStats])
async def list_operations(session: AsyncSession = Depends(get_session)):
    ops_q = await session.execute(
        select(
            LLMCallLog.operation,
            func.count().label("cnt"),
            func.sum(func.cast(LLMCallLog.success, Integer)).label("ok"),
            func.avg(LLMCallLog.latency_ms).label("avg_lat"),
            func.sum(func.coalesce(LLMCallLog.total_tokens, 0)).label("tok"),
            func.avg(func.coalesce(LLMCallLog.prompt_tokens, 0)).label("avg_pt"),
            func.avg(func.coalesce(LLMCallLog.completion_tokens, 0)).label("avg_ct"),
        )
        .group_by(LLMCallLog.operation)
        .order_by(desc("cnt"))
    )
    return [
        LLMOperationStats(
            operation=row.operation,
            call_count=row.cnt,
            success_count=row.ok or 0,
            avg_latency_ms=round(row.avg_lat or 0, 1),
            total_tokens=row.tok or 0,
            avg_prompt_tokens=round(row.avg_pt or 0, 1),
            avg_completion_tokens=round(row.avg_ct or 0, 1),
        )
        for row in ops_q
    ]
