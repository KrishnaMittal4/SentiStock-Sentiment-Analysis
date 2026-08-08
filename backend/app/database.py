"""
SQLAlchemy engine/session setup + a tiny generic cache table.

Design choice: rather than one bespoke table per endpoint (quotes,
candles, news...), there's a single `CacheEntry` table keyed by a
namespaced string key ("quote:AAPL", "history:AAPL:1y", "news:AAPL").
This keeps the schema trivial for a student project while still
giving you a real Postgres-backed cache instead of hammering Finnhub/
yfinance on every request. If this app grows, split these into typed
tables (Quote, Candle, NewsArticle) — the service layer only talks to
`get_cached`/`set_cached`, so that refactor doesn't touch routers.
"""

from __future__ import annotations

import datetime as dt
import json
from typing import Any, Optional

from sqlalchemy import Column, DateTime, Float, Index, Integer, String, Text, UniqueConstraint, create_engine, delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

# SQLite needs check_same_thread=False to work with FastAPI, since each
# request can be handled on a different thread. Postgres/MySQL don't need
# (or accept) this argument, so only pass it when the URL is sqlite —
# this is the only line that differs between the two.
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class CacheEntry(Base):
    __tablename__ = "cache_entries"

    key = Column(String(255), primary_key=True)
    payload = Column(Text, nullable=False)  # JSON-encoded
    fetched_at = Column(DateTime, nullable=False, default=dt.datetime.utcnow, index=True)


class HistoricalSentiment(Base):
    __tablename__ = "historical_sentiment"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(32), nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    news_sentiment = Column(Float, nullable=False, default=0.0)
    reddit_sentiment = Column(Float, nullable=False, default=0.0)
    combined_sentiment = Column(Float, nullable=False, default=0.0, index=True)
    closing_price = Column(Float, nullable=False, default=0.0)
    prediction = Column(String(32), nullable=False, default="Neutral")
    created_at = Column(DateTime, nullable=False, default=dt.datetime.utcnow, index=True)

    __table_args__ = (
        UniqueConstraint("ticker", "date", name="uq_ticker_date"),
        Index("idx_hist_sent_ticker_date", "ticker", "date"),
        Index("idx_hist_sent_ticker_created", "ticker", "created_at"),
    )


from sqlalchemy import text


def init_db() -> None:
    """Create tables and ensure all performance indexes exist. Called once on startup."""
    Base.metadata.create_all(bind=engine)

    # Ensure indexes exist on pre-existing tables if created before schema updates
    with engine.begin() as conn:
        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cache_entries_fetched_at ON cache_entries (fetched_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hist_sent_ticker_date ON historical_sentiment (ticker, date)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_hist_sent_ticker_created ON historical_sentiment (ticker, created_at)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_historical_sentiment_combined_sentiment ON historical_sentiment (combined_sentiment)"))
        except Exception:
            pass



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_cached(db: Session, key: str, max_age_seconds: int) -> Optional[Any]:
    entry = db.get(CacheEntry, key)
    if entry is None:
        return None
    age = (dt.datetime.utcnow() - entry.fetched_at).total_seconds()
    if age > max_age_seconds:
        return None
    return json.loads(entry.payload)


def set_cached(db: Session, key: str, value: Any) -> None:
    """
    Upsert a cache entry.
    """
    payload = json.dumps(value)
    now = dt.datetime.utcnow()

    entry = db.get(CacheEntry, key)
    if entry is None:
        entry = CacheEntry(key=key, payload=payload, fetched_at=now)
        db.add(entry)
    else:
        entry.payload = payload
        entry.fetched_at = now

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(CacheEntry, key)
        if existing is None:
            raise
        existing.payload = payload
        existing.fetched_at = now
        db.commit()


def save_historical_sentiment(
    db: Session,
    ticker: str,
    date_str: str,
    news_sentiment: float,
    reddit_sentiment: float,
    combined_sentiment: float,
    closing_price: float,
    prediction: str,
) -> HistoricalSentiment:
    """
    Upserts a historical sentiment entry for (ticker, date_str).
    Prevents duplicate entries by checking for existing (ticker, date_str) records.
    """
    ticker_upper = ticker.upper()
    now = dt.datetime.utcnow()

    stmt = select(HistoricalSentiment).where(
        HistoricalSentiment.ticker == ticker_upper,
        HistoricalSentiment.date == date_str,
    )
    existing = db.execute(stmt).scalar_one_or_none()

    if existing:
        existing.news_sentiment = news_sentiment
        existing.reddit_sentiment = reddit_sentiment
        existing.combined_sentiment = combined_sentiment
        existing.closing_price = closing_price
        existing.prediction = prediction
        existing.created_at = now
        target_obj = existing
    else:
        target_obj = HistoricalSentiment(
            ticker=ticker_upper,
            date=date_str,
            news_sentiment=news_sentiment,
            reddit_sentiment=reddit_sentiment,
            combined_sentiment=combined_sentiment,
            closing_price=closing_price,
            prediction=prediction,
            created_at=now,
        )
        db.add(target_obj)

    try:
        db.commit()
        db.refresh(target_obj)
    except IntegrityError:
        db.rollback()
        existing = db.execute(stmt).scalar_one_or_none()
        if existing is None:
            raise
        existing.news_sentiment = news_sentiment
        existing.reddit_sentiment = reddit_sentiment
        existing.combined_sentiment = combined_sentiment
        existing.closing_price = closing_price
        existing.prediction = prediction
        existing.created_at = now
        db.commit()
        db.refresh(existing)
        target_obj = existing

    return target_obj


def get_historical_sentiment_records(
    db: Session, ticker: str, limit: int = 30
) -> list[HistoricalSentiment]:
    """Retrieve historical sentiment storage entries for a ticker ordered by date desc."""
    stmt = (
        select(HistoricalSentiment)
        .where(HistoricalSentiment.ticker == ticker.upper())
        .order_by(HistoricalSentiment.date.desc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def cleanup_expired_cache(db: Session, max_age_seconds: int = 86400) -> int:
    """
    Deletes all CacheEntry rows older than max_age_seconds.
    Returns the number of deleted records.
    """
    cutoff = dt.datetime.utcnow() - dt.timedelta(seconds=max_age_seconds)
    stmt = delete(CacheEntry).where(CacheEntry.fetched_at < cutoff)
    res = db.execute(stmt)
    db.commit()
    return res.rowcount or 0


