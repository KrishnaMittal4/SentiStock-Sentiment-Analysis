"""
Rule-based Buy / Hold / Sell Recommendation Engine for SentiStock AI.

Evaluates 6 core indicators:
1. RSI (14)
2. MACD (12, 26, 9)
3. EMA (20) vs Price
4. Bollinger Bands (20, 2σ) vs Price
5. News Sentiment (FinBERT score)
6. Reddit Sentiment (FinBERT score)

Outputs: BUY, HOLD, or SELL with confidence score (%) and detailed reasoning.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional


def _get_signal_label(score: float) -> str:
    if score >= 0.25:
        return "BUY"
    elif score <= -0.25:
        return "SELL"
    return "HOLD"


def compute_recommendation(
    symbol: str,
    price: float,
    indicators: Optional[dict[str, Any]],
    news_data: Optional[dict[str, Any]],
    reddit_data: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """
    Computes a rule-based Buy/Hold/Sell recommendation for a given stock symbol.
    """
    indicators = indicators or {}
    news_data = news_data or {}
    reddit_data = reddit_data or {}

    breakdown: list[dict[str, Any]] = []

    # ------------------------------------------------------------------
    # 1. RSI (14)
    # ------------------------------------------------------------------
    rsi_val = indicators.get("rsi_14")
    if rsi_val is not None:
        rsi_float = float(rsi_val)
        if rsi_float < 30.0:
            rsi_score = 1.0
            rsi_val_str = f"{rsi_float:.1f} (Oversold < 30)"
            rsi_reason = f"RSI of {rsi_float:.1f} is below 30, signaling deeply oversold conditions and strong bullish rebound potential."
        elif rsi_float < 42.0:
            rsi_score = 0.5
            rsi_val_str = f"{rsi_float:.1f} (Mildly Oversold)"
            rsi_reason = f"RSI of {rsi_float:.1f} is approaching oversold territory, indicating nascent bullish momentum."
        elif rsi_float <= 58.0:
            rsi_score = 0.0
            rsi_val_str = f"{rsi_float:.1f} (Neutral 42-58)"
            rsi_reason = f"RSI of {rsi_float:.1f} is in the neutral zone, reflecting balanced buying and selling pressure."
        elif rsi_float <= 70.0:
            rsi_score = -0.5
            rsi_val_str = f"{rsi_float:.1f} (Mildly Overbought)"
            rsi_reason = f"RSI of {rsi_float:.1f} is elevated above 58, warning of potential upside exhaustion."
        else:
            rsi_score = -1.0
            rsi_val_str = f"{rsi_float:.1f} (Overbought > 70)"
            rsi_reason = f"RSI of {rsi_float:.1f} is above 70, signaling overbought conditions with pull-back risk."
    else:
        rsi_score = 0.0
        rsi_val_str = "N/A"
        rsi_reason = "RSI (14) indicator data is unavailable."

    breakdown.append({
        "indicator": "RSI (14)",
        "signal": _get_signal_label(rsi_score),
        "value": rsi_val_str,
        "weight": 1.0,
        "score": rsi_score,
        "reasoning": rsi_reason,
    })

    # ------------------------------------------------------------------
    # 2. MACD (12, 26, 9)
    # ------------------------------------------------------------------
    macd = indicators.get("macd")
    macd_sig = indicators.get("macd_signal")
    macd_hist = indicators.get("macd_hist")

    if macd is not None and macd_sig is not None and macd_hist is not None:
        m_val = float(macd)
        ms_val = float(macd_sig)
        mh_val = float(macd_hist)

        if mh_val > 0 and m_val > ms_val:
            macd_score = 1.0
            macd_val_str = f"Hist: {mh_val:+.2f} (Bullish Crossover)"
            macd_reason = f"MACD line ({m_val:.2f}) is above signal line ({ms_val:.2f}) with expanding positive histogram ({mh_val:+.2f}), indicating strong bullish momentum."
        elif mh_val > 0:
            macd_score = 0.5
            macd_val_str = f"Hist: {mh_val:+.2f} (Bullish)"
            macd_reason = f"MACD histogram is positive ({mh_val:+.2f}), reflecting upward momentum building."
        elif abs(mh_val) <= 0.02:
            macd_score = 0.0
            macd_val_str = f"Hist: {mh_val:+.2f} (Neutral)"
            macd_reason = f"MACD histogram is near zero ({mh_val:+.2f}), indicating momentum convergence."
        elif mh_val < 0 and m_val < ms_val:
            macd_score = -1.0
            macd_val_str = f"Hist: {mh_val:+.2f} (Bearish Crossover)"
            macd_reason = f"MACD line ({m_val:.2f}) is below signal line ({ms_val:.2f}) with negative histogram ({mh_val:+.2f}), indicating bearish momentum."
        else:
            macd_score = -0.5
            macd_val_str = f"Hist: {mh_val:+.2f} (Bearish)"
            macd_reason = f"MACD histogram is negative ({mh_val:+.2f}), reflecting downward momentum."
    else:
        macd_score = 0.0
        macd_val_str = "N/A"
        macd_reason = "MACD indicator data is unavailable."

    breakdown.append({
        "indicator": "MACD",
        "signal": _get_signal_label(macd_score),
        "value": macd_val_str,
        "weight": 1.0,
        "score": macd_score,
        "reasoning": macd_reason,
    })

    # ------------------------------------------------------------------
    # 3. EMA (20) vs Price
    # ------------------------------------------------------------------
    ema_20 = indicators.get("ema_20")
    if ema_20 is not None and price > 0:
        ema_val = float(ema_20)
        pct_diff = ((price - ema_val) / ema_val) * 100.0

        if pct_diff >= 1.5:
            ema_score = 1.0
            ema_val_str = f"${price:.2f} (+{pct_diff:.1f}% vs EMA)"
            ema_reason = f"Stock price (${price:.2f}) is trading +{pct_diff:.1f}% above the 20-day EMA (${ema_val:.2f}), confirming a solid bullish uptrend."
        elif pct_diff >= 0.2:
            ema_score = 0.5
            ema_val_str = f"${price:.2f} (+{pct_diff:.1f}% vs EMA)"
            ema_reason = f"Stock price (${price:.2f}) is slightly above the 20-day EMA (${ema_val:.2f}), maintaining a moderate bullish bias."
        elif pct_diff >= -0.2:
            ema_score = 0.0
            ema_val_str = f"${price:.2f} ({pct_diff:+.1f}% vs EMA)"
            ema_reason = f"Stock price (${price:.2f}) is hovering near the 20-day EMA (${ema_val:.2f}), awaiting clear breakout direction."
        elif pct_diff >= -1.5:
            ema_score = -0.5
            ema_val_str = f"${price:.2f} ({pct_diff:.1f}% vs EMA)"
            ema_reason = f"Stock price (${price:.2f}) is trading below the 20-day EMA (${ema_val:.2f}), indicating short-term bearish pressure."
        else:
            ema_score = -1.0
            ema_val_str = f"${price:.2f} ({pct_diff:.1f}% vs EMA)"
            ema_reason = f"Stock price (${price:.2f}) is trading {pct_diff:.1f}% below the 20-day EMA (${ema_val:.2f}), confirming a clear downtrend."
    else:
        ema_score = 0.0
        ema_val_str = "N/A"
        ema_reason = "20-day EMA data is unavailable."

    breakdown.append({
        "indicator": "20-Day EMA",
        "signal": _get_signal_label(ema_score),
        "value": ema_val_str,
        "weight": 1.0,
        "score": ema_score,
        "reasoning": ema_reason,
    })

    # ------------------------------------------------------------------
    # 4. Bollinger Bands (20, 2σ)
    # ------------------------------------------------------------------
    bb_upper = indicators.get("bb_upper")
    bb_lower = indicators.get("bb_lower")
    bb_middle = indicators.get("bb_middle")

    if bb_upper is not None and bb_lower is not None and bb_upper > bb_lower and price > 0:
        b_up = float(bb_upper)
        b_low = float(bb_lower)
        pct_b = ((price - b_low) / (b_up - b_low)) * 100.0

        if pct_b <= 15.0:
            bb_score = 1.0
            bb_val_str = f"%B: {pct_b:.1f}% (Lower Band)"
            bb_reason = f"Price is near/below the lower Bollinger Band (${b_low:.2f}, %B {pct_b:.1f}%), signaling an oversold mean-reversion opportunity."
        elif pct_b < 40.0:
            bb_score = 0.5
            bb_val_str = f"%B: {pct_b:.1f}% (Lower Half)"
            bb_reason = f"Price is in the lower half of Bollinger Bands (%B {pct_b:.1f}%), offering attractive risk/reward space for upside."
        elif pct_b <= 60.0:
            bb_score = 0.0
            bb_val_str = f"%B: {pct_b:.1f}% (Middle Band)"
            bb_reason = f"Price is trading near the middle band / 20 SMA (%B {pct_b:.1f}%), showing neutral volatility alignment."
        elif pct_b < 85.0:
            bb_score = -0.5
            bb_val_str = f"%B: {pct_b:.1f}% (Upper Half)"
            bb_reason = f"Price is trading in the upper band region (%B {pct_b:.1f}%), approaching potential resistance."
        else:
            bb_score = -1.0
            bb_val_str = f"%B: {pct_b:.1f}% (Upper Band)"
            bb_reason = f"Price is near/above the upper Bollinger Band (${b_up:.2f}, %B {pct_b:.1f}%), indicating overextended price action and pull-back risk."
    else:
        bb_score = 0.0
        bb_val_str = "N/A"
        bb_reason = "Bollinger Bands indicator data is unavailable."

    breakdown.append({
        "indicator": "Bollinger Bands",
        "signal": _get_signal_label(bb_score),
        "value": bb_val_str,
        "weight": 1.0,
        "score": bb_score,
        "reasoning": bb_reason,
    })

    # ------------------------------------------------------------------
    # 5. News Sentiment (FinBERT)
    # ------------------------------------------------------------------
    articles = news_data.get("articles") or []
    if articles:
        scores = [float(a.get("sentiment_score", 0.0)) for a in articles]
        news_sentiment = sum(scores) / len(scores) if scores else 0.0
    else:
        news_sentiment = 0.0

    if news_sentiment >= 0.25:
        news_score = 1.0
        news_val_str = f"{news_sentiment:+.2f} (Strongly Positive)"
        news_reason = f"Financial news sentiment is strongly positive ({news_sentiment:+.2f}) across {len(articles)} articles, reflecting bullish news coverage."
    elif news_sentiment >= 0.05:
        news_score = 0.5
        news_val_str = f"{news_sentiment:+.2f} (Mildly Positive)"
        news_reason = f"Financial news sentiment is mildly positive ({news_sentiment:+.2f}) across {len(articles)} articles, supporting upward bias."
    elif news_sentiment >= -0.05:
        news_score = 0.0
        news_val_str = f"{news_sentiment:+.2f} (Neutral)"
        news_reason = f"Financial news sentiment is neutral ({news_sentiment:+.2f}) across {len(articles)} articles."
    elif news_sentiment >= -0.25:
        news_score = -0.5
        news_val_str = f"{news_sentiment:+.2f} (Mildly Negative)"
        news_reason = f"Financial news sentiment is mildly negative ({news_sentiment:+.2f}) across {len(articles)} articles, creating short-term drag."
    else:
        news_score = -1.0
        news_val_str = f"{news_sentiment:+.2f} (Strongly Negative)"
        news_reason = f"Financial news sentiment is strongly negative ({news_sentiment:+.2f}) across {len(articles)} articles, highlighting adverse media tone."

    breakdown.append({
        "indicator": "News Sentiment",
        "signal": _get_signal_label(news_score),
        "value": news_val_str,
        "weight": 1.0,
        "score": news_score,
        "reasoning": news_reason,
    })

    # ------------------------------------------------------------------
    # 6. Reddit Sentiment (FinBERT)
    # ------------------------------------------------------------------
    reddit_sentiment = float(reddit_data.get("average_sentiment", 0.0))
    reddit_posts_cnt = int(reddit_data.get("number_of_posts_analyzed", 0))

    if reddit_sentiment >= 0.25:
        reddit_score = 1.0
        reddit_val_str = f"{reddit_sentiment:+.2f} (Strongly Positive)"
        reddit_reason = f"Reddit retail sentiment is strongly bullish ({reddit_sentiment:+.2f}) across {reddit_posts_cnt} analyzed discussions."
    elif reddit_sentiment >= 0.05:
        reddit_score = 0.5
        reddit_val_str = f"{reddit_sentiment:+.2f} (Mildly Positive)"
        reddit_reason = f"Reddit retail sentiment leans positive ({reddit_sentiment:+.2f}) across {reddit_posts_cnt} analyzed discussions."
    elif reddit_sentiment >= -0.05:
        reddit_score = 0.0
        reddit_val_str = f"{reddit_sentiment:+.2f} (Neutral)"
        reddit_reason = f"Reddit retail community sentiment is neutral ({reddit_sentiment:+.2f}) across {reddit_posts_cnt} discussions."
    elif reddit_sentiment >= -0.25:
        reddit_score = -0.5
        reddit_val_str = f"{reddit_sentiment:+.2f} (Mildly Negative)"
        reddit_reason = f"Reddit retail discussions lean bearish ({reddit_sentiment:+.2f}) across {reddit_posts_cnt} discussions."
    else:
        reddit_score = -1.0
        reddit_val_str = f"{reddit_sentiment:+.2f} (Strongly Negative)"
        reddit_reason = f"Reddit retail sentiment is strongly bearish ({reddit_sentiment:+.2f}) across {reddit_posts_cnt} discussions."

    breakdown.append({
        "indicator": "Reddit Sentiment",
        "signal": _get_signal_label(reddit_score),
        "value": reddit_val_str,
        "weight": 1.0,
        "score": reddit_score,
        "reasoning": reddit_reason,
    })

    # ------------------------------------------------------------------
    # Aggregate Scoring & Overall Recommendation
    # ------------------------------------------------------------------
    total_weight = sum(item["weight"] for item in breakdown)
    composite_score = sum(item["score"] * item["weight"] for item in breakdown) / total_weight if total_weight > 0 else 0.0

    if composite_score >= 0.20:
        recommendation = "BUY"
    elif composite_score <= -0.20:
        recommendation = "SELL"
    else:
        recommendation = "HOLD"

    # ------------------------------------------------------------------
    # Confidence Score Calculation
    # ------------------------------------------------------------------
    active_items = [b for b in breakdown if b["value"] != "N/A"]
    if recommendation == "BUY":
        matching_count = sum(1 for b in active_items if b["score"] > 0)
    elif recommendation == "SELL":
        matching_count = sum(1 for b in active_items if b["score"] < 0)
    else:
        matching_count = sum(1 for b in active_items if abs(b["score"]) <= 0.25)

    agreement_pct = (matching_count / len(active_items)) * 100.0 if active_items else 50.0
    magnitude_pct = abs(composite_score) * 100.0

    raw_confidence = (agreement_pct * 0.5) + (magnitude_pct * 0.5)
    confidence = min(96.0, max(52.0, round(raw_confidence, 1)))

    if confidence >= 75.0:
        confidence_label = "High Confidence"
    elif confidence >= 62.0:
        confidence_label = "Moderate Confidence"
    else:
        confidence_label = "Low Confidence"

    # ------------------------------------------------------------------
    # Summary Reasoning Paragraph
    # ------------------------------------------------------------------
    bullish_signals = [b["indicator"] for b in breakdown if b["score"] > 0]
    bearish_signals = [b["indicator"] for b in breakdown if b["score"] < 0]

    if recommendation == "BUY":
        drivers = ", ".join(bullish_signals) if bullish_signals else "technical and sentiment factors"
        summary = (
            f"Overall recommendation for {symbol} is BUY with a composite score of {composite_score:+.2f} ({confidence:.0f}% confidence). "
            f"Bullish momentum is primarily driven by strong signals from {drivers}. "
        )
        if bearish_signals:
            summary += f"However, caution is advised as {', '.join(bearish_signals)} currently show opposing bearish pressure."
        else:
            summary += "Technical indicators and market sentiment are broadly aligned in support of further upside."
    elif recommendation == "SELL":
        drivers = ", ".join(bearish_signals) if bearish_signals else "technical and sentiment factors"
        summary = (
            f"Overall recommendation for {symbol} is SELL with a composite score of {composite_score:+.2f} ({confidence:.0f}% confidence). "
            f"Bearish pressure is driven by weak signals across {drivers}. "
        )
        if bullish_signals:
            summary += f"Note that {', '.join(bullish_signals)} provide minor support against a broader decline."
        else:
            summary += "Both price action momentum and sentiment indicators point toward continued downward exposure."
    else:
        summary = (
            f"Overall recommendation for {symbol} is HOLD with a composite score of {composite_score:+.2f} ({confidence:.0f}% confidence). "
            f"Signals are mixed across indicators: bullish support from ({', '.join(bullish_signals) or 'none'}) is balanced by bearish pull ({', '.join(bearish_signals) or 'none'}). "
            f"A neutral stance is recommended until a decisive breakout occurs."
        )

    metrics = {
        "price": price,
        "rsi_14": rsi_val,
        "macd": macd,
        "macd_signal": macd_sig,
        "macd_hist": macd_hist,
        "ema_20": ema_20,
        "bb_upper": bb_upper,
        "bb_middle": bb_middle,
        "bb_lower": bb_lower,
        "news_sentiment": news_sentiment,
        "reddit_sentiment": reddit_sentiment,
    }

    return {
        "symbol": symbol,
        "recommendation": recommendation,
        "confidence": confidence,
        "confidence_label": confidence_label,
        "score": round(composite_score, 3),
        "summary_reasoning": summary,
        "indicators_breakdown": breakdown,
        "metrics": metrics,
        "generated_at": dt.datetime.utcnow().isoformat() + "Z",
    }
