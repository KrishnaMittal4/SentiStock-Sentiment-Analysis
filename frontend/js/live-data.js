/* ============================================================
   live-data.js — SentiStock AI Live Data Layer (FastAPI backend)
   ------------------------------------------------------------
   The frontend no longer talks to Finnhub directly, and there's no
   more "paste your API key" gate — the backend (see /backend) owns
   the Finnhub key, pulls historical prices from yfinance, computes
   indicators with TA-Lib, and scores news with a real FinBERT model.
   This file just calls that backend's REST API:

     GET /api/quote/{symbol}       -> real-time price/change
     GET /api/history/{symbol}     -> daily OHLCV candles (yfinance)
     GET /api/indicators/{symbol}  -> RSI, MACD, SMA/EMA, Bollinger Bands
     GET /api/news/{symbol}        -> news + FinBERT sentiment

   The only thing this layer still gates on is "is the backend
   reachable at all" — if it isn't (not running, wrong URL, CORS
   misconfigured), the connect screen tells you plainly instead of
   showing fabricated data. There is still no simulated/mock fallback.
   ============================================================ */

window.LiveData = {

  _cache: {}, // ticker -> { price, sentiment, articles, quote, indicators, fetchedAt }
  _indicesCache: null,
  _connected: false,

  BASE_URL_STORAGE_KEY: 'sentistock_backend_url',
  BASE_URL: 'http://localhost:8000/api',

  // Same free-tier-friendly proxies as before — indices don't have a
  // direct quote endpoint on Finnhub, so SPY/QQQ/DIA stand in for
  // S&P 500 / NASDAQ / Dow.
  INDEX_PROXIES: [
    { id: 'sp500', symbol: 'SPY', label: 'S&P 500 (SPY proxy)' },
    { id: 'nasdaq', symbol: 'QQQ', label: 'NASDAQ 100 (QQQ proxy)' },
    { id: 'dow', symbol: 'DIA', label: 'Dow Jones (DIA proxy)' },
  ],

  /* ------------------------------------------------------------ */
  /*  Backend URL management (swap in a deployed URL in production) */
  /* ------------------------------------------------------------ */
  setBackendUrl(url, remember = true) {
    this.BASE_URL = (url || '').replace(/\s+/g, '').replace(/\/+$/, '');
    if (remember && this.BASE_URL) {
      try { localStorage.setItem(this.BASE_URL_STORAGE_KEY, this.BASE_URL); } catch (e) { /* storage unavailable */ }
    }
  },


  loadStoredBackendUrl() {
    try {
      const stored = localStorage.getItem(this.BASE_URL_STORAGE_KEY);
      if (stored) {
        this.BASE_URL = stored;
        return true;
      }
    } catch (e) { /* storage unavailable */ }
    return false;
  },

  isConnected() {
    return this._connected;
  },

  /* ------------------------------------------------------------ */
  /*  Visible warning banner                                        */
  /* ------------------------------------------------------------ */
  _showWarning(message) {
    let banner = document.getElementById('live-data-warning');
    const main = document.getElementById('main-content');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'live-data-warning';
      banner.className = 'live-data-warning';
      if (main) main.insertBefore(banner, main.firstChild);
      else document.body.appendChild(banner);
    }
    banner.textContent = message;
    banner.style.display = 'block';
  },

  _clearWarning() {
    const banner = document.getElementById('live-data-warning');
    if (banner) banner.style.display = 'none';
  },

  /* ------------------------------------------------------------ */
  /*  Fetch helper                                                  */
  /* ------------------------------------------------------------ */
  async _get(path) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(this.BASE_URL + path, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).detail || ''; } catch (e) { /* non-JSON error body */ }
        throw new Error(detail || `Backend request failed (${res.status})`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  },

  /** Ping the backend's health check — fallback between localhost and 127.0.0.1 */
  async checkHealth() {
    try {
      const res = await fetch(this.BASE_URL + '/health');
      if (res.ok) return res.json();
    } catch (e) {
      // If localhost failed, try 127.0.0.1 (or vice versa)
      let altUrl = '';
      if (this.BASE_URL.includes('localhost')) {
        altUrl = this.BASE_URL.replace('localhost', '127.0.0.1');
      } else if (this.BASE_URL.includes('127.0.0.1')) {
        altUrl = this.BASE_URL.replace('127.0.0.1', 'localhost');
      }

      if (altUrl) {
        try {
          const altRes = await fetch(altUrl + '/health');
          if (altRes.ok) {
            this.setBackendUrl(altUrl);
            return altRes.json();
          }
        } catch (altErr) { /* ignore alt error */ }
      }
      throw e;
    }
    throw new Error('Backend health check failed');
  },

  async searchStocks(query) {
    return this._get(`/search?q=${encodeURIComponent(query)}`);
  },

  /* ------------------------------------------------------------ */
  /*  Quote                                                         */
  /* ------------------------------------------------------------ */
  async fetchQuote(symbol) {
    const q = await this._get(`/quote/${encodeURIComponent(symbol)}`);
    return {
      price: q.price,
      open: q.open,
      high: q.high,
      low: q.low,
      prevClose: q.prev_close,
      change: q.change,
      changePct: q.change_pct,
    };
  },

  /* ------------------------------------------------------------ */
  /*  Daily candles (yfinance, via the backend)                    */
  /* ------------------------------------------------------------ */
  async fetchDailyPrices(ticker, period = '6mo') {
    const json = await this._get(`/history/${encodeURIComponent(ticker)}?period=${period}`);
    return (json.candles || []).map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  },

  /* ------------------------------------------------------------ */
  /*  Technical indicators (TA-Lib / pandas fallback)               */
  /* ------------------------------------------------------------ */
  async fetchIndicators(ticker, period = '6mo') {
    return this._get(`/indicators/${encodeURIComponent(ticker)}?period=${period}`);
  },

  /* ------------------------------------------------------------ */
  /*  Market strip — quote proxies for the big 3 indices           */
  /* ------------------------------------------------------------ */
  async fetchIndexQuotes() {
    const results = await Promise.all(
      this.INDEX_PROXIES.map(async (proxy) => {
        try {
          const q = await this.fetchQuote(proxy.symbol);
          return { ...proxy, price: q.price, changePct: q.changePct };
        } catch (err) {
          console.warn(`[LiveData] quote fetch failed for ${proxy.symbol}:`, err.message);
          return { ...proxy, price: null, changePct: null, error: err.message };
        }
      })
    );
    this._indicesCache = results;

    if (results.every(r => r.price == null)) {
      this._showWarning(
        `Couldn't load market-index quotes (${results[0]?.error || 'unknown error'}). ` +
        `Check that the backend is running and reachable at ${this.BASE_URL}.`
      );
    }

    return results;
  },

  /* ------------------------------------------------------------ */
  /*  AI market brief (Groq) — separate call, not part of loadTicker */
  /*  since it's a synthesis step, not raw data, and shouldn't block */
  /*  the rest of the dashboard if it's slow or unconfigured.        */
  /* ------------------------------------------------------------ */
  async fetchInsight(ticker) {
    const json = await this._get(`/insight/${encodeURIComponent(ticker)}`);
    return json; // { symbol, brief, model, generated_at }
  },

  /* ------------------------------------------------------------ */
  /*  PDF report export                                            */
  /* ------------------------------------------------------------ */
  /** GET /api/report/{symbol} returns a PDF file, not JSON, so this
   *  can't reuse _get() — it needs the raw Blob (and the filename
   *  the backend suggests via Content-Disposition) instead of a
   *  parsed JSON body. */
  async fetchReportPdf(ticker) {
    const res = await fetch(this.BASE_URL + `/report/${encodeURIComponent(ticker)}`);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).detail || ''; } catch (e) { /* non-JSON error body */ }
      throw new Error(detail || `Report request failed (${res.status})`);
    }

    const blob = await res.blob();

    let filename = `${ticker}-sentistock-report.pdf`;
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];

    return { blob, filename };
  },

  /* ------------------------------------------------------------ */
  /*  News + FinBERT sentiment (via the backend)                   */
  /* ------------------------------------------------------------ */
  async fetchNewsSentiment(ticker) {
    const json = await this._get(`/news/${encodeURIComponent(ticker)}`);

    const articles = (json.articles || []).map(a => ({
      title: a.headline,
      url: a.url,
      source: a.source,
      time: a.date,
      summary: a.summary,
      overallScore: a.sentiment_score,
      overallLabel: a.sentiment_label,
      tickerScore: a.sentiment_score,
      tickerLabel: a.sentiment_label,
      relevance: 1,
    }));

    const series = (json.daily_sentiment || []).map(d => ({
      date: d.date,
      time: d.date,
      score: d.score,
    }));

    // Real mean FinBERT prediction confidence for this ticker's
    // headlines (0..1), computed server-side in sentiment_service.py —
    // not a mention-count heuristic. null if there were no articles to
    // score.
    return { series, articles, avgConfidence: json.avg_confidence ?? null };
  },

  /* ------------------------------------------------------------ */
  /*  Earnings Transcript Analysis (FastAPI backend)              */
  /* ------------------------------------------------------------ */
  async fetchTranscript(symbol) {
    return this._get(`/transcript/${encodeURIComponent(symbol)}`);
  },

  /* ------------------------------------------------------------ */
  /*  Reddit sentiment (r/stocks, r/investing, r/wallstreetbets) */
  /* ------------------------------------------------------------ */
  async fetchRedditSentiment(symbol) {
    return this._get(`/reddit/${encodeURIComponent(symbol)}`);
  },

  async fetchMergedSentiment(symbol) {
    return this._get(`/sentiment/merged/${encodeURIComponent(symbol)}`);
  },

  async fetchHistoricalSentimentStorage(symbol) {
    return this._get(`/sentiment/history/${encodeURIComponent(symbol)}`);
  },

  async fetchMarketMoodIndex(symbol) {
    return this._get(`/mmi/${encodeURIComponent(symbol)}`);
  },

  async fetchCorrelation(symbol, period = '1mo', window = 7) {
    return this._get(`/sentiment/correlation/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}&window=${window}`);
  },

  async fetchRecommendation(symbol) {
    return this._get(`/recommendation/${encodeURIComponent(symbol)}`);
  },


  /** Convert scored articles into the shape app.js/sentiment.js expect
   *  for NEWS_ARTICLES (headline, source, date, time, tickers,
   *  sentiment, score, summary, category). */
  _toNewsArticles(ticker, articles) {
    return articles.map((a, i) => ({
      id: `${ticker}-${i}`,
      headline: a.title,
      source: a.source,
      date: a.time,
      time: '00:00',
      tickers: [ticker],
      sentiment: a.tickerLabel,
      score: a.tickerScore,
      summary: a.summary,
      entities: [],
      category: 'news',
      url: a.url,
    }));
  },

  /* ------------------------------------------------------------ */
  /*  Combined loader — merges into window.SentimentData          */
  /* ------------------------------------------------------------ */
  async loadTicker(ticker) {
    if (this._cache[ticker] && Date.now() - this._cache[ticker].fetchedAt < 5 * 60 * 1000) {
      this._applyToStore(ticker, this._cache[ticker]);
      return this._cache[ticker];
    }

    const [quote, priceData, sentimentResult, indicators, transcriptResult, redditResult, mergedResult, historicalStorageResult, mmiResult, correlationResult, recommendationResult] = await Promise.all([
      this.fetchQuote(ticker).catch(err => {
        console.warn('[LiveData] quote fetch failed:', err.message);
        this._showWarning(`Quote details unavailable for ${ticker}: ${err.message}`);
        return { price: 0, open: 0, high: 0, low: 0, prevClose: 0, change: 0, changePct: 0 };
      }),
      this.fetchDailyPrices(ticker).catch(err => {
        console.warn('[LiveData] history fetch failed:', err.message);
        this._showWarning(`Couldn't load price history for ${ticker}: ${err.message}`);
        return [];
      }),
      this.fetchNewsSentiment(ticker).catch(err => {
        console.warn('[LiveData] news fetch failed:', err.message);
        this._showWarning(`News unavailable for ${ticker}: ${err.message} — showing price data only.`);
        return { series: [], articles: [], avgConfidence: null };
      }),
      this.fetchIndicators(ticker).catch(err => {
        console.warn('[LiveData] indicators fetch failed:', err.message);
        return null;
      }),
      this.fetchTranscript(ticker).catch(err => {
        console.warn('[LiveData] transcript fetch failed:', err.message);
        return null;
      }),
      this.fetchRedditSentiment(ticker).catch(err => {
        console.warn('[LiveData] reddit fetch failed:', err.message);
        return { average_sentiment: 0, number_of_posts_analyzed: 0, confidence: 0, trending_discussions: [], subreddits_breakdown: [] };
      }),
      this.fetchMergedSentiment(ticker).catch(err => {
        console.warn('[LiveData] merged sentiment fetch failed:', err.message);
        return null;
      }),
      this.fetchHistoricalSentimentStorage(ticker).catch(err => {
        console.warn('[LiveData] historical sentiment storage fetch failed:', err.message);
        return [];
      }),
      this.fetchMarketMoodIndex(ticker).catch(err => {
        console.warn('[LiveData] MMI fetch failed:', err.message);
        return null;
      }),
      this.fetchCorrelation(ticker).catch(err => {
        console.warn('[LiveData] Correlation fetch failed:', err.message);
        return null;
      }),
      this.fetchRecommendation(ticker).catch(err => {
        console.warn('[LiveData] Recommendation fetch failed:', err.message);
        return null;
      }),
    ]);

    if (priceData.length && sentimentResult.articles.length) {
      this._clearWarning();
    } else if (sentimentResult.articles.length === 0) {
      this._showWarning(
        `No recent company news returned for ${ticker}. This can mean there's simply no ` +
        `recent coverage for this ticker right now.`
      );
    }

    const entry = {
      price: priceData,
      sentiment: sentimentResult.series,
      articles: sentimentResult.articles,
      avgConfidence: sentimentResult.avgConfidence,
      quote,
      indicators,
      transcript: transcriptResult,
      reddit: redditResult,
      merged: mergedResult,
      historicalStorage: historicalStorageResult,
      mmi: mmiResult,
      correlation: correlationResult,
      recommendation: recommendationResult,
      fetchedAt: Date.now(),
    };

    this._cache[ticker] = entry;
    this._applyToStore(ticker, entry);
    return entry;
  },

  _applyToStore(ticker, entry) {
    if (!window.SentimentData) return;
    if (entry.price && entry.price.length) {
      window.SentimentData.PRICE_DATA[ticker] = entry.price;
    }
    if (entry.sentiment && entry.sentiment.length) {
      window.SentimentData.SENTIMENT_DATA[ticker] = entry.sentiment;
    }
    window.SentimentData.LIVE_ARTICLES = window.SentimentData.LIVE_ARTICLES || {};
    window.SentimentData.LIVE_ARTICLES[ticker] = entry.articles || [];
    window.SentimentData.INDICATORS = window.SentimentData.INDICATORS || {};
    window.SentimentData.INDICATORS[ticker] = entry.indicators || null;
    window.SentimentData.QUOTES = window.SentimentData.QUOTES || {};
    window.SentimentData.QUOTES[ticker] = entry.quote || null;
    window.SentimentData.TRANSCRIPT_DATA = window.SentimentData.TRANSCRIPT_DATA || {};
    window.SentimentData.TRANSCRIPT_DATA[ticker] = entry.transcript || null;
    window.SentimentData.REDDIT_DATA = window.SentimentData.REDDIT_DATA || {};
    window.SentimentData.REDDIT_DATA[ticker] = entry.reddit || null;
    window.SentimentData.MERGED_SENTIMENT = window.SentimentData.MERGED_SENTIMENT || {};
    window.SentimentData.MERGED_SENTIMENT[ticker] = entry.merged || null;
    window.SentimentData.HISTORICAL_STORAGE = window.SentimentData.HISTORICAL_STORAGE || {};
    window.SentimentData.HISTORICAL_STORAGE[ticker] = entry.historicalStorage || [];
    window.SentimentData.MMI_DATA = window.SentimentData.MMI_DATA || {};
    window.SentimentData.MMI_DATA[ticker] = entry.mmi || null;
    window.SentimentData.CORRELATION_DATA = window.SentimentData.CORRELATION_DATA || {};
    window.SentimentData.CORRELATION_DATA[ticker] = entry.correlation || null;
    window.SentimentData.RECOMMENDATION_DATA = window.SentimentData.RECOMMENDATION_DATA || {};
    window.SentimentData.RECOMMENDATION_DATA[ticker] = entry.recommendation || null;


    // Real FinBERT confidence for this ticker (0..1), from the backend —
    // see sentiment_service.py. Used by SentimentEngine.getDashboardSummary
    // instead of the old mention-count heuristic.
    window.SentimentData.NEWS_CONFIDENCE = window.SentimentData.NEWS_CONFIDENCE || {};
    window.SentimentData.NEWS_CONFIDENCE[ticker] = entry.avgConfidence ?? null;

    // NEWS_ARTICLES drives the news feed, word cloud, distribution chart,
    // and dashboard summary — replace it with only the current ticker's
    // real articles (no mock articles from other tickers mixed in).
    window.SentimentData.NEWS_ARTICLES = this._toNewsArticles(ticker, entry.articles || []);
  },


  /* ------------------------------------------------------------ */
  /*  UI: mandatory connect gate (now just "is the backend up")    */
  /* ------------------------------------------------------------ */
  _ensureGateDOM() {
    let gate = document.getElementById('live-data-gate');
    if (gate) return gate;

    gate = document.createElement('div');
    gate.id = 'live-data-gate';
    gate.className = 'live-data-modal-overlay live-data-gate';
    gate.innerHTML = `
      <div class="live-data-modal" role="dialog" aria-modal="true" aria-label="Connect to backend">
        <h3 class="live-data-modal-title">Connect to the SentiStock backend</h3>
        <p class="live-data-modal-copy">
          This app now runs on a FastAPI backend that holds the Finnhub
          key, pulls history via yfinance, and scores news with FinBERT
          — no API key needed here. Just point this at where the
          backend is running.
        </p>
        <input id="live-data-gate-input" class="search-input live-data-key-input"
               type="text" placeholder="http://localhost:8000/api" autocomplete="off"
               value="${this.BASE_URL}">
        <div class="live-data-modal-actions">
          <button id="live-data-gate-connect" class="btn btn-primary btn-sm" type="button">Connect &amp; load data</button>
        </div>
        <p id="live-data-gate-status" class="live-data-status"></p>
        <p class="live-data-modal-copy">
          Backend not running yet? See <code>backend/README.md</code> for setup
          (<code>uvicorn app.main:app --reload --port 8000</code>).
        </p>
      </div>
    `;
    document.body.appendChild(gate);

    const input = document.getElementById('live-data-gate-input');
    const status = document.getElementById('live-data-gate-status');
    const connectBtn = document.getElementById('live-data-gate-connect');

    const doConnect = async () => {
      const url = input.value.trim();
      if (!url) {
        status.textContent = 'Please enter the backend URL.';
        return;
      }
      status.textContent = 'Connecting…';
      connectBtn.disabled = true;
      this.setBackendUrl(url);

      try {
        await this.checkHealth();
        await this.loadTicker('AAPL');
        this.fetchIndexQuotes().catch(() => {});
        this._connected = true;
        status.textContent = '✓ Connected — loading dashboard…';
        gate.classList.add('is-hiding');
        setTimeout(() => gate.remove(), 300);
        document.dispatchEvent(new CustomEvent('sentistock:connected', { detail: { ticker: 'AAPL' } }));
      } catch (err) {
        console.error('[LiveData]', err);
        status.textContent = 'Connection failed: ' + err.message;
        connectBtn.disabled = false;
      }
    };

    connectBtn.addEventListener('click', doConnect);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doConnect(); });

    return gate;
  },

  /**
   * Show the mandatory gate. If a remembered backend URL already
   * responds, this connects silently and skips straight to loading
   * data instead of making the person click through every visit.
   */
  /**
   * Show the mandatory gate. Tries to connect silently first — either
   * to a previously-remembered backend URL, or (if there isn't one yet,
   * e.g. first-ever visit, or storage was cleared) to the default
   * localhost URL, since that's overwhelmingly the common case for
   * local dev. The visible "type a URL and click Connect" screen only
   * shows up if BOTH of those silent attempts actually fail — normally
   * because the backend genuinely isn't running.
   */
  async showGate() {
    this.loadStoredBackendUrl();

    // If a production backend URL is set in config.js, prioritise it.
    const configUrl = (window.SENTISTOCK_CONFIG && window.SENTISTOCK_CONFIG.BACKEND_URL) || '';

    const host = (window.location && window.location.hostname) || '127.0.0.1';
    const candidates = [
      configUrl,
      this.BASE_URL,
      `http://${host}:8000/api`,
      'http://127.0.0.1:8000/api',
      'http://localhost:8000/api',
    ];
    const uniqueUrls = [...new Set(candidates.filter(Boolean))];

    for (const url of uniqueUrls) {
      try {
        this.setBackendUrl(url, false);
        await this.checkHealth();
        await this.loadTicker('AAPL');
        this.fetchIndexQuotes().catch(() => {});
        this._connected = true;
        this.setBackendUrl(url, true);

        const gate = document.getElementById('live-data-gate');
        if (gate) gate.style.display = 'none';

        document.dispatchEvent(new CustomEvent('sentistock:connected', { detail: { ticker: 'AAPL' } }));
        return;
      } catch (err) {
        console.warn(`[LiveData] Silent connect to ${url} failed:`, err.message);
      }
    }

    const gate = this._ensureGateDOM();
    gate.style.display = 'flex';
    setTimeout(() => document.getElementById('live-data-gate-input')?.focus(), 50);
  },

  /* ------------------------------------------------------------ */
  /*  UI: nav "Live Data" button — reconnect / point at a new URL   */
  /* ------------------------------------------------------------ */
  injectConnectUI() {
    const navRight = document.querySelector('.nav-right');
    if (!navRight || document.getElementById('live-data-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'live-data-btn';
    btn.className = 'btn btn-outline btn-sm live-data-btn';
    btn.type = 'button';
    const ticker = (window.App && window.App.state && window.App.state.currentTicker) || 'AAPL';
    if (this.isConnected()) {
      btn.classList.add('is-connected');
      btn.innerHTML = '<span class="live-data-dot live"></span> Live: ' + ticker;
    } else {
      btn.innerHTML = '<span class="live-data-dot" aria-hidden="true"></span> Connect Backend';
    }
    navRight.insertBefore(btn, navRight.firstChild);

    const modal = document.createElement('div');
    modal.id = 'live-data-modal';
    modal.className = 'live-data-modal-overlay';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="live-data-modal" role="dialog" aria-modal="true" aria-label="Backend connection">
        <h3 class="live-data-modal-title">Backend connection</h3>
        <p class="live-data-modal-copy">Point this at your running FastAPI backend.</p>
        <input id="live-data-key-input" class="search-input live-data-key-input"
               type="text" placeholder="http://localhost:8000/api" autocomplete="off">
        <div class="live-data-modal-actions">
          <button id="live-data-cancel" class="btn btn-outline btn-sm" type="button">Cancel</button>
          <button id="live-data-connect" class="btn btn-primary btn-sm" type="button">Connect</button>
        </div>
        <p id="live-data-status" class="live-data-status"></p>
      </div>
    `;
    document.body.appendChild(modal);

    const close = () => { modal.style.display = 'none'; };

    btn.addEventListener('click', () => {
      modal.style.display = 'flex';
      const input = document.getElementById('live-data-key-input');
      input.value = this.BASE_URL;
      input?.focus();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });

    document.getElementById('live-data-cancel').addEventListener('click', close);

    document.getElementById('live-data-connect').addEventListener('click', async () => {
      const input = document.getElementById('live-data-key-input');
      const status = document.getElementById('live-data-status');
      const url = input.value.trim();
      if (!url) {
        status.textContent = 'Please enter a backend URL.';
        return;
      }

      status.textContent = 'Connecting…';
      this.setBackendUrl(url);

      const currentTicker = (window.App && window.App.state && window.App.state.currentTicker) || 'AAPL';
      try {
        await this.checkHealth();
        await this.loadTicker(currentTicker);
        this.fetchIndexQuotes().catch(() => {});
        this._connected = true;
        status.textContent = '✓ Connected — live data loaded for ' + currentTicker;
        btn.classList.add('is-connected');
        btn.innerHTML = '<span class="live-data-dot live"></span> Live: ' + currentTicker;

        if (window.App && typeof window.App.onTickerChange === 'function') {
          window.App.onTickerChange();
        }
        if (window.Charts && typeof window.Charts.refreshAll === 'function') {
          window.Charts.refreshAll();
        }

        setTimeout(close, 900);
      } catch (err) {
        console.error('[LiveData]', err);
        status.textContent = 'Connection failed: ' + err.message;
        this._connected = false;
        btn.classList.remove('is-connected');
        btn.innerHTML = '<span class="live-data-dot" aria-hidden="true"></span> Connect Backend';
      }
    });
  },
};