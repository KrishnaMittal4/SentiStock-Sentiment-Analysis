"""
Central configuration for the SentiStock AI backend.

All secrets/keys live server-side now — the browser no longer needs
(or asks for) a Finnhub key. Set these via a .env file (see .env.example)
or real environment variables in production.
"""

import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- API keys -----------------------------------------------------
    finnhub_api_key: str = os.getenv("FINNHUB_API_KEY", "")

    # --- Database -------------------------------------------------------
    # Defaults to a local SQLite file — zero setup, works immediately.
    # Swap to Postgres (self-hosted, Docker, or free-tier Neon) by setting
    # DATABASE_URL, e.g.:
    #   postgresql+psycopg2://user:pass@localhost:5432/sentistock
    # The caching layer in app/database.py works unchanged either way.
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./sentistock.db")

    # --- CORS -------------------------------------------------------------
    # The Vite/static frontend origin(s) allowed to call this API.
    # NOTE: kept as a plain comma-separated str (not list[str]). If this
    # field were typed as list[str], pydantic-settings would try to
    # JSON-decode any matching env var instead of using the default here —
    # and a comma-separated value like "http://a,http://b" isn't valid
    # JSON, which raises a SettingsError before Settings() ever finishes
    # constructing. Splitting it ourselves in a validator avoids that.
    cors_origins: str = os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000,http://127.0.0.1:8000"
    )

    @field_validator("cors_origins", mode="after")
    @classmethod
    def _split_cors_origins(cls, v: str) -> list[str]:
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    # --- Caching ------------------------------------------------------
    quote_cache_seconds: int = int(os.getenv("QUOTE_CACHE_SECONDS", "30"))
    history_cache_seconds: int = int(os.getenv("HISTORY_CACHE_SECONDS", "3600"))
    news_cache_seconds: int = int(os.getenv("NEWS_CACHE_SECONDS", "600"))

    # --- Sentiment model ------------------------------------------------
    # Default: mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis
    # ~90 MB vs ProsusAI/finbert's 440 MB — finance-domain trained on financial
    # news headlines so it's more accurate than generic SST-2 distilbert for
    # stock sentiment, while still fitting comfortably in Render's free-tier RAM.
    # Override via SENTIMENT_MODEL_NAME env var if you want full FinBERT locally.
    sentiment_model_name: str = os.getenv(
        "SENTIMENT_MODEL_NAME",
        "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis",
    )

    # --- AI market brief (Groq) ------------------------------------------
    # Separate from FinBERT on purpose: FinBERT classifies individual
    # headlines, Groq synthesizes quote + indicators + sentiment + news
    # into one readable paragraph. Free tier at console.groq.com — no
    # credit card needed. llama-3.3-70b-versatile is a good default:
    # fast enough to call live, and does a solid job of not overreaching
    # on data it's actually given.
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model_name: str = os.getenv("GROQ_MODEL_NAME", "qwen/qwen3.8-27b")
    insight_cache_seconds: int = int(os.getenv("INSIGHT_CACHE_SECONDS", "1800"))

    # --- HTTP & Retry Configuration ---------------------------------------
    http_timeout_seconds: float = float(os.getenv("HTTP_TIMEOUT_SECONDS", "10.0"))
    http_connect_timeout_seconds: float = float(os.getenv("HTTP_CONNECT_TIMEOUT_SECONDS", "3.0"))
    http_max_retries: int = int(os.getenv("HTTP_MAX_RETRIES", "3"))
    http_backoff_factor: float = float(os.getenv("HTTP_BACKOFF_FACTOR", "0.5"))

    # --- In-Memory & DB Cache Configuration --------------------------------
    memory_cache_max_size: int = int(os.getenv("MEMORY_CACHE_MAX_SIZE", "500"))
    cache_cleanup_interval_seconds: int = int(os.getenv("CACHE_CLEANUP_INTERVAL_SECONDS", "3600"))

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
