# SentiStock AI — Backend

FastAPI backend that replaces "browser calls Finnhub directly with a
key the user pastes in" with a real server: it owns the Finnhub key,
pulls historical prices from `yfinance` (fixing the free-tier 403 on
Finnhub's `/stock/candle`), computes technical indicators with TA-Lib/pandas,
and scores news sentiment with an optimized VADER+Financial Lexicon engine —
caching everything in SQLite/Postgres so you're not re-hitting Finnhub/Yahoo
on every page load.

## Architecture

```
Market data      -> Finnhub (/quote)
Historical data  -> yfinance
News             -> Finnhub (/company-news)
Sentiment        -> VADER + Financial Lexicon (nltk)
Indicators       -> TA-Lib (falls back to pure pandas if not installed)
Database         -> PostgreSQL / SQLite (SQLAlchemy)
Backend          -> FastAPI
```

## Endpoints

| Method | Path                        | Returns                                  |
|--------|-----------------------------|-------------------------------------------|
| GET    | `/api/quote/{symbol}`       | Real-time price/change (Finnhub)          |
| GET    | `/api/history/{symbol}`     | Daily OHLCV candles (yfinance)            |
| GET    | `/api/indicators/{symbol}`  | RSI, MACD, SMA/EMA, Bollinger Bands       |
| GET    | `/api/news/{symbol}`        | News + FinBERT sentiment, daily aggregate |
| GET    | `/api/health`               | Liveness check                            |

All ticker params are case-insensitive (`aapl` and `AAPL` both work).
`history` and `indicators` accept `?period=` (`1mo`, `3mo`, `6mo`, `1y`,
`2y`, `5y`, `max` — anything yfinance supports).

## Setup

### 1. (Optional) System dependency: TA-Lib's real C library

By default, `requirements.txt` has `TA-Lib` commented out, and
`indicators_service.py` uses an equivalent pure-pandas implementation
instead — no compiler, no system library, works out of the box. This
is the recommended path, especially on Windows, where compiling
TA-Lib's C library is a common source of install failures.

**Want the real TA-Lib engine anyway?** `pip install TA-Lib` only
installs the Python wrapper — it needs the underlying C library
compiled/installed first:

**macOS (Homebrew):**
```bash
brew install ta-lib
```

**Ubuntu/Debian:**
```bash
sudo apt-get update && sudo apt-get install -y build-essential
wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
tar -xzf ta-lib-0.4.0-src.tar.gz && cd ta-lib
./configure --prefix=/usr && make && sudo make install
```

**Windows:** skip building from source — use conda instead, which
grabs a prebuilt binary:
```bash
conda install -c conda-forge ta-lib
```

Once the C library is installed, uncomment `TA-Lib>=0.4.28` in
`requirements.txt` and reinstall. The response's
`"engine"` field tells you which one actually ran (`"talib"` or
`"pandas-fallback"`).

### 2. Database — nothing to do by default

The app defaults to a local SQLite file (`sentistock.db`, created
automatically on first run) — no server to install, no Docker, works
immediately. This is fine for local dev and demos.

**Want Postgres instead** (recommended before deploying anywhere real —
SQLite doesn't handle concurrent writes well)? Either run it via Docker:
```bash
docker run --name sentistock-db -e POSTGRES_USER=sentistock \
  -e POSTGRES_PASSWORD=sentistock -e POSTGRES_DB=sentistock \
  -p 5432:5432 -d postgres:16
```
or use a free hosted instance (Neon, Supabase, etc.) — either way, just
set `DATABASE_URL` in `.env` accordingly (see `.env.example` for both
formats) and uncomment `psycopg2-binary` in `requirements.txt`.

### 3. Python environment

```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

The first request to `/api/news/*` downloads the FinBERT model
(~440MB) from Hugging Face and caches it locally — expect that one
call to be slow the first time.

### 4. Configure

```bash
cp .env.example .env
# then edit .env: paste your Finnhub key, adjust DATABASE_URL if needed
```

### 5. Run

```bash
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive Swagger docs.

## Connecting the frontend

Point the frontend at this backend instead of calling Finnhub
directly — see `frontend/js/live-data.js`, where `BASE_URL` is now
`http://localhost:8000/api` and there's no more "paste your API key"
gate, since the backend holds the key. Serve the frontend from
whatever static origin you listed in `CORS_ORIGINS`.

## Notes on production

- Don't run with `--reload` in production; use `uvicorn app.main:app --workers 4` behind a reverse proxy, or deploy on Render/Railway/Fly.
- FinBERT inference is the slowest part of this stack on CPU. If news requests feel sluggish, either batch fewer articles per request, run on a GPU box (`device=0` in `sentiment_service.py`), or swap in a distilled sentiment model.
- The cache table (`cache_entries`) is intentionally simple (one row per key, JSON payload). If this grows past a class project, split it into typed tables per the note at the top of `app/database.py`.
