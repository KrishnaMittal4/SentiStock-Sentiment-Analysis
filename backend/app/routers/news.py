from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..services import finnhub_service, sentiment_service, yfinance_service
from ..services.finnhub_service import FinnhubError

router = APIRouter(prefix="/api", tags=["news"])
settings = get_settings()


@router.get("/news/{symbol}")
async def news(
    symbol: str,
    days_back: int = Query(21, ge=1, le=90),
    db: Session = Depends(get_db),
):
    symbol = symbol.upper()
    cache_key = f"news:{symbol}:{days_back}"

    cached = get_cached_item(db, cache_key, settings.news_cache_seconds)
    if cached:
        return cached

    raw_articles = []
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
    else:
        try:
            raw_articles = await run_in_threadpool(finnhub_service.get_company_news, symbol, days_back=days_back)
            if not raw_articles:
                raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
        except FinnhubError as exc:
            try:
                raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
            except Exception:
                status_code = exc.status_code or 502
                raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    # FinBERT sentiment scoring is CPU heavy -> run off main thread
    scored = await run_in_threadpool(sentiment_service.score_articles, raw_articles)

    response = {
        "symbol": symbol,
        "articles": scored["articles"],
        "daily_sentiment": scored["daily_sentiment"],
        "avg_confidence": scored.get("avg_confidence"),
        "model": settings.sentiment_model_name,
    }

    set_cached_item(db, cache_key, response)
    return response