from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..config import get_settings
from ..database import (
    get_db,
    get_historical_sentiment_records,
    save_historical_sentiment,
)
from ..logging_config import logger
from ..services import finnhub_service, reddit_service, sentiment_service, yfinance_service

router = APIRouter(prefix="/api/sentiment", tags=["sentiment_storage"])
settings = get_settings()


def derive_prediction(combined_sentiment: float) -> str:
    """Derive market prediction signal based on combined sentiment score."""
    if combined_sentiment >= 0.25:
        return "Strong Bullish"
    elif combined_sentiment >= 0.08:
        return "Bullish"
    elif combined_sentiment <= -0.25:
        return "Strong Bearish"
    elif combined_sentiment <= -0.08:
        return "Bearish"
    return "Neutral"


@router.get("/history/{symbol}", response_model=list[schemas.HistoricalSentimentResponse])
async def get_historical_sentiment(symbol: str, db: Session = Depends(get_db)):
    """
    Retrieve stored historical sentiment records for a given ticker.
    If no entries exist in the database yet, auto-populates multi-day historical
    sentiment results avoiding duplicate entries.
    """
    symbol = symbol.upper()
    records = await run_in_threadpool(get_historical_sentiment_records, db, symbol, limit=60)

    if records:
        return [
            {
                "id": r.id,
                "ticker": r.ticker,
                "date": r.date,
                "news_sentiment": r.news_sentiment,
                "reddit_sentiment": r.reddit_sentiment,
                "combined_sentiment": r.combined_sentiment,
                "closing_price": r.closing_price,
                "prediction": r.prediction,
                "created_at": r.created_at.isoformat() + "Z" if r.created_at else "",
            }
            for r in records
        ]

    # Auto-populate historical records for the past month if database is empty for symbol
    candles = []
    try:
        candles = await run_in_threadpool(yfinance_service.get_daily_history, symbol, period="1mo")
    except Exception:
        candles = []

    # Get news daily sentiment
    daily_news_map: dict[str, float] = {}
    try:
        raw_articles = []
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
        else:
            try:
                raw_articles = await run_in_threadpool(finnhub_service.get_company_news, symbol, days_back=30)
                if not raw_articles:
                    raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
            except Exception:
                raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
        scored = await run_in_threadpool(sentiment_service.score_articles, raw_articles)
        for item in scored.get("daily_sentiment", []):
            daily_news_map[item["date"]] = item["score"]
    except Exception as exc:
        logger.warning(f"[SentimentStorage] News sentiment auto-populate failed for {symbol}: {exc}")

    # Get reddit sentiment baseline
    reddit_sentiment = 0.0
    try:
        reddit_res = await run_in_threadpool(reddit_service.analyze_reddit_sentiment, symbol)
        reddit_sentiment = reddit_res.get("average_sentiment", 0.0)
    except Exception as exc:
        logger.warning(f"[SentimentStorage] Reddit sentiment auto-populate failed for {symbol}: {exc}")

    # Upsert historical entries for available candles
    if candles:
        for c in candles:
            d_str = c.get("time", "")
            if not d_str:
                continue
            close_p = float(c.get("close", 0.0))
            news_s = float(daily_news_map.get(d_str, 0.0))
            red_s = float(reddit_sentiment)
            comb_s = round(0.55 * news_s + 0.45 * red_s, 4)
            pred = derive_prediction(comb_s)

            await run_in_threadpool(
                save_historical_sentiment,
                db=db,
                ticker=symbol,
                date_str=d_str,
                news_sentiment=news_s,
                reddit_sentiment=red_s,
                combined_sentiment=comb_s,
                closing_price=close_p,
                prediction=pred,
            )

    # Re-query stored records
    records = await run_in_threadpool(get_historical_sentiment_records, db, symbol, limit=60)
    return [
        {
            "id": r.id,
            "ticker": r.ticker,
            "date": r.date,
            "news_sentiment": r.news_sentiment,
            "reddit_sentiment": r.reddit_sentiment,
            "combined_sentiment": r.combined_sentiment,
            "closing_price": r.closing_price,
            "prediction": r.prediction,
            "created_at": r.created_at.isoformat() + "Z" if r.created_at else "",
        }
        for r in records
    ]


@router.post("/history", response_model=schemas.HistoricalSentimentResponse)
async def store_historical_sentiment_endpoint(
    payload: schemas.HistoricalSentimentCreate, db: Session = Depends(get_db)
):
    """
    Store or update a historical sentiment record for a ticker and date.
    Enforces unique constraint on (ticker, date) to avoid duplicate entries.
    """
    record = await run_in_threadpool(
        save_historical_sentiment,
        db=db,
        ticker=payload.ticker,
        date_str=payload.date,
        news_sentiment=payload.news_sentiment,
        reddit_sentiment=payload.reddit_sentiment,
        combined_sentiment=payload.combined_sentiment,
        closing_price=payload.closing_price,
        prediction=payload.prediction,
    )
    return {
        "id": record.id,
        "ticker": record.ticker,
        "date": record.date,
        "news_sentiment": record.news_sentiment,
        "reddit_sentiment": record.reddit_sentiment,
        "combined_sentiment": record.combined_sentiment,
        "closing_price": record.closing_price,
        "prediction": record.prediction,
        "created_at": record.created_at.isoformat() + "Z" if record.created_at else "",
    }
