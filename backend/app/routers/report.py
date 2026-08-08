from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..services import pdf_service
from ..services.finnhub_service import FinnhubError
from ..services.yfinance_service import YFinanceError
from .insight import _get_or_fetch_history, _get_or_fetch_news, _get_or_fetch_quote
from ..services import groq_service, indicators_service

router = APIRouter(prefix="/api", tags=["report"])
settings = get_settings()


@router.get("/report/{symbol}")
async def report(symbol: str, db: Session = Depends(get_db)):
    symbol = symbol.upper()

    try:
        quote = await _get_or_fetch_quote(db, symbol)
    except FinnhubError as exc:
        status_code = exc.status_code or 502
        raise HTTPException(status_code=status_code, detail=f"Couldn't load quote for report: {exc}") from exc

    indicators = None
    try:
        candles = await _get_or_fetch_history(db, symbol)
        indicators = await run_in_threadpool(indicators_service.compute_indicators, symbol, candles)
    except (YFinanceError, ValueError):
        indicators = None

    try:
        news = await _get_or_fetch_news(db, symbol)
    except FinnhubError:
        news = {"articles": [], "daily_sentiment": []}

    insight = None
    try:
        brief = await run_in_threadpool(
            groq_service.generate_brief,
            symbol, quote, indicators, news.get("daily_sentiment", []), news.get("articles", [])
        )
        insight = {"brief": brief, "model": settings.groq_model_name}
    except Exception:
        insight = None

    generated_at = dt.datetime.utcnow().strftime("%b %d, %Y %H:%M UTC")

    # PDF generation is CPU-bound -> offload to thread pool
    pdf_bytes = await run_in_threadpool(
        pdf_service.build_report_pdf,
        symbol=symbol,
        quote=quote,
        indicators=indicators,
        news=news,
        insight=insight,
        generated_at=generated_at,
    )

    filename = f"{symbol}-sentistock-report.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
