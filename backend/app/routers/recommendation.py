from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..logging_config import logger
from ..services import (
    finnhub_service,
    indian_stock_service,
    indicators_service,
    recommendation_service,
    reddit_service,
    sentiment_service,
    yfinance_service,
)

router = APIRouter(prefix="/api", tags=["recommendation"])
settings = get_settings()


@router.get("/recommendation/{symbol}", response_model=schemas.RecommendationResponse)
async def get_recommendation(symbol: str, db: Session = Depends(get_db)):
    """
    Computes rule-based Buy / Hold / Sell Recommendation for a stock symbol.
    Combines:
    - RSI (14)
    - MACD (12, 26, 9)
    - EMA (20)
    - Bollinger Bands (20, 2σ)
    - News Sentiment (FinBERT)
    - Reddit Sentiment (FinBERT)
    """
    symbol = symbol.upper()
    cache_key = f"recommendation:{symbol}"

    cached = get_cached_item(db, cache_key, settings.news_cache_seconds)
    if cached:
        return cached

    # 1. Fetch current price
    price = 0.0
    try:
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            q = await run_in_threadpool(indian_stock_service.get_indian_quote, symbol)
        else:
            q = await run_in_threadpool(finnhub_service.get_quote, symbol)
        price = float(q.get("price", 0.0))
    except Exception as exc:
        logger.warning(f"[RecommendationRouter] Warning fetching price for {symbol}: {exc}")

    # 2. Fetch technical indicators
    indicators_data = None
    try:
        ind_key = f"indicators:{symbol}:6mo"
        indicators_data = get_cached_item(db, ind_key, settings.history_cache_seconds)
        if not indicators_data:
            candles = await run_in_threadpool(yfinance_service.get_daily_history, symbol, period="6mo")
            indicators_data = await run_in_threadpool(indicators_service.compute_indicators, symbol, candles)
            set_cached_item(db, ind_key, indicators_data)
    except Exception as exc:
        logger.warning(f"[RecommendationRouter] Warning fetching indicators for {symbol}: {exc}")

    # 3. Fetch News Sentiment
    news_data = None
    try:
        news_key = f"news:{symbol}:21"
        news_data = get_cached_item(db, news_key, settings.news_cache_seconds)
        if not news_data:
            raw_articles = []
            if symbol.endswith(".NS") or symbol.endswith(".BO"):
                raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
            else:
                try:
                    raw_articles = await run_in_threadpool(finnhub_service.get_company_news, symbol, days_back=21)
                    if not raw_articles:
                        raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
                except Exception:
                    raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
            scored = await run_in_threadpool(sentiment_service.score_articles, raw_articles)
            news_data = {
                "symbol": symbol,
                "articles": scored["articles"],
                "daily_sentiment": scored["daily_sentiment"],
                "avg_confidence": scored.get("avg_confidence"),
            }
            set_cached_item(db, news_key, news_data)
    except Exception as exc:
        logger.warning(f"[RecommendationRouter] Warning fetching news for {symbol}: {exc}")

    # 4. Fetch Reddit Sentiment
    reddit_data = None
    try:
        reddit_key = f"reddit:{symbol}"
        reddit_data = get_cached_item(db, reddit_key, settings.history_cache_seconds)
        if not reddit_data:
            reddit_data = await run_in_threadpool(reddit_service.analyze_reddit_sentiment, symbol)
            set_cached_item(db, reddit_key, reddit_data)
    except Exception as exc:
        logger.warning(f"[RecommendationRouter] Warning fetching reddit for {symbol}: {exc}")

    # Compute recommendation
    res = await run_in_threadpool(
        recommendation_service.compute_recommendation,
        symbol=symbol,
        price=price,
        indicators=indicators_data,
        news_data=news_data,
        reddit_data=reddit_data,
    )

    set_cached_item(db, cache_key, res)
    return res
