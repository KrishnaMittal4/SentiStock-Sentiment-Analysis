from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..services import correlation_service

router = APIRouter(prefix="/api/sentiment", tags=["correlation"])
settings = get_settings()


@router.get("/correlation/{symbol}", response_model=schemas.CorrelationResponse)
async def get_correlation(
    symbol: str,
    period: str = Query("1mo", description="Historical period: 1mo, 3mo, 6mo, 1y"),
    window: int = Query(7, ge=3, le=30, description="Rolling window size in trading days"),
    db: Session = Depends(get_db),
):
    """
    Get Price vs Sentiment Correlation analysis for a given ticker.
    Calculates Pearson Correlation, Rolling Correlation, Scatter plot points,
    Combined trend series, and plain English explanation.
    """
    symbol = symbol.upper()
    cache_key = f"correlation:{symbol}:{period}:{window}"

    cached = get_cached_item(db, cache_key, settings.history_cache_seconds)
    if cached:
        return cached

    result = await run_in_threadpool(
        correlation_service.get_correlation_analysis,
        db=db, symbol=symbol, period=period, window=window
    )
    set_cached_item(db, cache_key, result)
    return result
