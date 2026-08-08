/**
 * SentiStock AI — TradingView Lightweight Charts (Price Chart)
 *
 * Renders a candlestick chart with volume histogram and an optional
 * sentiment-score overlay using the lightweight-charts library.
 *
 * Dependencies:
 *   - lightweight-charts (CDN, loaded before this script)
 *   - window.SentimentData  (data provider)
 *   - window.Utils          (helpers)
 */

window.PriceChart = {

  /* ------------------------------------------------------------------ */
  /*  State                                                              */
  /* ------------------------------------------------------------------ */
  chart: null,
  candlestickSeries: null,
  sentimentSeries: null,
  volumeSeries: null,
  _containerId: null,
  _currentTicker: null,
  _currentDays: null,

  /* ------------------------------------------------------------------ */
  /*  Design-system palette                                              */
  /* ------------------------------------------------------------------ */
  _palette: {
    emerald:  '#10b981',
    red:      '#ef4444',
    amber:    '#f59e0b',
    blue:     '#3b82f6',
    slate100: '#f1f5f9',
    slate200: '#e2e8f0',
    slate300: '#cbd5e1',
    slate400: '#94a3b8',
    slate500: '#64748b',
    slate600: '#475569',
    slate700: '#334155',
    slate800: '#1e293b',
    slate900: '#0f172a',
  },

  /* ------------------------------------------------------------------ */
  /*  Theme helpers                                                      */
  /* ------------------------------------------------------------------ */

  /** Is the page currently in dark mode? */
  _isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  },

  /** Build a layout options object matching the current theme. */
  _layoutOptions() {
    const dark = this._isDark();
    const p = this._palette;

    return {
      background: { type: 'solid', color: 'transparent' },
      textColor: dark ? p.slate400 : p.slate600,
      fontFamily: 'Geist, system-ui, sans-serif',
      fontSize: 11,
    };
  },

  /** Grid line styles. */
  _gridOptions() {
    const dark = this._isDark();
    return {
      vertLines: { color: dark ? 'rgba(51,65,85,0.25)' : 'rgba(226,232,240,0.6)' },
      horzLines: { color: dark ? 'rgba(51,65,85,0.25)' : 'rgba(226,232,240,0.6)' },
    };
  },

  showLoading(message = 'Loading price chart…') {
    if (!this._containerId) return;
    const container = document.getElementById(this._containerId);
    if (!container) return;
    this.hideLoading();
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'chart-loading';
    overlay.id = this._containerId + '-price-loading-overlay';
    overlay.innerHTML = `<span class="chart-loading-text">${message}</span>`;
    container.appendChild(overlay);
  },

  hideLoading() {
    if (!this._containerId) return;
    document.getElementById(this._containerId + '-price-loading-overlay')?.remove();
  },

  showNoData(message = 'No candlestick price data available for this ticker.') {
    if (!this._containerId) return;
    const container = document.getElementById(this._containerId);
    if (!container) return;
    this.hideLoading();
    this.hideNoData();
    this.hideError();
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'chart-no-data-overlay';
    overlay.id = this._containerId + '-price-nodata-overlay';
    overlay.innerHTML = `
      <span class="overlay-icon" aria-hidden="true">📊</span>
      <div class="overlay-title">No Price Data</div>
      <div class="overlay-message">${message}</div>
    `;
    container.appendChild(overlay);
  },

  hideNoData() {
    if (!this._containerId) return;
    document.getElementById(this._containerId + '-price-nodata-overlay')?.remove();
  },

  showError(message = 'An error occurred while loading the candlestick price chart.') {
    if (!this._containerId) return;
    const container = document.getElementById(this._containerId);
    if (!container) return;
    this.hideLoading();
    this.hideNoData();
    this.hideError();
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.className = 'chart-error-overlay';
    overlay.id = this._containerId + '-price-error-overlay';
    overlay.innerHTML = `
      <span class="overlay-icon" aria-hidden="true">⚠️</span>
      <div class="overlay-title">Price Chart Error</div>
      <div class="overlay-message">${message}</div>
    `;
    container.appendChild(overlay);
  },

  hideError() {
    if (!this._containerId) return;
    document.getElementById(this._containerId + '-price-error-overlay')?.remove();
  },

  /* ------------------------------------------------------------------ */
  /*  Initialise                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Create the price chart inside the given container.
   * @param {string} containerId - DOM element id to mount the chart in
   * @param {string} ticker      - Stock ticker (e.g. 'AAPL')
   */
  init(containerId, ticker = 'AAPL') {
    try {
      this._containerId  = containerId;
      this._currentTicker = ticker;

      const container = document.getElementById(containerId);
      if (!container) {
        console.warn(`[PriceChart] Container #${containerId} not found`);
        return;
      }

      this.hideLoading();
      this.hideNoData();
      this.hideError();

    const dark = this._isDark();
    const p = this._palette;

    // ── Create chart ────────────────────────────────────────────────
    this.chart = LightweightCharts.createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight,
      layout: this._layoutOptions(),
      grid:   this._gridOptions(),
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: dark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: dark ? p.slate700 : p.slate200,
        },
        horzLine: {
          color: dark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: dark ? p.slate700 : p.slate200,
        },
      },
      rightPriceScale: {
        borderColor: dark ? p.slate700 : p.slate200,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: dark ? p.slate700 : p.slate200,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: true,
      handleScale: true,
    });

    // ── Candlestick series ──────────────────────────────────────────
    const candleOpts = {
      upColor:          p.emerald,
      downColor:        p.red,
      borderUpColor:    p.emerald,
      borderDownColor:  p.red,
      wickUpColor:      p.emerald,
      wickDownColor:    p.red,
    };
    this.candlestickSeries = typeof this.chart.addCandlestickSeries === 'function'
      ? this.chart.addCandlestickSeries(candleOpts)
      : this.chart.addSeries(LightweightCharts.CandlestickSeries, candleOpts);

    // ── Volume histogram series ─────────────────────────────────────
    const volOpts = {
      priceFormat:     { type: 'volume' },
      priceScaleId:    'volume',          // Separate scale
    };
    this.volumeSeries = typeof this.chart.addHistogramSeries === 'function'
      ? this.chart.addHistogramSeries(volOpts)
      : this.chart.addSeries(LightweightCharts.HistogramSeries, volOpts);

    // Configure the volume scale (overlay at bottom, low height)
    this.chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      drawTicks: false,
      borderVisible: false,
    });

    // ── Sentiment overlay (area series on secondary scale) ──────────
    const sentOpts = {
      lineColor:        p.emerald,
      topColor:         'rgba(16,185,129,0.18)',
      bottomColor:      'rgba(16,185,129,0.02)',
      lineWidth:        1.5,
      priceScaleId:     'sentiment',
      lastValueVisible: false,
      priceLineVisible: false,
    };
    this.sentimentSeries = typeof this.chart.addAreaSeries === 'function'
      ? this.chart.addAreaSeries(sentOpts)
      : this.chart.addSeries(LightweightCharts.AreaSeries, sentOpts);

    this.chart.priceScale('sentiment').applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.25 },
      drawTicks: false,
      borderVisible: false,
    });

    // ── Load data ───────────────────────────────────────────────────
    this.updateTicker(ticker);
    } catch (err) {
      console.error(`[PriceChart] Error initializing price chart:`, err);
      this.showError('Failed to initialize price chart.');
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Update ticker                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Swap to a new ticker's data.
   * @param {string} ticker
   */
  updateTicker(ticker) {
    try {
      this._currentTicker = ticker;

      this.hideLoading();
      this.hideNoData();
      this.hideError();

      const priceData     = (window.SentimentData && window.SentimentData.PRICE_DATA)     ? window.SentimentData.PRICE_DATA[ticker]     || [] : [];
      const sentimentData = (window.SentimentData && window.SentimentData.SENTIMENT_DATA) ? window.SentimentData.SENTIMENT_DATA[ticker] || [] : [];

      if (!priceData || priceData.length === 0) {
        this.showNoData(`No candlestick price data available for ${ticker}.`);
        return;
      }

      if (!this.chart) {
        this.init(this._containerId, ticker);
        return;
      }

      const p = this._palette;

      // ── Candlestick data ────────────────────────────────────────────
      if (this.candlestickSeries && priceData.length) {
        // Expected shape: { time, open, high, low, close, volume }
        const candles = priceData.map(d => ({
          time:  d.time || d.date,
          open:  d.open,
          high:  d.high,
          low:   d.low,
          close: d.close,
        }));
        this.candlestickSeries.setData(candles);
      }

      // ── Volume data ─────────────────────────────────────────────────
      if (this.volumeSeries && priceData.length) {
        const volumeBars = priceData.map(d => ({
          time:  d.time || d.date,
          value: d.volume || 0,
          color: (d.close >= d.open)
            ? 'rgba(16,185,129,0.20)'   // green 20 % opacity
            : 'rgba(239,68,68,0.20)',   // red 20 % opacity
        }));
        this.volumeSeries.setData(volumeBars);
      }

      // ── Sentiment overlay ───────────────────────────────────────────
      if (this.sentimentSeries) {
        if (sentimentData.length) {
          // Map sentiment -1…1 → 0…100 for display
          const mapped = sentimentData.map(d => ({
            time:  d.time || d.date,
            value: ((d.score + 1) / 2) * 100,
          }));
          this.sentimentSeries.setData(mapped);
        } else {
          this.sentimentSeries.setData([]);
        }
      }

      // Fit everything into view
      if (this.chart) {
        this.chart.timeScale().fitContent();
      }
    } catch (err) {
      console.error(`[PriceChart] Error updating price chart (${ticker}):`, err);
      this.showError(`Failed to update price chart for ${ticker}.`);
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Update time range                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Filter all series to the last N days and refit.
   * @param {number} days
   */
  updateTimeRange(days) {
    this._currentDays = days;

    if (!this.chart) return;

    const ticker = this._currentTicker;

    const priceData     = (window.SentimentData && window.SentimentData.PRICE_DATA)     ? window.SentimentData.PRICE_DATA[ticker]     || [] : [];
    const sentimentData = (window.SentimentData && window.SentimentData.SENTIMENT_DATA) ? window.SentimentData.SENTIMENT_DATA[ticker] || [] : [];

    // Trim to last N days
    const trimmed  = priceData.slice(-days);
    const trimSent = sentimentData.slice(-days);

    // Update candlestick
    if (this.candlestickSeries && trimmed.length) {
      this.candlestickSeries.setData(trimmed.map(d => ({
        time: d.time || d.date, open: d.open, high: d.high, low: d.low, close: d.close,
      })));
    }

    // Update volume
    if (this.volumeSeries && trimmed.length) {
      this.volumeSeries.setData(trimmed.map(d => ({
        time:  d.time || d.date,
        value: d.volume || 0,
        color: (d.close >= d.open) ? 'rgba(16,185,129,0.20)' : 'rgba(239,68,68,0.20)',
      })));
    }

    // Update sentiment overlay
    if (this.sentimentSeries) {
      if (trimSent.length) {
        this.sentimentSeries.setData(trimSent.map(d => ({
          time:  d.time || d.date,
          value: ((d.score + 1) / 2) * 100,
        })));
      } else {
        this.sentimentSeries.setData([]);
      }
    }

    this.chart.timeScale().fitContent();
  },

  /* ------------------------------------------------------------------ */
  /*  Theme update                                                       */
  /* ------------------------------------------------------------------ */

  /** Re-apply colours after a dark ↔ light toggle. */
  updateTheme() {
    if (!this.chart) return;

    const dark = this._isDark();
    const p = this._palette;

    // Layout & grid
    this.chart.applyOptions({
      layout: this._layoutOptions(),
      grid:   this._gridOptions(),
      crosshair: {
        vertLine: {
          color: dark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)',
          labelBackgroundColor: dark ? p.slate700 : p.slate200,
        },
        horzLine: {
          color: dark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)',
          labelBackgroundColor: dark ? p.slate700 : p.slate200,
        },
      },
      rightPriceScale: { borderColor: dark ? p.slate700 : p.slate200 },
      timeScale:       { borderColor: dark ? p.slate700 : p.slate200 },
    });

    // Candlestick colours stay the same (green/red) regardless of theme

    // Sentiment overlay - stays emerald

    // Volume colours will update on next data refresh; force one now
    if (this._currentTicker) {
      this.updateTicker(this._currentTicker);
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Event markers                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Add markers for key events (earnings, news spikes, etc.)
   * @param {Array<{time:string, type:string, text:string}>} events
   *   type: 'earnings' | 'news'
   */
  addMarkers(events) {
    if (!this.candlestickSeries || !events || !events.length) return;

    const p = this._palette;

    const markers = events.map(e => {
      const isEarnings = e.type === 'earnings';
      return {
        time:     e.time || e.date,
        position: 'aboveBar',
        color:    isEarnings ? p.amber : p.blue,
        shape:    isEarnings ? 'arrowDown' : 'circle',
        text:     e.text || (isEarnings ? '★ Earnings' : '◆ News'),
      };
    });

    // Sort markers by time (required by lightweight-charts)
    markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

    this.candlestickSeries.setMarkers(markers);
  },

  /* ------------------------------------------------------------------ */
  /*  Resize                                                             */
  /* ------------------------------------------------------------------ */

  /** Resize chart to fit its container. */
  resize() {
    if (!this.chart) return;
    const container = document.getElementById(this._containerId);
    if (container) {
      this.chart.resize(container.clientWidth, container.clientHeight);
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Destroy                                                            */
  /* ------------------------------------------------------------------ */

  /** Remove the chart and clean up. */
  destroy() {
    if (this.chart) {
      this.chart.remove();
      this.chart              = null;
      this.candlestickSeries  = null;
      this.sentimentSeries    = null;
      this.volumeSeries       = null;
    }
  },
};
