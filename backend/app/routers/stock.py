from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..services import finnhub_service, indicators_service, yfinance_service, indian_stock_service
from ..services.finnhub_service import FinnhubError
from ..services.yfinance_service import YFinanceError

router = APIRouter(prefix="/api", tags=["stock"])
settings = get_settings()

US_STOCKS = [
    {"ticker": "AAPL", "name": "Apple Inc.", "sector": "Technology"},
    {"ticker": "MSFT", "name": "Microsoft Corporation", "sector": "Technology"},
    {"ticker": "GOOGL", "name": "Alphabet Inc.", "sector": "Technology"},
    {"ticker": "AMZN", "name": "Amazon.com Inc.", "sector": "Consumer Cyclical"},
    {"ticker": "TSLA", "name": "Tesla Inc.", "sector": "Automotive"},
    {"ticker": "NVDA", "name": "NVIDIA Corporation", "sector": "Technology"},
    {"ticker": "META", "name": "Meta Platforms Inc.", "sector": "Technology"},
    {"ticker": "JPM", "name": "JPMorgan Chase & Co.", "sector": "Financial Services"},
    {"ticker": "V", "name": "Visa Inc.", "sector": "Financial Services"},
    {"ticker": "JNJ", "name": "Johnson & Johnson", "sector": "Healthcare"}
]


@router.get("/quote/{symbol}", response_model=schemas.Quote)
async def quote(symbol: str, db: Session = Depends(get_db)):
    symbol = symbol.upper()
    cache_key = f"quote:{symbol}"

    cached = get_cached_item(db, cache_key, settings.quote_cache_seconds)
    if cached:
        return cached

    try:
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            data = await run_in_threadpool(indian_stock_service.get_indian_quote, symbol)
        else:
            data = await run_in_threadpool(finnhub_service.get_quote, symbol)
    except FinnhubError as exc:
        status_code = exc.status_code or 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc

    set_cached_item(db, cache_key, data)
    return data


@router.get("/search")
async def search(q: str = Query("", description="Search term for stock ticker or name")):
    query = q.strip()
    if not query:
        return []

    return await run_in_threadpool(indian_stock_service.search_indian_stocks, query)


@router.get("/history/{symbol}", response_model=schemas.HistoryResponse)
async def history(
    symbol: str,
    period: str = Query("6mo", description="1mo, 3mo, 6mo, 1y, 2y, 5y, max"),
    db: Session = Depends(get_db),
):
    symbol = symbol.upper()
    cache_key = f"history:{symbol}:{period}"

    cached = get_cached_item(db, cache_key, settings.history_cache_seconds)
    if cached:
        return {"symbol": symbol, "candles": cached, "source": "yfinance"}

    try:
        candles = await run_in_threadpool(yfinance_service.get_daily_history, symbol, period=period)
    except YFinanceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    set_cached_item(db, cache_key, candles)
    return {"symbol": symbol, "candles": candles, "source": "yfinance"}


@router.get("/indicators/{symbol}", response_model=schemas.Indicators)
async def indicators(
    symbol: str,
    period: str = Query("6mo", description="Needs >=20 daily candles; 6mo is a safe default"),
    db: Session = Depends(get_db),
):
    symbol = symbol.upper()
    indicators_key = f"indicators:{symbol}:{period}"

    cached = get_cached_item(db, indicators_key, settings.history_cache_seconds)
    if cached:
        return cached

    history_key = f"history:{symbol}:{period}"
    candles = get_cached_item(db, history_key, settings.history_cache_seconds)
    if not candles:
        try:
            candles = await run_in_threadpool(yfinance_service.get_daily_history, symbol, period=period)
        except YFinanceError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        set_cached_item(db, history_key, candles)

    try:
        result = await run_in_threadpool(indicators_service.compute_indicators, symbol, candles)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    set_cached_item(db, indicators_key, result)
    return result