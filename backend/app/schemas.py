"""Pydantic response models — the contract between backend and frontend."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class Quote(BaseModel):
    symbol: str
    price: float
    open: float
    high: float
    low: float
    prev_close: float
    change: float
    change_pct: float
    source: str = "finnhub"


class Candle(BaseModel):
    time: str  # YYYY-MM-DD
    open: float
    high: float
    low: float
    close: float
    volume: int


class HistoryResponse(BaseModel):
    symbol: str
    candles: list[Candle]
    source: str = "yfinance"


class Indicators(BaseModel):
    symbol: str
    rsi_14: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    ema_20: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    engine: str = "talib"


class NewsArticle(BaseModel):
    headline: str
    summary: str
    source: str
    url: str
    date: str  # YYYY-MM-DD
    sentiment_label: str  # positive | negative | neutral
    sentiment_score: float  # -1..1, positive-minus-negative confidence


class NewsResponse(BaseModel):
    symbol: str
    articles: list[NewsArticle]
    daily_sentiment: list[dict]  # [{date, score}]
    model: str = "ProsusAI/finbert"


class Insight(BaseModel):
    symbol: str
    brief: str
    model: str
    generated_at: str  # ISO 8601 UTC timestamp


class TranscriptChunk(BaseModel):
    speaker: str
    text: str
    sentiment_label: str
    sentiment_score: float


class TranscriptResponse(BaseModel):
    symbol: str
    company_name: str
    quarter: str
    year: int
    date: str
    chunks: list[TranscriptChunk]
    overall_sentiment: float
    sentiment_label: str
    positive_pct: float
    neutral_pct: float
    negative_pct: float
    avg_confidence: float


class RedditPost(BaseModel):
    title: str
    body: str
    subreddit: str
    score: int
    num_comments: int
    url: str
    author: str
    date: str
    sentiment_label: str
    sentiment_score: float
    confidence: float


class SubredditBreakdown(BaseModel):
    subreddit: str
    count: int
    average_sentiment: float
    confidence: float


class RedditResponse(BaseModel):
    symbol: str
    average_sentiment: float
    number_of_posts_analyzed: int
    confidence: float
    trending_discussions: list[RedditPost]
    subreddits_breakdown: list[SubredditBreakdown]
    model: str = "ProsusAI/finbert"


class MergedSentimentResponse(BaseModel):
    symbol: str
    merged_sentiment: float
    merged_label: str
    merged_confidence: float
    news_sentiment: float
    news_articles_count: int
    reddit_sentiment: float
    reddit_posts_count: int
    model: str = "ProsusAI/finbert"


class HistoricalSentimentCreate(BaseModel):
    ticker: str
    date: str
    news_sentiment: float
    reddit_sentiment: float
    combined_sentiment: float
    closing_price: float
    prediction: str


class HistoricalSentimentResponse(BaseModel):
    id: int
    ticker: str
    date: str
    news_sentiment: float
    reddit_sentiment: float
    combined_sentiment: float
    closing_price: float
    prediction: str
    created_at: str

    class Config:
        from_attributes = True


class MarketMoodIndexDetails(BaseModel):
    rsi: Optional[float] = None
    percent_b: Optional[float] = None
    ma_signal: str = "Neutral"
    macd_signal: str = "Neutral"


class MarketMoodIndexResponse(BaseModel):
    symbol: str
    mmi_score: float
    category: str
    news_score: float
    news_sentiment: float
    news_count: int
    reddit_score: float
    reddit_sentiment: float
    reddit_count: int
    technical_score: float
    technical_details: MarketMoodIndexDetails


class ScatterPoint(BaseModel):
    date: str
    sentiment: float
    closing_price: float
    price_change_pct: float


class TrendPoint(BaseModel):
    date: str
    closing_price: float
    sentiment: float
    rolling_correlation: Optional[float] = None


class CorrelationExplanation(BaseModel):
    summary: str
    strength_direction: str
    signal_classification: str
    practical_meaning: str
    rolling_trend: str
    investor_takeaway: str


class CorrelationResponse(BaseModel):
    symbol: str
    period: str
    rolling_window: int
    pearson_r: float
    r_squared: float
    slope: float
    intercept: float
    sample_size: int
    scatter_points: list[ScatterPoint]
    combined_trend: list[TrendPoint]
    explanation: CorrelationExplanation


class SignalDetail(BaseModel):
    indicator: str
    signal: str  # BUY | HOLD | SELL
    value: str
    weight: float
    score: float  # -1.0 to +1.0
    reasoning: str


class RecommendationResponse(BaseModel):
    symbol: str
    recommendation: str  # BUY | HOLD | SELL
    confidence: float    # percentage 0..100
    confidence_label: str # High | Moderate | Low
    score: float         # composite score -1.0 to +1.0
    summary_reasoning: str
    indicators_breakdown: list[SignalDetail]
    metrics: dict
    generated_at: str


class FeatureImportanceItem(BaseModel):
    feature_name: str
    importance_pct: float
    category: str
    description: str


class ModelPerformanceMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    roc_auc: float
    train_samples: int
    test_samples: int


class HistoricalPredictionEvaluation(BaseModel):
    date: str
    predicted_direction: str
    probability_up: float
    actual_direction: str
    actual_change_pct: float
    is_correct: bool


class MLPredictionResponse(BaseModel):
    symbol: str
    model_type: str
    model_key: str
    prediction: str
    probability_up: float
    probability_down: float
    confidence_score: float
    confidence_label: str
    prediction_date: str
    last_close: float
    metrics: ModelPerformanceMetrics
    feature_importances: list[FeatureImportanceItem]
    latest_features: dict
    historical_evaluations: list[HistoricalPredictionEvaluation]
    summary_reasoning: str

