"""
Background task processors for SentiStock AI backend.
Offloads non-blocking asynchronous jobs like historical DB persistence,
cache pre-warming, and periodic DB cleanup.
"""

from __future__ import annotations

from typing import List
from sqlalchemy.orm import Session

from .config import get_settings
from .database import SessionLocal, cleanup_expired_cache, save_historical_sentiment
from .logging_config import logger

settings = get_settings()


def bg_cleanup_expired_cache_task(max_age_seconds: int = 86400) -> None:
    """
    Background job to purge expired cache entries from the database.
    """
    db: Session = SessionLocal()
    try:
        deleted_count = cleanup_expired_cache(db, max_age_seconds=max_age_seconds)
        if deleted_count > 0:
            logger.info(f"[BackgroundTask] Cleaned up {deleted_count} expired cache records.")
    except Exception as exc:
        logger.error(f"[BackgroundTask] Error cleaning up expired cache: {exc}", exc_info=True)
    finally:
        db.close()


def bg_save_historical_sentiment_task(
    ticker: str,
    date_str: str,
    news_sentiment: float,
    reddit_sentiment: float,
    combined_sentiment: float,
    closing_price: float,
    prediction: str,
) -> None:
    """
    Background job to persist historical sentiment record without delaying endpoint responses.
    """
    db: Session = SessionLocal()
    try:
        save_historical_sentiment(
            db=db,
            ticker=ticker,
            date_str=date_str,
            news_sentiment=news_sentiment,
            reddit_sentiment=reddit_sentiment,
            combined_sentiment=combined_sentiment,
            closing_price=closing_price,
            prediction=prediction,
        )
        logger.info(f"[BackgroundTask] Saved historical sentiment for {ticker} ({date_str})")
    except Exception as exc:
        logger.error(f"[BackgroundTask] Failed saving historical sentiment for {ticker}: {exc}", exc_info=True)
    finally:
        db.close()


def bg_warm_stock_cache_task(tickers: List[str]) -> None:
    """
    Background job to pre-fetch quotes and price history for popular tickers.
    """
    db: Session = SessionLocal()
    try:
        from .services import finnhub_service, yfinance_service
        from .cache import set_cached_item

        for ticker in tickers:
            ticker = ticker.upper()
            try:
                quote = finnhub_service.get_quote(ticker)
                set_cached_item(db, f"quote:{ticker}", quote)
            except Exception:
                pass

            try:
                candles = yfinance_service.get_daily_history(ticker, period="6mo")
                set_cached_item(db, f"history:{ticker}:6mo", candles)
            except Exception:
                pass
        logger.info(f"[BackgroundTask] Pre-warmed cache for tickers: {', '.join(tickers)}")
    except Exception as exc:
        logger.error(f"[BackgroundTask] Error warming stock cache: {exc}", exc_info=True)
    finally:
        db.close()
