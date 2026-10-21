"""
Lightweight NLP sentiment via VADER (Valence Aware Dictionary and sEntiment Reasoner)
+ a finance-domain keyword boost layer.

WHY VADER instead of FinBERT/transformers:
  - VADER is pure Python, ~1 MB install — no torch, no CUDA, no 400 MB RAM cost.
  - Render's free tier has a hard 512 MB RAM limit; PyTorch alone uses ~350 MB on
    import, which causes the OOM crash this file was rewritten to fix.
  - VADER's compound score maps directly to our existing -1..1 sentiment scale.
  - The finance keyword boost layer corrects VADER's known blind spots on financial
    jargon (earnings beats, guidance cuts, etc.) to keep headline accuracy comparable
    to the old FinBERT output.

Output contract is identical to the old transformers-based version so no other
file needs to change.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

# ---------------------------------------------------------------------------
# VADER — installed via vaderSentiment (pure Python, ~1 MB)
# ---------------------------------------------------------------------------
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    _vader = SentimentIntensityAnalyzer()
    _HAS_VADER = True
except ImportError:
    _vader = None  # type: ignore[assignment]
    _HAS_VADER = False

# ---------------------------------------------------------------------------
# Finance-domain keyword boost table
# Maps token -> signed sentiment adjustment to correct VADER's blind spots on
# financial jargon. Values are additive on the compound score.
# ---------------------------------------------------------------------------
_FINANCE_BOOST: dict[str, float] = {
    # Positive signals
    "beat": +0.15, "beats": +0.15, "outperform": +0.15, "upgrade": +0.12,
    "raised": +0.10, "raises": +0.10, "breakout": +0.10, "bull": +0.08,
    "bullish": +0.12, "rally": +0.10, "rebound": +0.08, "recovery": +0.08,
    "dividend": +0.06, "buyback": +0.08, "acquisition": +0.05,
    "guidance raised": +0.20, "record revenue": +0.18, "profit surge": +0.18,
    "strong earnings": +0.18, "revenue beat": +0.18,
    # Negative signals
    "miss": -0.15, "missed": -0.15, "downgrade": -0.15, "cut": -0.10,
    "cuts": -0.10, "lowered": -0.10, "layoff": -0.12, "layoffs": -0.12,
    "bankruptcy": -0.25, "default": -0.20, "recall": -0.12, "lawsuit": -0.10,
    "bear": -0.08, "bearish": -0.12, "crash": -0.18, "plunge": -0.15,
    "plunges": -0.15, "selloff": -0.15, "sell-off": -0.15, "decline": -0.08,
    "disappointing": -0.15, "guidance cut": -0.20, "revenue miss": -0.18,
    "profit warning": -0.20, "loss widens": -0.18,
}


def _finance_boost(text: str) -> float:
    """Returns an additive adjustment in [-0.4, +0.4] based on finance keywords."""
    text_lower = text.lower()
    adj = 0.0
    for kw, val in _FINANCE_BOOST.items():
        if kw in text_lower:
            adj += val
    # Clamp to ±0.4 so a single article can't dominate the daily aggregate
    return max(-0.4, min(0.4, adj))


def _score_text(text: str) -> tuple[float, float]:
    """
    Returns (signed_score, confidence) for a piece of text.
    signed_score is in [-1, 1].  confidence is in [0, 1].
    """
    if not text.strip():
        return 0.0, 0.0

    if _HAS_VADER:
        vs = _vader.polarity_scores(text)
        compound = vs["compound"]  # already in [-1, 1]
        boost = _finance_boost(text)
        # Blend: 70% VADER compound, 30% finance boost
        blended = 0.70 * compound + 0.30 * boost
        # Clamp to [-1, 1]
        blended = max(-1.0, min(1.0, blended))
        confidence = abs(blended)
        return round(blended, 4), round(confidence, 4)

    # Fallback: pure finance keyword heuristic when vaderSentiment isn't installed
    boost = _finance_boost(text)
    confidence = abs(boost)
    return round(boost, 4), round(confidence, 4)


def _unix_to_date(ts: int) -> str:
    return dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")


def score_articles(raw_articles: list[dict[str, Any]]) -> dict[str, Any]:
    """
    raw_articles: Finnhub /company-news items (headline, summary, source,
    url, datetime, ...).
    Returns { articles: [...with sentiment...], daily_sentiment: [...],
    avg_confidence: float|None }

    Output contract is identical to the old transformers/FinBERT version.
    """
    if not raw_articles:
        return {"articles": [], "daily_sentiment": [], "avg_confidence": None}

    scored_articles: list[dict[str, Any]] = []
    by_day: dict[str, list[float]] = {}
    confidences: list[float] = []

    for article in raw_articles:
        headline = article.get("headline", "")
        summary = article.get("summary", "")
        # Weight headline slightly more than summary for financial text
        text = f"{headline}. {headline}. {summary}".strip()[:512]

        score, conf = _score_text(text)
        label = "positive" if score > 0.12 else "negative" if score < -0.12 else "neutral"
        date_str = _unix_to_date(article.get("datetime", 0))

        confidences.append(conf)

        scored_articles.append({
            "headline": headline,
            "summary": summary,
            "source": article.get("source", ""),
            "url": article.get("url", ""),
            "date": date_str,
            "sentiment_label": label,
            "sentiment_score": score,
        })

        by_day.setdefault(date_str, []).append(score)

    daily_sentiment = [
        {"date": day, "score": round(sum(scores) / len(scores), 4)}
        for day, scores in sorted(by_day.items())
    ]

    avg_confidence = round(sum(confidences) / len(confidences), 4) if confidences else None

    return {
        "articles": scored_articles,
        "daily_sentiment": daily_sentiment,
        "avg_confidence": avg_confidence,
    }