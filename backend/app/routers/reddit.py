import datetime as dt
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import schemas
from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..logging_config import logger
from ..services import finnhub_service, reddit_service, sentiment_service, yfinance_service, indian_stock_service
from ..tasks import bg_save_historical_sentiment_task
from .sentiment_storage import derive_prediction

router = APIRouter(prefix="/api", tags=["reddit"])
settings = get_settings()


@router.get("/reddit/{symbol}", response_model=schemas.RedditResponse)
async def get_reddit_sentiment(symbol: str, db: Session = Depends(get_db)):
    """
    Analyzes r/stocks, r/investing, and r/wallstreetbets for posts containing ticker symbol.
    Runs FinBERT model on titles and bodies.
    Returns average sentiment, number of posts analyzed, confidence, and trending discussions.
    """
    symbol = symbol.upper()
    cache_key = f"reddit:{symbol}"

    cached = get_cached_item(db, cache_key, settings.history_cache_seconds)
    if cached:
        return cached

    result = await run_in_threadpool(reddit_service.analyze_reddit_sentiment, symbol)
    set_cached_item(db, cache_key, result)
    return result


@router.get("/sentiment/merged/{symbol}", response_model=schemas.MergedSentimentResponse)
async def get_merged_sentiment(
    symbol: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    """
    Combines FinBERT sentiment analysis of financial news articles with Reddit discussions.
    Offloads historical persistence to background tasks to keep API response instantaneous.
    """
    symbol = symbol.upper()
    cache_key = f"sentiment_merged:{symbol}"

    cached = get_cached_item(db, cache_key, settings.news_cache_seconds)
    if cached:
        return cached

    # Fetch news articles
    news_key = f"news:{symbol}:21"
    news_data = get_cached_item(db, news_key, settings.news_cache_seconds)
    if not news_data:
        raw_articles = []
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
        else:
            try:
                raw_articles = await run_in_threadpool(finnhub_service.get_company_news, symbol, days_back=21)
                if not raw_articles:
                    raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)
            except Exception:
                raw_articles = await run_in_threadpool(yfinance_service.get_ticker_news, symbol)

        scored_news = await run_in_threadpool(sentiment_service.score_articles, raw_articles)
        news_data = {
            "symbol": symbol,
            "articles": scored_news["articles"],
            "daily_sentiment": scored_news["daily_sentiment"],
            "avg_confidence": scored_news.get("avg_confidence"),
        }
        set_cached_item(db, news_key, news_data)

    # Fetch reddit sentiment
    reddit_key = f"reddit:{symbol}"
    reddit_data = get_cached_item(db, reddit_key, settings.history_cache_seconds)
    if not reddit_data:
        reddit_data = await run_in_threadpool(reddit_service.analyze_reddit_sentiment, symbol)
        set_cached_item(db, reddit_key, reddit_data)

    merged = reddit_service.merge_news_and_reddit_sentiment(news_data, reddit_data)
    set_cached_item(db, cache_key, merged)

    # Offload historical DB recording to background task
    try:
        close_price = 0.0
        try:
            if symbol.endswith(".NS") or symbol.endswith(".BO"):
                q = await run_in_threadpool(indian_stock_service.get_indian_quote, symbol)
            else:
                q = await run_in_threadpool(finnhub_service.get_quote, symbol)
            close_price = float(q.get("price", 0.0))
        except Exception:
            close_price = 0.0

        today_str = dt.datetime.utcnow().strftime("%Y-%m-%d")
        comb_s = float(merged.get("merged_sentiment", 0.0))
        pred = derive_prediction(comb_s)

        background_tasks.add_task(
            bg_save_historical_sentiment_task,
            ticker=symbol,
            date_str=today_str,
            news_sentiment=float(merged.get("news_sentiment", 0.0)),
            reddit_sentiment=float(merged.get("reddit_sentiment", 0.0)),
            combined_sentiment=comb_s,
            closing_price=close_price,
            prediction=pred,
        )
    except Exception as exc:
        logger.warning(f"[HistoricalStorage] Warning: Auto-store background queue failed for {symbol}: {exc}")

    return merged
