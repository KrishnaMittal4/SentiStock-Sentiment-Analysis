"""
Correlation Service — Calculates Pearson Correlation, Rolling Correlation, and Plain English
Relationship Analysis between stock closing prices and historical market sentiment.
"""

from __future__ import annotations

import math
from typing import Any, Optional
import numpy as np
from sqlalchemy.orm import Session

from ..database import get_historical_sentiment_records, save_historical_sentiment
from ..services import finnhub_service, reddit_service, sentiment_service, yfinance_service


def calculate_pearson_correlation(x: list[float], y: list[float]) -> tuple[float, float, float, float]:
    """
    Computes Pearson Correlation Coefficient (r), R-squared (r^2), slope, and intercept.
    Returns: (r, r_squared, slope, intercept)
    """
    n = len(x)
    if n < 2:
        return 0.0, 0.0, 0.0, 0.0

    x_arr = np.array(x, dtype=float)
    y_arr = np.array(y, dtype=float)

    std_x = np.std(x_arr)
    std_y = np.std(y_arr)

    if std_x == 0 or std_y == 0:
        return 0.0, 0.0, 0.0, float(np.mean(y_arr))

    r = float(np.corrcoef(x_arr, y_arr)[0, 1])
    if math.isnan(r):
        r = 0.0

    r_squared = r ** 2

    # Linear regression slope and intercept
    slope, intercept = np.polyfit(x_arr, y_arr, 1)
    if math.isnan(slope):
        slope = 0.0
    if math.isnan(intercept):
        intercept = float(np.mean(y_arr))

    return round(r, 4), round(r_squared, 4), round(float(slope), 4), round(float(intercept), 4)


def calculate_rolling_correlation(
    prices: list[float], sentiments: list[float], window: int = 7
) -> list[Optional[float]]:
    """
    Calculates rolling window Pearson correlation over time.
    For indices < window - 1, computes partial rolling correlation if min_periods >= 3.
    """
    n = len(prices)
    rolling_corrs: list[Optional[float]] = []

    for i in range(n):
        start_idx = max(0, i - window + 1)
        sub_p = prices[start_idx : i + 1]
        sub_s = sentiments[start_idx : i + 1]

        if len(sub_p) < 3:
            rolling_corrs.append(None)
            continue

        std_p = np.std(sub_p)
        std_s = np.std(sub_s)
        if std_p == 0 or std_s == 0:
            rolling_corrs.append(0.0)
            continue

        r_sub = float(np.corrcoef(sub_s, sub_p)[0, 1])
        if math.isnan(r_sub):
            r_sub = 0.0

        rolling_corrs.append(round(r_sub, 4))

    return rolling_corrs


