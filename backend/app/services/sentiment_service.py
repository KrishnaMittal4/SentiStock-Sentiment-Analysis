"""
Real NLP sentiment via ProsusAI/finbert (a BERT model fine-tuned on
financial text), run through PyTorch on the backend.

This replaces the browser-side keyword lexicon from the client-only
version of the app — that was a stopgap for running entirely in a
browser with no server. Now that there's a FastAPI backend, this does
the actual model inference the frontend's copy always described.

The pipeline is loaded once (module-level singleton) and reused across
requests — reloading a ~440MB model per request would make every news
call take several seconds.
"""

from __future__ import annotations

import datetime as dt
from typing import Any, cast

from transformers import pipeline

from ..config import get_settings

settings = get_settings()

_pipeline: Any = None


def _get_pipeline():
    global _pipeline
    if _pipeline is None:
        # device=-1 forces CPU; set to 0 if you have a CUDA GPU available.
        _pipeline = cast(Any, pipeline)(
            "sentiment-analysis",
            model=settings.sentiment_model_name,
            tokenizer=settings.sentiment_model_name,
            device=-1,
        )
    return _pipeline


def _unix_to_date(ts: int) -> str:
    return dt.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")


def _label_to_signed_score(label: str, confidence: float) -> float:
    """FinBERT returns one of positive/negative/neutral plus a confidence
    in [0,1] for that label. Convert to a signed -1..1 score so the rest
    of the app's aggregation math (daily averages, correlation, etc.)
    keeps working exactly like it did with the old -1..1 scores."""
    label = label.lower()
    if label == "positive":
        return round(confidence, 4)
    if label == "negative":
        return round(-confidence, 4)
    return 0.0


def score_articles(raw_articles: list[dict[str, Any]]) -> dict[str, Any]:
    """
    raw_articles: Finnhub /company-news items (headline, summary, source,
    url, datetime, ...).
    Returns { articles: [...with sentiment...], daily_sentiment: [...],
    avg_confidence: float|None }
    """
    if not raw_articles:
        return {"articles": [], "daily_sentiment": [], "avg_confidence": None}

    nlp = _get_pipeline()

    texts = [
        f"{a.get('headline', '')}. {a.get('summary', '')}".strip()[:512]
        for a in raw_articles
    ]
    predictions = nlp(texts, truncation=True)

    scored_articles = []
    by_day: dict[str, list[float]] = {}
    confidences: list[float] = []

    for article, pred in zip(raw_articles, predictions):
        score = _label_to_signed_score(pred["label"], pred["score"])
        label = "positive" if score > 0.12 else "negative" if score < -0.12 else "neutral"
        date_str = _unix_to_date(article.get("datetime", 0))

        # pred["score"] is FinBERT's own softmax probability for whichever
        # label it picked — the model's actual confidence in that specific
        # prediction, not a proxy for it. Averaged below across every
        # article for this ticker to give one headline confidence number.
        confidences.append(pred["score"])

        scored_articles.append({
            "headline": article.get("headline", ""),
            "summary": article.get("summary", ""),
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