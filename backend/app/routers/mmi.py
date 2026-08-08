from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..services import mmi_service

router = APIRouter(prefix="/api", tags=["mmi"])
settings = get_settings()


@router.get("/mmi/{symbol}", response_model=schemas.MarketMoodIndexResponse)
async def get_market_mood_index(symbol: str, db: Session = Depends(get_db)):
    """
    Computes Market Mood Index (0–100) for a given stock ticker symbol.
    Aggregates:
    - News Sentiment
    - Reddit Sentiment
    - Technical Indicators (RSI, Bollinger %B, Moving Averages, MACD)

    Returns score and category:
    - 0–20: Extreme Fear
    - 20–40: Fear
    - 40–60: Neutral
    - 60–80: Greed
    - 80–100: Extreme Greed
    """
    symbol = symbol.upper()
    cache_key = f"mmi:{symbol}"

    cached = get_cached_item(db, cache_key, settings.news_cache_seconds)
    if cached:
        return cached

    result = await run_in_threadpool(mmi_service.calculate_market_mood_index, symbol)
    set_cached_item(db, cache_key, result)
    return result
