"""
Historical daily OHLCV and news via yfinance.
Includes retry logic for yfinance requests and structured logging.
"""

from __future__ import annotations

import time
from typing import Any

import pandas as pd
import yfinance as yf

from ..logging_config import logger


class YFinanceError(Exception):
    pass


def get_daily_history(symbol: str, period: str = "6mo", max_retries: int = 2) -> list[dict[str, Any]]:
    """
    Fetch daily OHLCV data using yfinance with retry logic.
    period: any yfinance-supported range, e.g. '1mo', '3mo', '6mo', '1y', '2y', 'max'.
    """
    symbol = symbol.upper()
    df: pd.DataFrame | None = None
    last_exc: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval="1d", auto_adjust=False)
            if df is not None and not df.empty:
                break
        except Exception as exc:
            last_exc = exc
            logger.warning(f"[YFinanceService] Attempt {attempt}/{max_retries} failed for {symbol}: {exc}")
            time.sleep(0.3)

    if df is None or df.empty:
        err_msg = f"No historical data returned for {symbol}" + (f": {last_exc}" if last_exc else "")
        logger.error(f"[YFinanceService] {err_msg}")
        raise YFinanceError(err_msg)

    df = df.reset_index()
    date_col = "Date" if "Date" in df.columns else df.columns[0]

    candles = []
    for _, row in df.iterrows():
        candles.append({
            "time": row[date_col].strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
        })

    return candles


def get_ticker_news(symbol: str) -> list[dict[str, Any]]:
    """
    Fetch recent news from yfinance and map it to news articles structure.
    """
    import datetime as dt
    try:
        ticker = yf.Ticker(symbol)
        yf_news = ticker.news
    except Exception as exc:
        logger.warning(f"[YFinanceService] News fetch failed for {symbol}: {exc}")
        return []

    if not yf_news or not isinstance(yf_news, list):
        return []

    raw_articles = []
    for item in yf_news:
        content = item.get("content")
        if isinstance(content, dict):
            title = content.get("title", "")
            summary = content.get("summary") or content.get("description") or ""
            pub_date_str = content.get("pubDate")
            pub_time = 0
            if pub_date_str:
                try:
                    clean_date = pub_date_str.replace("Z", "")
                    dt_obj = dt.datetime.fromisoformat(clean_date)
                    pub_time = int(dt_obj.replace(tzinfo=dt.timezone.utc).timestamp())
                except Exception:
                    pub_time = 0
            
            provider = content.get("provider", {})
            source = provider.get("displayName") or provider.get("sourceId") or "Yahoo Finance"
            
            url = ""
            canonical = content.get("canonicalUrl")
            clickthrough = content.get("clickThroughUrl")
            if isinstance(canonical, dict):
                url = canonical.get("url", "")
            if not url and isinstance(clickthrough, dict):
                url = clickthrough.get("url", "")
        else:
            title = item.get("title", "")
            summary = item.get("summary") or item.get("description") or ""
            source = item.get("publisher", "Yahoo Finance")
            url = item.get("link", "")
            pub_time = item.get("providerPublishTime", 0)

        raw_articles.append({
            "headline": title,
            "summary": summary,
            "source": source,
            "url": url,
            "datetime": int(pub_time) if pub_time else 0
        })

    return raw_articles
