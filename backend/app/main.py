from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from .cache import get_cache_stats
from .config import get_settings
from .database import init_db
from .logging_config import logger
from .routers import (
    correlation,
    insight,
    mmi,
    news,
    prediction,
    recommendation,
    reddit,
    report,
    sentiment_storage,
    stock,
    transcript,
)
from .tasks import bg_cleanup_expired_cache_task, bg_warm_stock_cache_task

settings = get_settings()


class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that attaches a unique X-Request-ID to each incoming HTTP request,
    measures execution duration, and outputs structured JSON/KV logs.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        start_time = time.time()

        response = await call_next(request)

        duration_ms = round((time.time() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id

        # Skip spamming logs for health checks
        if request.url.path != "/api/health":
            logger.info(
                f"HTTP {request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms,
                },
            )

        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    logger.info("Initializing SentiStock AI backend & database schemas...")
    init_db()

    # Pre-warm cache in background on startup
    try:
        top_tickers = ["AAPL", "MSFT", "NVDA", "TSLA", "RELIANCE.NS"]
        bg_warm_stock_cache_task(top_tickers)
    except Exception as exc:
        logger.warning(f"Cache pre-warm skipped on startup: {exc}")

    yield

    # Shutdown tasks
    logger.info("Shutting down SentiStock AI backend...")


app = FastAPI(
    title="SentiStock AI API",
    description=(
        "Backend for SentiStock AI — real-time quotes (Finnhub), "
        "historical OHLCV (yfinance), technical indicators (TA-Lib), "
        "Reddit sentiment (r/stocks, r/investing, r/wallstreetbets), "
        "FinBERT-based news sentiment, ML price predictions, and historical sentiment storage."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(StructuredLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Request-ID"],
)

app.include_router(stock.router)
app.include_router(news.router)
app.include_router(reddit.router)
app.include_router(sentiment_storage.router)
app.include_router(mmi.router)
app.include_router(recommendation.router)
app.include_router(insight.router)
app.include_router(report.router)
app.include_router(transcript.router)
app.include_router(correlation.router)
app.include_router(prediction.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/cache/stats")
def cache_stats():
    """Returns telemetry on two-tiered caching hit rates and memory entries."""
    return get_cache_stats()