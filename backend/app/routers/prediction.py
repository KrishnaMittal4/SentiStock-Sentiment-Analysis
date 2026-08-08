"""
ML Price Movement Prediction Router
Endpoint to fetch Next Day Direction (UP/DOWN), probability, performance metrics,
and feature importances using Random Forest, XGBoost, or LightGBM models.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..cache import get_cached_item, set_cached_item
from ..config import get_settings
from ..database import get_db
from ..schemas import MLPredictionResponse
from ..services.ml_prediction_service import predict_price_movement

router = APIRouter(prefix="/api/prediction", tags=["ML Prediction"])
settings = get_settings()


@router.get("/{symbol}", response_model=MLPredictionResponse)
async def get_ml_price_prediction(
    symbol: str,
    model: str = Query(
        default="rf",
        description="Machine learning model algorithm: 'rf' (Random Forest), 'xgboost' (XGBoost), or 'lightgbm' (LightGBM).",
    ),
    period: str = Query(
        default="1y",
        description="Historical window for feature training: '6mo', '1y', '2y'.",
    ),
    db: Session = Depends(get_db),
):
    """
    Train ML classifier on technical indicators, historical prices, volume dynamics,
    and market sentiment to predict Next Day Price Direction (UP vs DOWN),
    probabilities, test metrics, and feature importances.
    Offloads heavy ML model training/inference to worker thread pool.
    """
    symbol = symbol.upper()
    cache_key = f"ml_prediction:{symbol}:{model}:{period}"

    cached = get_cached_item(db, cache_key, settings.history_cache_seconds)
    if cached:
        return cached

    try:
        result = await run_in_threadpool(
            predict_price_movement,
            db=db,
            symbol=symbol,
            model_key=model,
            period=period,
        )
        set_cached_item(db, cache_key, result)
        return result
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate ML price prediction for '{symbol}': {exc}",
        )
