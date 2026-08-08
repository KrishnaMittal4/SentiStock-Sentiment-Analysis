"""
ML Price Movement Prediction Service

Trains Machine Learning Classifiers (Random Forest, XGBoost, LightGBM) on:
- Technical Indicators (RSI, MACD, Moving Averages, Bollinger Bands, Volatility, ROC)
- Historical Prices (Daily/3D/5D returns, High/Low & Close/Open intraday spreads)
- Volume Dynamics (Daily Volume % change, Volume to 20-day SMA ratio)
- Market Sentiment (FinBERT news sentiment, Reddit sentiment, 3-day sentiment MA, Sentiment momentum)

Predicts:
- Next Day Price Direction (UP / DOWN)
- Win Probabilities (P(UP), P(DOWN))
- Model Performance Metrics (Accuracy, Precision, Recall, F1, ROC AUC)
- Feature Importances ranking
"""

from __future__ import annotations

import datetime as dt
from typing import Any, Optional
import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

# ML Imports
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

try:
    from xgboost import XGBClassifier
    _HAS_XGBOOST = True
except ImportError:
    XGBClassifier = None
    _HAS_XGBOOST = False

try:
    from lightgbm import LGBMClassifier
    _HAS_LIGHTGBM = True
except ImportError:
    LGBMClassifier = None
    _HAS_LIGHTGBM = False

from ..database import get_historical_sentiment_records, save_historical_sentiment
from ..services import finnhub_service, reddit_service, sentiment_service, yfinance_service

FEATURE_DESCRIPTIONS: dict[str, tuple[str, str, str]] = {
    # Key: (Display Name, Category, Description)
    "RSI_14": ("RSI (14-Period)", "Technical Indicators", "Relative Strength Index momentum indicator"),
    "MACD_hist": ("MACD Histogram", "Technical Indicators", "Convergence/divergence momentum histogram"),
    "SMA_20_ratio": ("Price / 20-Day SMA", "Technical Indicators", "Distance from short-term 20-day moving average"),
    "SMA_50_ratio": ("Price / 50-Day SMA", "Technical Indicators", "Distance from medium-term 50-day moving average"),
    "EMA_20_ratio": ("Price / 20-Day EMA", "Technical Indicators", "Distance from exponential 20-day moving average"),
    "BB_position": ("Bollinger Band %B", "Technical Indicators", "Relative price position within 20-day Bollinger Bands"),
    "Volatility_5d": ("5-Day Volatility", "Historical Prices", "5-day rolling standard deviation of returns"),
    "ROC_5": ("5-Day Rate of Change", "Technical Indicators", "5-day momentum velocity percentage"),
    "Return_1d": ("1-Day Price Return", "Historical Prices", "Previous day close-to-close return percentage"),
    "Return_3d": ("3-Day Price Return", "Historical Prices", "3-day cumulative return percentage"),
    "Return_5d": ("5-Day Price Return", "Historical Prices", "5-day cumulative return percentage"),
    "High_Low_spread": ("High-Low Spread", "Historical Prices", "Intraday high to low price range relative to close"),
    "Close_Open_spread": ("Close-Open Spread", "Historical Prices", "Intraday close to open direction spread"),
    "Volume_change_1d": ("Volume % Change", "Volume Dynamics", "1-day percentage change in trading volume"),
    "Volume_SMA_ratio": ("Volume / 20-Day SMA", "Volume Dynamics", "Trading volume relative to 20-day volume average"),
    "Daily_Sentiment": ("Market Sentiment Score", "Market Sentiment", "FinBERT headline & social composite sentiment score"),
    "Sentiment_3d_MA": ("3-Day Sentiment MA", "Market Sentiment", "3-day moving average of daily market sentiment"),
    "Sentiment_momentum": ("Sentiment Shift", "Market Sentiment", "Daily acceleration/shift in investor sentiment"),
}