def generate_plain_english_explanation(
    symbol: str,
    r: float,
    r_squared: float,
    window: int,
    sample_size: int,
    rolling_corrs: list[Optional[float]],
) -> dict[str, str]:
    """
    Generates a comprehensive plain English narrative explaining the statistical
    relationship between historical sentiment and stock price movements.
    """
    abs_r = abs(r)

    # Classification
    if r >= 0.70:
        strength_dir = "Strong Positive Correlation"
        signal_class = "Strong Co-Moving Signal"
        summary = (
            f"Over the analyzed period ({sample_size} trading days), {symbol} exhibits a robust "
            f"positive relationship (r = +{r:.2f}) with investor sentiment."
        )
        practical = (
            f"When news headlines and social discussions turn increasingly optimistic, {symbol}'s closing "
            f"price consistently trends upward in sync. Approximately {r_squared * 100:.1f}% of price direction "
            f"variance aligns with market sentiment momentum."
        )
        takeaway = (
            "Bullish sentiment surges serve as a strong confirming factor for long entries or trend continuation. "
            "Monitoring sentiment shifts can provide early awareness of potential momentum slowdowns."
        )
    elif r >= 0.35:
        strength_dir = "Moderate Positive Correlation"
        signal_class = "Co-Moving Indicator"
        summary = (
            f"Historically, {symbol} shows a moderate positive relationship (r = +{r:.2f}) "
            f"between daily sentiment scores and price levels."
        )
        practical = (
            f"Market price generally moves in alignment with sentiment shifts, but price action is also influenced "
            f"by macroeconomic factors, volume, and technical support/resistance levels. "
            f"Sentiment accounts for roughly {r_squared * 100:.1f}% of overall price fluctuation."
        )
        takeaway = (
            "Sentiment is a valuable supporting signal, but should be cross-referenced with technical indicators "
            "(RSI, MACD, Moving Averages) before making trading decisions."
        )
    elif r >= 0.10:
        strength_dir = "Weak Positive Correlation"
        signal_class = "Weak Signal"
        summary = (
            f"{symbol} demonstrates a weak positive correlation (r = +{r:.2f}) with news and social media sentiment."
        )
        practical = (
            f"While favorable sentiment occasionally aligns with higher prices, market sentiment alone explains only "
            f"{r_squared * 100:.1f}% of price variance. Institutional order flow and sector trends dominate price action."
        )
        takeaway = (
            "Avoid relying solely on sentiment metrics for this ticker. Use fundamental analysis and technical breakouts as primary decision drivers."
        )
    elif r > -0.10:
        strength_dir = "Negligible / Uncorrelated"
        signal_class = "Neutral / Decoupled"
        summary = (
            f"There is virtually no linear correlation (r = {r:.2f}) between historical sentiment and "
            f"{symbol}'s daily stock price."
        )
        practical = (
            f"{symbol}'s price movements operate independently of public sentiment metrics. Sentiment explains under "
            f"{r_squared * 100:.1f}% of price movement, indicating news sentiment noise rather than direct price driver."
        )
        takeaway = (
            "Treat sentiment as a qualitative background context rather than a direct trading trigger for this asset."
        )
    elif r > -0.35:
        strength_dir = "Weak Negative Correlation"
        signal_class = "Mild Contrarian Signal"
        summary = (
            f"{symbol} displays a slight inverse relationship (r = {r:.2f}) with daily sentiment indicators."
        )
        practical = (
            f"Price movements occasionally move opposite to public narrative (e.g., 'buy the rumor, sell the news'). "
            f"Peak euphoria occasionally coincides with profit-taking pullbacks."
        )
        takeaway = (
            "Be cautious when sentiment reaches extreme optimism, as price may experience short-term consolidation."
        )
    elif r > -0.70:
        strength_dir = "Moderate Negative Correlation"
        signal_class = "Contrarian Indicator"
        summary = (
            f"Historical data shows a moderate inverse correlation (r = {r:.2f}) between {symbol}'s sentiment and price."
        )
        practical = (
            f"Prices frequently move inverse to narrative bias. High public enthusiasm often precedes local price tops, "
            f"whereas heavy negative media coverage frequently signals selling exhaustion and accumulation phases."
        )
        takeaway = (
            "Consider contrarian trading strategies: look for buying opportunities during peak media pessimism and risk management during public hype."
        )
    else:
        strength_dir = "Strong Negative Correlation"
        signal_class = "Strong Contrarian Indicator"
        summary = (
            f"{symbol} shows a strong inverse correlation (r = {r:.2f}) with market sentiment."
        )
        practical = (
            f"Asset price dynamics run strongly counter to media/social narrative. High sentiment consistently leads "
            f"pullbacks, while extreme negative sentiment marks bottom reversals ({r_squared * 100:.1f}% inverse alignment)."
        )
        takeaway = (
            "Classic contrarian signal ticker. Heavy retail or headline bias serves as a reliable reverse indicator."
        )

    # Rolling trend assessment
    valid_rolling = [rc for rc in rolling_corrs if rc is not None]
    if len(valid_rolling) >= 3:
        recent_rc = valid_rolling[-1]
        earlier_rc = valid_rolling[0]
        avg_rc = float(np.mean(valid_rolling))
        if recent_rc > earlier_rc + 0.2:
            rolling_trend = (
                f"The {window}-day rolling correlation has STRENGTHENED over time (from {earlier_rc:.2f} to {recent_rc:.2f}), "
                f"indicating that recent price action is becoming increasingly sensitive to sentiment shifts."
            )
        elif recent_rc < earlier_rc - 0.2:
            rolling_trend = (
                f"The {window}-day rolling correlation has WEAKENED over time (from {earlier_rc:.2f} to {recent_rc:.2f}), "
                f"suggesting price action has recently decoupled from news headlines toward technical range-bound trading."
            )
        else:
            rolling_trend = (
                f"The {window}-day rolling correlation has remained STABLE throughout the period, averaging {avg_rc:.2f}."
            )
    else:
        rolling_trend = f"Insufficient window length to track rolling correlation shifts."

    return {
        "summary": summary,
        "strength_direction": strength_dir,
        "signal_classification": signal_class,
        "practical_meaning": practical,
        "rolling_trend": rolling_trend,
        "investor_takeaway": takeaway,
    }


