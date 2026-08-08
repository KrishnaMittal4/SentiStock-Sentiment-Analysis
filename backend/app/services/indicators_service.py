"""
Technical indicators computed from the same daily candles yfinance
returns (see yfinance_service.py) — RSI, MACD, SMA/EMA, Bollinger Bands.

TA-Lib is a C library with a Python wrapper, so `pip install ta-lib`
alone often fails until the underlying C library is installed first
(see backend/README.md for the apt/brew commands). Rather than make
the whole API 500 if that step was skipped, this module tries to
import talib and falls back to equivalent pandas-only math if it's
missing — same values, pure Python, no compiled dependency. The
`engine` field in the response tells you which path actually ran.
"""

from __future__ import annotations

from typing import Any, Optional

import numpy as np
import pandas as pd

# `talib` may not be installed in some environments. Declare it as Any
# so static type checkers won't complain about attribute access when
# we guard runtime usage with the _HAS_TALIB flag below.
talib: Any = None
try:
    import talib as _talib  # type: ignore
    talib = _talib
    _HAS_TALIB = True
except ImportError:
    talib = None
    _HAS_TALIB = False


def _closes_highs_lows(candles: list[dict[str, Any]]):
    closes = np.array([c["close"] for c in candles], dtype=float)
    highs = np.array([c["high"] for c in candles], dtype=float)
    lows = np.array([c["low"] for c in candles], dtype=float)
    return closes, highs, lows


def _last_valid(arr) -> Optional[float]:
    for v in reversed(arr):
        if v is not None and not (isinstance(v, float) and np.isnan(v)):
            return round(float(v), 4)
    return None


# ---------------------------------------------------------------------
# TA-Lib path
# ---------------------------------------------------------------------
def _compute_with_talib(candles: list[dict[str, Any]]) -> dict[str, Any]:
    closes, highs, lows = _closes_highs_lows(candles)

    rsi = talib.RSI(closes, timeperiod=14)
    macd, macd_signal, macd_hist = talib.MACD(closes, fastperiod=12, slowperiod=26, signalperiod=9)
    sma_20 = talib.SMA(closes, timeperiod=20)
    sma_50 = talib.SMA(closes, timeperiod=50)
    ema_20 = talib.EMA(closes, timeperiod=20)
    bb_upper, bb_middle, bb_lower = talib.BBANDS(closes, timeperiod=20)

    return {
        "rsi_14": _last_valid(rsi),
        "macd": _last_valid(macd),
        "macd_signal": _last_valid(macd_signal),
        "macd_hist": _last_valid(macd_hist),
        "sma_20": _last_valid(sma_20),
        "sma_50": _last_valid(sma_50),
        "ema_20": _last_valid(ema_20),
        "bb_upper": _last_valid(bb_upper),
        "bb_middle": _last_valid(bb_middle),
        "bb_lower": _last_valid(bb_lower),
        "engine": "talib",
    }


# ---------------------------------------------------------------------
# Pure-pandas fallback (used only if the talib C library isn't installed)
# ---------------------------------------------------------------------
def _compute_with_pandas(candles: list[dict[str, Any]]) -> dict[str, Any]:
    closes = pd.Series([c["close"] for c in candles], dtype=float)

    delta = closes.astype(float).diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14).mean()
    avg_loss = loss.rolling(14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    ema_12 = closes.ewm(span=12, adjust=False).mean()
    ema_26 = closes.ewm(span=26, adjust=False).mean()
    macd_line = ema_12 - ema_26
    macd_signal = macd_line.ewm(span=9, adjust=False).mean()
    macd_hist = macd_line - macd_signal

    sma_20 = closes.rolling(20).mean()
    sma_50 = closes.rolling(50).mean()
    ema_20 = closes.ewm(span=20, adjust=False).mean()

    bb_middle = sma_20
    bb_std = closes.rolling(20).std()
    bb_upper = bb_middle + 2 * bb_std
    bb_lower = bb_middle - 2 * bb_std

    return {
        "rsi_14": _last_valid(rsi.values),
        "macd": _last_valid(macd_line.values),
        "macd_signal": _last_valid(macd_signal.values),
        "macd_hist": _last_valid(macd_hist.values),
        "sma_20": _last_valid(sma_20.values),
        "sma_50": _last_valid(sma_50.values),
        "ema_20": _last_valid(ema_20.values),
        "bb_upper": _last_valid(bb_upper.values),
        "bb_middle": _last_valid(bb_middle.values),
        "bb_lower": _last_valid(bb_lower.values),
        "engine": "pandas-fallback",
    }


def compute_indicators(symbol: str, candles: list[dict[str, Any]]) -> dict[str, Any]:
    if len(candles) < 20:
        raise ValueError(f"Need at least 20 daily candles to compute indicators, got {len(candles)}")

    result = _compute_with_talib(candles) if _HAS_TALIB else _compute_with_pandas(candles)
    result["symbol"] = symbol
    return result