def _compute_pandas_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Computes technical indicators, price spreads, volume ratios, and sentiment features on a DataFrame."""
    closes = df["close"].astype(float)
    highs = df["high"].astype(float)
    lows = df["low"].astype(float)
    opens = df["open"].astype(float)
    volumes = df["volume"].astype(float)

    # 1. Technical Indicators
    delta = closes.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(14, min_periods=5).mean()
    avg_loss = loss.rolling(14, min_periods=5).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    df["RSI_14"] = 100 - (100 / (1 + rs))

    ema_12 = closes.ewm(span=12, adjust=False).mean()
    ema_26 = closes.ewm(span=26, adjust=False).mean()
    macd_line = ema_12 - ema_26
    macd_signal = macd_line.ewm(span=9, adjust=False).mean()
    df["MACD_hist"] = macd_line - macd_signal

    sma_20 = closes.rolling(20, min_periods=5).mean()
    sma_50 = closes.rolling(50, min_periods=5).mean()
    ema_20 = closes.ewm(span=20, adjust=False).mean()

    df["SMA_20_ratio"] = closes / (sma_20 + 1e-9)
    df["SMA_50_ratio"] = closes / (sma_50 + 1e-9)
    df["EMA_20_ratio"] = closes / (ema_20 + 1e-9)

    bb_std = closes.rolling(20, min_periods=5).std()
    bb_upper = sma_20 + 2 * bb_std
    bb_lower = sma_20 - 2 * bb_std
    df["BB_position"] = (closes - bb_lower) / ((bb_upper - bb_lower) + 1e-9)

    df["ROC_5"] = (closes - closes.shift(5)) / (closes.shift(5) + 1e-9)

    # 2. Historical Prices
    ret_1d = closes.pct_change(1)
    df["Return_1d"] = ret_1d
    df["Return_3d"] = closes.pct_change(3)
    df["Return_5d"] = closes.pct_change(5)
    df["Volatility_5d"] = ret_1d.rolling(5, min_periods=3).std()
    df["High_Low_spread"] = (highs - lows) / (closes + 1e-9)
    df["Close_Open_spread"] = (closes - opens) / (closes + 1e-9)

    # 3. Volume Dynamics
    df["Volume_change_1d"] = volumes.pct_change(1).fillna(0.0)
    vol_sma_20 = volumes.rolling(20, min_periods=5).mean()
    df["Volume_SMA_ratio"] = volumes / (vol_sma_20 + 1e-9)

    # 4. Sentiment Features
    if "Daily_Sentiment" not in df.columns:
        df["Daily_Sentiment"] = 0.0

    df["Daily_Sentiment"] = df["Daily_Sentiment"].fillna(0.0)
    df["Sentiment_3d_MA"] = df["Daily_Sentiment"].rolling(3, min_periods=1).mean()
    df["Sentiment_momentum"] = df["Daily_Sentiment"] - df["Daily_Sentiment"].shift(1).fillna(0.0)

    return df


def _fetch_or_populate_sentiment(db: Session, symbol: str, df: pd.DataFrame) -> pd.DataFrame:
    """Attaches daily sentiment scores to the candles DataFrame."""
    records = get_historical_sentiment_records(db, symbol, limit=365)
    sent_map = {r.date: float(r.combined_sentiment) for r in records}

    # If DB records are sparse, fetch recent news & Reddit to populate missing dates
    if len(sent_map) < len(df) * 0.3:
        daily_news_map: dict[str, float] = {}
        try:
            raw_articles = []
            if symbol.endswith(".NS") or symbol.endswith(".BO"):
                raw_articles = yfinance_service.get_ticker_news(symbol)
            else:
                try:
                    raw_articles = finnhub_service.get_company_news(symbol, days_back=30)
                    if not raw_articles:
                        raw_articles = yfinance_service.get_ticker_news(symbol)
                except Exception:
                    raw_articles = yfinance_service.get_ticker_news(symbol)

            scored = sentiment_service.score_articles(raw_articles)
            for item in scored.get("daily_sentiment", []):
                daily_news_map[item["date"]] = item["score"]
        except Exception:
            pass

        reddit_sentiment = 0.0
        try:
            reddit_res = reddit_service.analyze_reddit_sentiment(symbol)
            reddit_sentiment = reddit_res.get("average_sentiment", 0.0)
        except Exception:
            pass

        # Populate missing dates
        for idx, row in df.iterrows():
            d_str = row["time"]
            if d_str not in sent_map:
                news_s = float(daily_news_map.get(d_str, 0.0))
                red_s = float(reddit_sentiment)
                comb_s = round(0.60 * news_s + 0.40 * red_s, 4)
                sent_map[d_str] = comb_s
                
                # Save to DB for persistence
                try:
                    close_p = float(row["close"])
                    pred = "Bullish" if comb_s > 0.05 else ("Bearish" if comb_s < -0.05 else "Neutral")
                    save_historical_sentiment(
                        db=db,
                        ticker=symbol,
                        date_str=d_str,
                        news_sentiment=news_s,
                        reddit_sentiment=red_s,
                        combined_sentiment=comb_s,
                        closing_price=close_p,
                        prediction=pred,
                    )
                except Exception:
                    pass

    # Map to df
    df["Daily_Sentiment"] = df["time"].map(lambda d: sent_map.get(d, 0.0))
    return df


def predict_price_movement(
    db: Session,
    symbol: str,
    model_key: str = "rf",
    period: str = "1y",
) -> dict[str, Any]:
    """
    Trains specified ML Classifier (rf, xgboost, lightgbm) on historical indicators, prices, volume,
    and sentiment features to predict next day price direction and probabilities.
    """
    symbol = symbol.upper()
    model_key = model_key.lower().strip()
    if model_key not in ("rf", "xgboost", "lightgbm"):
        model_key = "rf"

    # 1. Fetch Daily Candles
    try:
        candles = yfinance_service.get_daily_history(symbol, period=period)
    except Exception as exc:
        raise ValueError(f"Failed to fetch historical data for {symbol}: {exc}")

    if len(candles) < 30:
        raise ValueError(f"Need at least 30 historical trading bars for ML model training, got {len(candles)}")

    # 2. Build pandas DataFrame & Feature Engineering
    df = pd.DataFrame(candles)
    df = _fetch_or_populate_sentiment(db, symbol, df)
    df = _compute_pandas_indicators(df)

    feature_cols = list(FEATURE_DESCRIPTIONS.keys())

    # 3. Create Target Label: Next Day Close > Current Day Close (1 = UP, 0 = DOWN)
    df["Next_Close"] = df["close"].shift(-1)
    df["Target_Direction"] = (df["Next_Close"] > df["close"]).astype(int)

    # 4. Separate Inference Row (the latest bar, where Next_Close is unknown) vs Training Set
    latest_bar = df.iloc[-1]
    latest_feature_vec = latest_bar[feature_cols].values.reshape(1, -1)
    # Fill any NaNs in latest feature vector with median/0.0
    latest_feature_vec = np.nan_to_num(latest_feature_vec, nan=0.0)

    # Historical data where target is known
    train_df = df.iloc[:-1].dropna(subset=feature_cols + ["Target_Direction"]).copy()

    if len(train_df) < 20:
        raise ValueError(f"Insufficient valid data points after feature extraction: {len(train_df)}")

    X = train_df[feature_cols].values
    y = train_df["Target_Direction"].values.astype(int)
    X = np.nan_to_num(X, nan=0.0)

    # 5. Chronological Train-Test Split (80% Train, 20% Test)
    split_idx = int(len(X) * 0.80)
    if split_idx < 15 or (len(X) - split_idx) < 5:
        # Fallback for small datasets
        split_idx = max(10, len(X) - 5)

    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    test_dates = train_df["time"].iloc[split_idx:].values
    test_closes = train_df["close"].iloc[split_idx:].values
    test_next_closes = train_df["Next_Close"].iloc[split_idx:].values

    # 6. Instantiate & Train ML Model
    model_name = "Random Forest"
    if model_key == "xgboost" and _HAS_XGBOOST:
        clf = XGBClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            eval_metric="logloss",
            random_state=42,
        )
        model_name = "XGBoost Classifier"
    elif model_key == "lightgbm" and _HAS_LIGHTGBM:
        clf = LGBMClassifier(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=42,
            verbose=-1,
        )
        model_name = "LightGBM Classifier"
    else:
        clf = RandomForestClassifier(
            n_estimators=120,
            max_depth=5,
            min_samples_leaf=2,
            random_state=42,
        )
        model_name = "Random Forest Classifier"

    # Fit Model
    clf.fit(X_train, y_train)

    # 7. Evaluate on Test Set
    y_test_pred = clf.predict(X_test)
    try:
        y_test_proba = clf.predict_proba(X_test)
    except Exception:
        y_test_proba = np.column_stack([1 - y_test_pred, y_test_pred])

    acc = float(accuracy_score(y_test, y_test_pred))
    prec = float(precision_score(y_test, y_test_pred, zero_division=0))
    rec = float(recall_score(y_test, y_test_pred, zero_division=0))
    f1 = float(f1_score(y_test, y_test_pred, zero_division=0))

    try:
        auc = float(roc_auc_score(y_test, y_test_proba[:, 1]))
    except Exception:
        auc = acc

    metrics = {
        "accuracy": round(acc, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1_score": round(f1, 4),
        "roc_auc": round(auc, 4),
        "train_samples": len(X_train),
        "test_samples": len(X_test),
    }

    # 8. Out-of-Sample Inference for Next Trading Day
    next_proba = clf.predict_proba(latest_feature_vec)[0]
    prob_down = float(next_proba[0])
    prob_up = float(next_proba[1])

    direction = "UP" if prob_up >= 0.50 else "DOWN"
    primary_prob = max(prob_up, prob_down)
    confidence_score = round(primary_prob * 100, 1)

    if confidence_score >= 65.0:
        confidence_label = "High Confidence"
    elif confidence_score >= 55.0:
        confidence_label = "Moderate Confidence"
    else:
        confidence_label = "Low Confidence"

    # Compute Next Trading Day Date (skip weekend if Friday)
    latest_date_str = str(latest_bar["time"])
    try:
        ld_obj = dt.datetime.strptime(latest_date_str, "%Y-%m-%d")
        next_dt = ld_obj + dt.timedelta(days=1)
        if next_dt.weekday() == 5:  # Saturday -> Monday
            next_dt += dt.timedelta(days=2)
        elif next_dt.weekday() == 6:  # Sunday -> Monday
            next_dt += dt.timedelta(days=1)
        prediction_date = next_dt.strftime("%Y-%m-%d")
    except Exception:
        prediction_date = "Next Trading Day"

    # 9. Feature Importances Extraction
    feature_importances: list[dict[str, Any]] = []
    if hasattr(clf, "feature_importances_"):
        raw_importances = clf.feature_importances_
        total_imp = sum(raw_importances) if sum(raw_importances) > 0 else 1.0
        
        for idx, col in enumerate(feature_cols):
            disp_name, cat, desc = FEATURE_DESCRIPTIONS[col]
            pct = round((raw_importances[idx] / total_imp) * 100, 2)
            feature_importances.append({
                "feature_name": disp_name,
                "importance_pct": pct,
                "category": cat,
                "description": desc,
            })
        
        feature_importances.sort(key=lambda x: x["importance_pct"], reverse=True)

    # 10. Latest Feature Summary Dictionary
    latest_features_dict = {}
    for col in feature_cols:
        disp_name, _, _ = FEATURE_DESCRIPTIONS[col]
        val = latest_bar[col]
        latest_features_dict[disp_name] = round(float(val), 4) if pd.notna(val) else 0.0

    # 11. Historical Test Set Evaluations (Backtest Log)
    historical_evaluations: list[dict[str, Any]] = []
    for i in range(len(X_test)):
        t_date = str(test_dates[i])
        pred_dir = "UP" if y_test_pred[i] == 1 else "DOWN"
        act_dir = "UP" if y_test[i] == 1 else "DOWN"
        p_up_test = round(float(y_test_proba[i][1]) * 100, 1)
        
        close_t = float(test_closes[i])
        n_close_t = float(test_next_closes[i]) if pd.notna(test_next_closes[i]) else close_t
        chg_pct = round(((n_close_t - close_t) / (close_t + 1e-9)) * 100, 2)
        
        historical_evaluations.append({
            "date": t_date,
            "predicted_direction": pred_dir,
            "probability_up": p_up_test,
            "actual_direction": act_dir,
            "actual_change_pct": chg_pct,
            "is_correct": bool(pred_dir == act_dir),
        })

    # 12. Summary Reasoning Narrative
    top_3_features = ", ".join([f"{f['feature_name']} ({f['importance_pct']}%)" for f in feature_importances[:3]])
    summary_reasoning = (
        f"{model_name} predicts {direction} movement for {symbol} on {prediction_date} "
        f"with {confidence_score}% probability ({prob_up * 100:.1f}% UP vs {prob_down * 100:.1f}% DOWN). "
        f"The prediction is primarily driven by top weighted features: {top_3_features}. "
        f"In test backtesting across {len(X_test)} sample trading days, the model achieved "
        f"{acc * 100:.1f}% direction accuracy and ROC AUC of {auc:.2f}."
    )

    return {
        "symbol": symbol,
        "model_type": model_name,
        "model_key": model_key,
        "prediction": direction,
        "probability_up": round(prob_up * 100, 1),
        "probability_down": round(prob_down * 100, 1),
        "confidence_score": confidence_score,
        "confidence_label": confidence_label,
        "prediction_date": prediction_date,
        "last_close": round(float(latest_bar["close"]), 4),
        "metrics": metrics,
        "feature_importances": feature_importances,
        "latest_features": latest_features_dict,
        "historical_evaluations": historical_evaluations[-10:],  # last 10 historical test evaluations
        "summary_reasoning": summary_reasoning,
    }
