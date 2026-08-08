"""
Market Mood Index (MMI) Service.

Calculates Market Mood Index (0–100) from 3 components:
1. News Sentiment (0–100)
2. Reddit Sentiment (0–100)
3. Technical Indicators (0–100)

Categories:
- 0–20: Extreme Fear
- 20–40: Fear
- 40–60: Neutral
- 60–80: Greed
- 80–100: Extreme Greed
"""

from __future__ import annotations

from typing import Any, Dict


from ..logging_config import logger
from . import finnhub_service, indicators_service, reddit_service, sentiment_service, yfinance_service


def _clamp(val: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    return max(min_val, min(max_val, val))


def _determine_category(score: float) -> str:
    if score < 20.0:
        return "Extreme Fear"
    elif score < 40.0:
        return "Fear"
    elif score < 60.0:
        return "Neutral"
    elif score < 80.0:
        return "Greed"
    else:
        return "Extreme Greed"


def calculate_market_mood_index(symbol: str) -> dict[str, Any]:
    symbol = symbol.upper()

    # 1. Fetch News Sentiment
    news_sentiment_val = 0.0
    news_count = 0
    try:
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            raw_articles = yfinance_service.get_ticker_news(symbol)
        else:
            try:
                raw_articles = finnhub_service.get_company_news(symbol, days_back=21)
                if not raw_articles:
                    raw_articles = yfinance_service.get_ticker_news(symbol)
            except Exception:
                raw_articles = yfinance_service.get_ticker_news(symbol)

        scored_news = sentiment_service.score_articles(raw_articles)
        articles = scored_news.get("articles", [])
        news_count = len(articles)
        if news_count > 0:
            scores = [a.get("sentiment_score", 0.0) for a in articles]
            news_sentiment_val = sum(scores) / news_count
    except Exception as exc:
        logger.warning(f"[MMIService] News sentiment fetch error for {symbol}: {exc}")
        news_sentiment_val = 0.0

    # News score (0..100)
    news_score = _clamp(((news_sentiment_val + 1.0) / 2.0) * 100.0)

    # 2. Fetch Reddit Sentiment
    reddit_sentiment_val = 0.0
    reddit_posts_count = 0
    try:
        reddit_res = reddit_service.analyze_reddit_sentiment(symbol)
        reddit_sentiment_val = float(reddit_res.get("average_sentiment", 0.0))
        reddit_posts_count = int(reddit_res.get("number_of_posts_analyzed", 0))
    except Exception as exc:
        logger.warning(f"[MMIService] Reddit sentiment fetch error for {symbol}: {exc}")
        reddit_sentiment_val = 0.0

    # Reddit score (0..100)
    reddit_score = _clamp(((reddit_sentiment_val + 1.0) / 2.0) * 100.0)

    # 3. Fetch Technical Indicators & Price
    technical_score = 50.0
    rsi_val = None
    percent_b_val = None
    ma_signal = "Neutral"
    macd_signal = "Neutral"

    try:
        candles = yfinance_service.get_daily_history(symbol, period="6mo")

        if len(candles) >= 20:
            ind = indicators_service.compute_indicators(symbol, candles)
            latest_price = candles[-1]["close"]

            # RSI component (0..100)
            rsi_val = ind.get("rsi_14")
            rsi_comp = float(rsi_val) if rsi_val is not None else 50.0

            # Bollinger Bands (%B) component (0..100)
            bb_upper = ind.get("bb_upper")
            bb_lower = ind.get("bb_lower")
            if latest_price and bb_upper and bb_lower and bb_upper > bb_lower:
                percent_b_val = ((latest_price - bb_lower) / (bb_upper - bb_lower)) * 100.0
                pct_b_comp = _clamp(percent_b_val)
            else:
                pct_b_comp = 50.0

            # Moving Averages component (0..100)
            sma_20 = ind.get("sma_20")
            sma_50 = ind.get("sma_50")
            ema_20 = ind.get("ema_20")
            ma_pts = 0
            if latest_price and sma_20 and latest_price > sma_20:
                ma_pts += 25
            if latest_price and sma_50 and latest_price > sma_50:
                ma_pts += 25
            if sma_20 and sma_50 and sma_20 > sma_50:
                ma_pts += 25
            if latest_price and ema_20 and latest_price > ema_20:
                ma_pts += 25
            ma_comp = float(ma_pts)

            if ma_comp >= 75:
                ma_signal = "Bullish"
            elif ma_comp <= 25:
                ma_signal = "Bearish"

            # MACD component (0..100)
            macd_hist = ind.get("macd_hist")
            if macd_hist is not None:
                if macd_hist > 0:
                    macd_comp = 75.0
                    macd_signal = "Bullish"
                elif macd_hist < 0:
                    macd_comp = 25.0
                    macd_signal = "Bearish"
                else:
                    macd_comp = 50.0
            else:
                macd_comp = 50.0

            # Average technical component score
            technical_score = _clamp((rsi_comp + pct_b_comp + ma_comp + macd_comp) / 4.0)

    except Exception as exc:
        logger.warning(f"[MMIService] Indicators fetch error for {symbol}: {exc}")
        technical_score = 50.0

    # 4. Final Market Mood Index Score (1/3 News, 1/3 Reddit, 1/3 Technical)
    mmi_score = round((news_score * (1 / 3)) + (reddit_score * (1 / 3)) + (technical_score * (1 / 3)), 1)
    category = _determine_category(mmi_score)

    return {
        "symbol": symbol,
        "mmi_score": mmi_score,
        "category": category,
        "news_score": round(news_score, 1),
        "news_sentiment": round(news_sentiment_val, 4),
        "news_count": news_count,
        "reddit_score": round(reddit_score, 1),
        "reddit_sentiment": round(reddit_sentiment_val, 4),
        "reddit_count": reddit_posts_count,
        "technical_score": round(technical_score, 1),
        "technical_details": {
            "rsi": round(rsi_val, 1) if rsi_val is not None else None,
            "percent_b": round(percent_b_val, 1) if percent_b_val is not None else None,
            "ma_signal": ma_signal,
            "macd_signal": macd_signal,
        },
    }
