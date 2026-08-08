"""
Finnhub Service for SentiStock AI backend.
Provides quotes and company news endpoints with resilient HTTP request retries,
exponential backoff, granular timeout limits, and structured logging.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

import httpx

from ..config import get_settings
from ..logging_config import logger
from ..utils.http_client import execute_with_retry, get_httpx_timeout

settings = get_settings()
BASE_URL = "https://finnhub.io/api/v1"


class FinnhubError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def get_quote(symbol: str) -> dict[str, Any]:
    if not settings.finnhub_api_key:
        logger.error("[FinnhubService] FINNHUB_API_KEY is missing")
        raise FinnhubError("FINNHUB_API_KEY is not set on the server")

    def _do_request() -> httpx.Response:
        with httpx.Client(timeout=get_httpx_timeout()) as client:
            return client.get(
                f"{BASE_URL}/quote",
                params={"symbol": symbol, "token": settings.finnhub_api_key},
            )

    try:
        res = execute_with_retry(_do_request, service_name="FinnhubQuote")
    except Exception as exc:
        logger.error(f"[FinnhubService] Failed quote request for {symbol}: {exc}")
        raise FinnhubError(f"Finnhub request failed: {exc}") from exc

    if res.status_code == 401:
        raise FinnhubError("Finnhub rejected the server's API key", 401)
    if res.status_code == 429:
        raise FinnhubError("Finnhub rate limit reached (60/min on free tier)", 429)
    if not res.is_success:
        raise FinnhubError(f"Finnhub request failed ({res.status_code})", res.status_code)

    data = res.json()
    if data.get("c") is None or (data.get("c") == 0 and data.get("pc") == 0):
        raise FinnhubError(f"No quote data for {symbol}")

    return {
        "symbol": symbol,
        "price": data["c"],
        "open": data["o"],
        "high": data["h"],
        "low": data["l"],
        "prev_close": data["pc"],
        "change": data["d"],
        "change_pct": data["dp"],
    }


def get_company_news(symbol: str, days_back: int = 21, limit: int = 60) -> list[dict[str, Any]]:
    if not settings.finnhub_api_key:
        logger.error("[FinnhubService] FINNHUB_API_KEY is missing")
        raise FinnhubError("FINNHUB_API_KEY is not set on the server")

    to_date = dt.date.today()
    from_date = to_date - dt.timedelta(days=days_back)

    def _do_request() -> httpx.Response:
        with httpx.Client(timeout=get_httpx_timeout()) as client:
            return client.get(
                f"{BASE_URL}/company-news",
                params={
                    "symbol": symbol,
                    "from": from_date.isoformat(),
                    "to": to_date.isoformat(),
                    "token": settings.finnhub_api_key,
                },
            )

    try:
        res = execute_with_retry(_do_request, service_name="FinnhubNews")
    except Exception as exc:
        logger.error(f"[FinnhubService] Failed news request for {symbol}: {exc}")
        raise FinnhubError(f"Finnhub news request failed: {exc}") from exc

    if res.status_code == 429:
        raise FinnhubError("Finnhub rate limit reached (60/min on free tier)", 429)
    if not res.is_success:
        raise FinnhubError(f"Finnhub news request failed ({res.status_code})", res.status_code)

    feed = res.json()
    if not isinstance(feed, list):
        return []

    feed.sort(key=lambda item: item.get("datetime", 0), reverse=True)
    return feed[:limit]
