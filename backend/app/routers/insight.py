from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..services import finnhub_service, groq_service, indicators_service, sentiment_service, yfinance_service, indian_stock_service
from ..services.finnhub_service import FinnhubError
from ..services.groq_service import GroqError
from ..services.yfinance_service import YFinanceError

router = APIRouter(prefix="/api", tags=["insight"])
settings = get_settings()

DEFAULT_PERIOD = "6mo"
DEFAULT_NEWS_DAYS = 21


async def _get_or_fetch_quote(db: Session, symbol: str) -> dict:
    key = f"quote:{symbol}"
    cached = get_cached_item(db, key, settings.quote_cache_seconds)
    if cached:
        return cached
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        data = await run_in_threadpool(indian_stock_service.get_indian_quote, symbol)
    else:
        data = await run_in_threadpool(finnhub_service.get_quote, symbol)
    set_cached_item(db, key, data)
    return data


async def _get_or_fetch_history(db: Session, symbol: str, period: str = DEFAULT_PERIOD) -> list:
    key = f"history:{symbol}:{period}"
    cached = get_cached_item(db, key, settings.history_cache_seconds)
    if cached:
        return cached
    candles = await run_in_threadpool(yfinance_service.get_daily_history, symbol, period=period)
    set_cached_item(db, key, candles)
    return candles


async def _get_or_fetch_news(db: Session, symbol: str, days_back: int = DEFAULT_NEWS_DAYS) -> dict:
    key = f"news:{symbol}:{days_back}"
    cached = get_cached_item(db, key, settings.news_cache_seconds)
    if cached:
        return cached
    
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
    else:
        try:
            raw_articles = await run_in_threadpool(finnhub_service.get_company_news, symbol, days_back=days_back)
            if not raw_articles:
                raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
        except FinnhubError:
            raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)

    scored = await run_in_threadpool(sentiment_service.score_articles, raw_articles)
    response = {
        "symbol": symbol,
        "articles": scored["articles"],
        "daily_sentiment": scored["daily_sentiment"],
        "avg_confidence": scored.get("avg_confidence"),
        "model": settings.sentiment_model_name,
    }
    set_cached_item(db, key, response)
    return response


@router.get("/insight/{symbol}", response_model=schemas.Insight)
async def insight(symbol: str, db: Session = Depends(get_db)):
    symbol = symbol.upper()
    cache_key = f"insight:{symbol}"

    cached = get_cached_item(db, cache_key, settings.insight_cache_seconds)
    if cached:
        return cached

    try:
        quote = await _get_or_fetch_quote(db, symbol)
    except FinnhubError as exc:
        status_code = exc.status_code or 502
        raise HTTPException(status_code=status_code, detail=f"Couldn't load quote for the brief: {exc}") from exc

    indicators = None
    try:
        candles = await _get_or_fetch_history(db, symbol)
        indicators = await run_in_threadpool(indicators_service.compute_indicators, symbol, candles)
    except (YFinanceError, ValueError):
        indicators = None

    try:
        news = await _get_or_fetch_news(db, symbol)
    except FinnhubError:
        news = {"articles": [], "daily_sentiment": []}

    try:
        brief = await run_in_threadpool(
            groq_service.generate_brief,
            symbol, quote, indicators, news["daily_sentiment"], news["articles"]
        )
    except GroqError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    response = {
        "symbol": symbol,
        "brief": brief,
        "model": settings.groq_model_name,
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
    }
    set_cached_item(db, cache_key, response)
    return response