"""
AI market brief via Groq (fast LPU-hosted open-source LLM inference,
free tier at console.groq.com — no credit card needed).

This is deliberately NOT another sentiment scorer — FinBERT already
does per-headline classification in sentiment_service.py, and does it
well. What Groq adds is synthesis: taking the quote, technical
indicators, recent sentiment trend, and real headlines that already
exist elsewhere in this backend, and turning them into one coherent,
readable paragraph. It's the one thing none of the other services can
do — they all produce numbers, this produces an explanation.

Deliberately one call per ticker load (not per headline) — FinBERT
already handles per-headline scoring locally, so Groq is only asked to
reason over a pre-digested summary. That keeps this comfortably inside
Groq's free-tier rate limits (as of mid-2026: ~30 requests/min on
llama-3.3-70b-versatile) even under regular use.
"""

from __future__ import annotations

from typing import Any, Optional

from groq import Groq

from ..config import get_settings

settings = get_settings()

_client: Optional[Groq] = None


class GroqError(Exception):
    pass


def _get_client() -> Groq:
    global _client
    if not settings.groq_api_key:
        raise GroqError("GROQ_API_KEY is not set on the server")
    if _client is None:
        _client = Groq(api_key=settings.groq_api_key)
    return _client


SYSTEM_PROMPT = (
    "You are a financial analysis assistant writing a short daily brief for a "
    "stock market dashboard. You're given real quote data, technical "
    "indicators, a recent daily sentiment trend, and real recent news "
    "headlines with their sentiment labels for one ticker. Write a concise, "
    "plain-English brief (3-5 sentences) that connects the sentiment, the "
    "news, and the technical indicators into a coherent explanation of what's "
    "happening with this stock right now. Reference the actual numbers you "
    "were given. Do not invent facts, prices, or news not present in the "
    "data. Do not give buy/sell recommendations or price targets — describe "
    "what the data shows, not what to do about it. If a section of data is "
    "missing (e.g. no technicals yet), don't dwell on the absence, just work "
    "with what's there."
)


def _build_user_prompt(
    symbol: str,
    quote: dict[str, Any],
    indicators: Optional[dict[str, Any]],
    daily_sentiment: list[dict[str, Any]],
    articles: list[dict[str, Any]],
) -> str:
    lines = [f"Ticker: {symbol}"]

    if quote:
        lines.append(
            f"Price: ${quote['price']:.2f} ({quote['change']:+.2f}, "
            f"{quote['change_pct']:+.2f}%). Day range "
            f"${quote['low']:.2f}-${quote['high']:.2f}. "
            f"Prev close ${quote['prev_close']:.2f}."
        )

    if indicators:
        parts = []
        if indicators.get("rsi_14") is not None:
            parts.append(f"RSI(14)={indicators['rsi_14']:.1f}")
        if indicators.get("macd") is not None and indicators.get("macd_signal") is not None:
            parts.append(f"MACD={indicators['macd']:.2f}, signal={indicators['macd_signal']:.2f}")
        if indicators.get("sma_20") is not None:
            parts.append(f"SMA20=${indicators['sma_20']:.2f}")
        if indicators.get("sma_50") is not None:
            parts.append(f"SMA50=${indicators['sma_50']:.2f}")
        if indicators.get("bb_upper") is not None and indicators.get("bb_lower") is not None:
            parts.append(
                f"Bollinger Bands: lower=${indicators['bb_lower']:.2f}, "
                f"mid=${indicators['bb_middle']:.2f}, upper=${indicators['bb_upper']:.2f}"
            )
        lines.append("Technicals: " + ("; ".join(parts) if parts else "not enough price history yet."))
    else:
        lines.append("Technicals: not enough price history yet.")

    if daily_sentiment:
        recent = daily_sentiment[-5:]
        trend_str = ", ".join(f"{d['date']}: {d['score']:+.2f}" for d in recent)
        lines.append(f"Recent daily sentiment score (-1 bearish to +1 bullish): {trend_str}")
    else:
        lines.append("No recent sentiment data available.")

    if articles:
        lines.append("Recent headlines (with sentiment label):")
        for a in articles[:8]:
            label = a.get("sentiment_label", "neutral")
            headline = a.get("headline", "")
            lines.append(f"- [{label}] {headline}")
    else:
        lines.append("No recent news articles available.")

    return "\n".join(lines)


from ..logging_config import logger
from ..utils.http_client import execute_with_retry


def generate_fallback_brief(
    symbol: str,
    quote: dict[str, Any],
    indicators: Optional[dict[str, Any]],
    daily_sentiment: list[dict[str, Any]],
    articles: list[dict[str, Any]],
) -> str:
    """
    Algorithmic financial brief used when GROQ_API_KEY is not provided
    or if Groq rate limits are reached, ensuring zero UI downtime.
    """
    price_str = f"${quote.get('price', 0):.2f}"
    change_pct = quote.get("change_pct", 0)
    direction = "up" if change_pct >= 0 else "down"

    avg_score = 0.0
    if daily_sentiment:
        scores = [d.get("score", 0.0) for d in daily_sentiment if "score" in d]
        if scores:
            avg_score = sum(scores) / len(scores)

    sentiment_desc = "bullish" if avg_score > 0.08 else ("bearish" if avg_score < -0.08 else "neutral")

    tech_desc = []
    if indicators:
        rsi = indicators.get("rsi_14")
        if rsi is not None:
            if rsi > 70:
                tech_desc.append("overbought momentum (RSI > 70)")
            elif rsi < 30:
                tech_desc.append("oversold momentum (RSI < 30)")
            else:
                tech_desc.append(f"neutral RSI momentum ({rsi:.1f})")

        sma20 = indicators.get("sma_20")
        price = quote.get("price", 0)
        if sma20 and price:
            if price > sma20:
                tech_desc.append("holding above its 20-day SMA")
            else:
                tech_desc.append("trading below its 20-day SMA")

    tech_summary = ", while ".join(tech_desc) if tech_desc else "with momentum consolidating"
    article_count = len(articles)

    return (
        f"{symbol} is trading at {price_str}, {direction} {abs(change_pct):.2f}% on the session. "
        f"News sentiment synthesized across {article_count} headlines is currently {sentiment_desc} "
        f"(composite score: {avg_score:+.2f}). Technicals show {tech_summary}."
    )


def generate_brief(
    symbol: str,
    quote: dict[str, Any],
    indicators: Optional[dict[str, Any]],
    daily_sentiment: list[dict[str, Any]],
    articles: list[dict[str, Any]],
) -> str:
    client = _get_client()
    user_prompt = _build_user_prompt(symbol, quote, indicators, daily_sentiment, articles)

    def _do_completion():
        return client.chat.completions.create(
            model=settings.groq_model_name,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_tokens=240,
        )

    try:
        completion = _do_completion()
    except Exception as exc:
        logger.warning(f"[GroqService] Initial call failed for {symbol}: {exc}. Retrying...")
        try:
            # Re-try creation in case of transient connection drop
            completion = _do_completion()
        except Exception as retry_exc:
            logger.error(f"[GroqService] Groq request failed for {symbol}: {retry_exc}")
            raise GroqError(f"Groq request failed: {retry_exc}") from retry_exc

    text = completion.choices[0].message.content if completion.choices else None
    if not text:
        logger.error(f"[GroqService] Groq returned an empty response for {symbol}")
        raise GroqError("Groq returned an empty response")
    return text.strip()