def get_correlation_analysis(
    db: Session, symbol: str, period: str = "1mo", window: int = 7
) -> dict[str, Any]:
    """
    Retrieves historical price and sentiment time-series data for a ticker,
    computes Pearson Correlation and Rolling Correlation, and returns structured data.
    """
    symbol = symbol.upper()

    # 1. Fetch DB records or populate if missing
    records = get_historical_sentiment_records(db, symbol, limit=90)
    
    # If no records exist, auto-populate using yfinance candles & FinBERT scoring
    if not records:
        candles = []
        try:
            candles = yfinance_service.get_daily_history(symbol, period=period)
        except Exception:
            candles = []

        daily_news_map: dict[str, float] = {}
        try:
            raw_articles = []
            if symbol.endswith(".NS") or symbol.endswith(".BO"):
                raw_articles = yfinance_service.get_ticker_news(symbol)
            else:
                try:
                    raw_articles = finnhub_service.get_company_news(symbol, days_back=30)
                    if not raw_articles:
                        raw_articles = yfinance_service.get_ticker_news(symbol)
                except Exception:
                    raw_articles = yfinance_service.get_ticker_news(symbol)

            scored = sentiment_service.score_articles(raw_articles)
            for item in scored.get("daily_sentiment", []):
                daily_news_map[item["date"]] = item["score"]
        except Exception:
            pass

        reddit_sentiment = 0.0
        try:
            reddit_res = reddit_service.analyze_reddit_sentiment(symbol)
            reddit_sentiment = reddit_res.get("average_sentiment", 0.0)
        except Exception:
            pass

        if candles:
            for c in candles:
                d_str = c.get("time", "")
                if not d_str:
                    continue
                close_p = float(c.get("close", 0.0))
                news_s = float(daily_news_map.get(d_str, 0.0))
                red_s = float(reddit_sentiment)
                comb_s = round(0.55 * news_s + 0.45 * red_s, 4)
                
                # Derive prediction
                if comb_s >= 0.25:
                    pred = "Strong Bullish"
                elif comb_s >= 0.08:
                    pred = "Bullish"
                elif comb_s <= -0.25:
                    pred = "Strong Bearish"
                elif comb_s <= -0.08:
                    pred = "Bearish"
                else:
                    pred = "Neutral"

                save_historical_sentiment(
                    db=db,
                    ticker=symbol,
                    date_str=d_str,
                    news_sentiment=news_s,
                    reddit_sentiment=red_s,
                    combined_sentiment=comb_s,
                    closing_price=close_p,
                    prediction=pred,
                )

        records = get_historical_sentiment_records(db, symbol, limit=90)

    # Sort records ascending by date for chronological time-series analysis
    sorted_records = sorted(records, key=lambda r: r.date)

    if not sorted_records:
        # Fallback empty response
        return {
            "symbol": symbol,
            "period": period,
            "rolling_window": window,
            "pearson_r": 0.0,
            "r_squared": 0.0,
            "slope": 0.0,
            "intercept": 0.0,
            "sample_size": 0,
            "scatter_points": [],
            "combined_trend": [],
            "explanation": {
                "summary": f"No historical data available for {symbol}.",
                "strength_direction": "Uncorrelated",
                "signal_classification": "Neutral / Noise",
                "practical_meaning": "No historical sentiment or price records found.",
                "rolling_trend": "N/A",
                "investor_takeaway": "N/A",
            },
        }

    dates = [r.date for r in sorted_records]
    prices = [float(r.closing_price) for r in sorted_records]
    sentiments = [float(r.combined_sentiment) for r in sorted_records]

    # Calculate Pearson Correlation
    r, r_squared, slope, intercept = calculate_pearson_correlation(sentiments, prices)

    # Calculate Rolling Correlation
    rolling_corrs = calculate_rolling_correlation(prices, sentiments, window=window)

    # Build Scatter Points
    scatter_points = []
    for i in range(len(sorted_records)):
        p_pct = 0.0
        if i > 0 and prices[i - 1] > 0:
            p_pct = round(((prices[i] - prices[i - 1]) / prices[i - 1]) * 100, 2)

        scatter_points.append(
            {
                "date": dates[i],
                "sentiment": sentiments[i],
                "closing_price": prices[i],
                "price_change_pct": p_pct,
            }
        )

    # Build Combined Trend
    combined_trend = []
    for i in range(len(sorted_records)):
        combined_trend.append(
            {
                "date": dates[i],
                "closing_price": prices[i],
                "sentiment": sentiments[i],
                "rolling_correlation": rolling_corrs[i],
            }
        )

    # Generate Plain English Narrative Explanation
    explanation = generate_plain_english_explanation(
        symbol=symbol,
        r=r,
        r_squared=r_squared,
        window=window,
        sample_size=len(sorted_records),
        rolling_corrs=rolling_corrs,
    )

    return {
        "symbol": symbol,
        "period": period,
        "rolling_window": window,
        "pearson_r": r,
        "r_squared": r_squared,
        "slope": slope,
        "intercept": intercept,
        "sample_size": len(sorted_records),
        "scatter_points": scatter_points,
        "combined_trend": combined_trend,
        "explanation": explanation,
    }
