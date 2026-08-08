from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..schemas import TranscriptResponse
from ..services import transcript_service

router = APIRouter(prefix="/api", tags=["transcript"])
settings = get_settings()


@router.get("/transcript/{symbol}", response_model=TranscriptResponse)
async def get_transcript(symbol: str, db: Session = Depends(get_db)):
    symbol = symbol.upper()
    cache_key = f"transcript:{symbol}"

    cached = get_cached_item(db, cache_key, settings.history_cache_seconds)
    if cached:
        return cached

    try:
        analysis = await run_in_threadpool(transcript_service.analyze_transcript, symbol)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load or analyze transcript for {symbol}: {str(exc)}",
        ) from exc

    set_cached_item(db, cache_key, analysis)
    return analysis
