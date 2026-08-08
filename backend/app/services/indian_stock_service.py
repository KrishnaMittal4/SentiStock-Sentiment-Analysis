"""
Indian & Global Stock Service for SentiStock AI backend.
Fetches quotes and performs ticker searches using Yahoo Finance endpoints with retries and structured logging.
"""

from __future__ import annotations

from typing import Any
import httpx
import yfinance as yf

from ..logging_config import logger
from ..utils.http_client import execute_with_retry, get_httpx_timeout
from .finnhub_service import FinnhubError


def get_indian_quote(symbol: str) -> dict[str, Any]:
    """
    Fetch a live quote using yfinance's history endpoint (highly robust and free).
    Maps it to SentiStock Quote schemas.
    """
    symbol = symbol.upper()

    def _do_fetch():
        ticker = yf.Ticker(symbol)
        df = ticker.history(period="5d")
        if df is not None and not df.empty:
            return df.dropna(subset=["Close", "Open"])
        return df

    try:
        df = _do_fetch()
    except Exception as exc:
        logger.error(f"[IndianStockService] yfinance quote fetch failed for {symbol}: {exc}")
        raise FinnhubError(f"yfinance quote fetch failed for {symbol}: {exc}", 502)

    if df is None or len(df) == 0:
        raise FinnhubError(f"No valid quote data returned from yfinance for {symbol}")

    latest = df.iloc[-1]
    current_price = float(latest["Close"])
    open_price = float(latest["Open"])
    high_price = float(latest["High"])
    low_price = float(latest["Low"])

    if len(df) >= 2:
        prev_close = float(df["Close"].iloc[-2])
        change = current_price - prev_close
        change_pct = (change / prev_close) * 100
    else:
        prev_close = open_price
        change = current_price - prev_close
        change_pct = (change / prev_close) * 100 if prev_close != 0 else 0.0

    return {
        "symbol": symbol,
        "price": round(current_price, 4),
        "open": round(open_price, 4),
        "high": round(high_price, 4),
        "low": round(low_price, 4),
        "prev_close": round(prev_close, 4),
        "change": round(change, 4),
        "change_pct": round(change_pct, 4),
        "source": "yfinance_quote"
    }


def search_indian_stocks(query: str) -> list[dict[str, Any]]:
    """
    Search for global and Indian stocks using Yahoo Finance's public search API.
    Returns list of dicts with keys: ticker, name, sector.
    """
    if not query.strip():
        return []

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    def _do_request() -> httpx.Response:
        with httpx.Client(timeout=get_httpx_timeout()) as client:
            return client.get(
                "https://query1.finance.yahoo.com/v1/finance/search",
                params={"q": query},
                headers=headers
            )

    try:
        res = execute_with_retry(_do_request, service_name="YahooFinanceSearch")
    except Exception as exc:
        logger.warning(f"[IndianStockService] Stock search failed for query '{query}': {exc}")
        return []

    if res.status_code != 200:
        return []

    payload = res.json()
    quotes = payload.get("quotes", [])
    if not quotes:
        return []

    results = []
    for item in quotes:
        if item.get("quoteType") != "EQUITY":
            continue

        symbol = item.get("symbol")
        if not symbol:
            continue

        name = item.get("longname") or item.get("shortname") or symbol
        exch = item.get("exchDisp") or item.get("exchange") or "Unknown"
        sector = item.get("sectorDisp") or item.get("sector") or "Equity"

        results.append({
            "ticker": symbol,
            "name": name,
            "sector": f"{sector} ({exch})"
        })

    return results
