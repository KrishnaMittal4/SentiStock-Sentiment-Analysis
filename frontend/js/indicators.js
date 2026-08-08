/**
 * SentiStock AI — Technical Indicators & Quote Header (indicators.js)
 *
 * Renders the four Technical Indicators cards (RSI, MACD, Moving
 * Averages, Bollinger Bands) plus the price quote header above the
 * candlestick chart. All of it reads real data the backend already
 * computes — window.SentimentData.INDICATORS[ticker] (from
 * /api/indicators) and window.SentimentData.QUOTES[ticker] (from
 * /api/quote) — populated by live-data.js on every loadTicker() call.
 *
 * If a ticker doesn't have enough history yet (backend requires 20+
 * daily candles), each card shows a plain "not enough data" state
 * instead of a chart with fabricated numbers.
 *
 * Dependencies:
 *   - Apache ECharts (CDN, loaded before this script)
 *   - window.Charts   (shared palette/theme helpers)
 *   - window.Utils    (formatters)
 */

window.Indicators = {

  _renderFns: {}, // containerId -> () => void, for theme refresh

  /* ------------------------------------------------------------------ */
  /*  Formatting helpers                                                 */
  /* ------------------------------------------------------------------ */
  _fmtPrice(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return '$' + n.toFixed(2);
  },

  _fmtSigned(n, decimals = 2) {
    if (n == null || Number.isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return sign + n.toFixed(decimals);
  },

  /* ------------------------------------------------------------------ */
  /*  Entry point — call once per ticker load                           */
  /* ------------------------------------------------------------------ */
  renderAll(ticker) {
    const data = window.SentimentData || {};
    const ind = (data.INDICATORS && data.INDICATORS[ticker]) || null;
    const quote = (data.QUOTES && data.QUOTES[ticker]) || null;

    this.renderQuoteHeader('quote-header', ticker, quote);
    this.renderRSI('rsi-gauge-mount', ind);
    this.renderMACD('macd-chart-mount', ind);
    this.renderMovingAverages('ma-ribbon', quote, ind);
    this.renderBollinger('bb-card-body', quote, ind);

    const engineBadge = document.getElementById('rsi-engine-badge');
    if (engineBadge) {
      engineBadge.textContent = ind ? (ind.engine === 'talib' ? 'TA-Lib' : 'pandas') : '—';
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Price quote header (sits above the candlestick chart)             */
  /* ------------------------------------------------------------------ */
  renderQuoteHeader(containerId, ticker, quote) {
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!quote) {
      el.innerHTML = `<div class="indicator-empty">No live quote for ${ticker} yet.</div>`;
      return;
    }

    const isUp = quote.change >= 0;
    const changeClass = isUp ? 'positive' : 'negative';
    const changeSign = isUp ? '▲' : '▼';

    // Position of current price within today's low..high range, 0..100%
    const range = Math.max(quote.high - quote.low, 0.0001);
    const pct = Math.min(100, Math.max(0, ((quote.price - quote.low) / range) * 100));

    el.innerHTML = `
      <div class="quote-header-price-block">
        <span class="quote-header-ticker">${ticker}</span>
        <div class="quote-header-price-row">
          <span class="quote-header-price numeric">${this._fmtPrice(quote.price)}</span>
          <span class="quote-header-change ${changeClass} numeric">
            ${changeSign} ${this._fmtSigned(quote.change)} (${this._fmtSigned(quote.changePct)}%)
          </span>
        </div>
      </div>

      <div class="quote-header-range-block">
        <div class="quote-header-range-labels">
          <span>${this._fmtPrice(quote.low)}</span>
          <span>Day range</span>
          <span>${this._fmtPrice(quote.high)}</span>
        </div>
        <div class="quote-header-range-track">
          <div class="quote-header-range-fill" style="width:${pct}%"></div>
          <div class="quote-header-range-marker" style="left:${pct}%"></div>
        </div>
      </div>

      <div class="quote-header-stats">
        <div class="quote-header-stat">
          <span class="quote-header-stat-label">Open</span>
          <span class="quote-header-stat-value numeric">${this._fmtPrice(quote.open)}</span>
        </div>
        <div class="quote-header-stat">
          <span class="quote-header-stat-label">Prev close</span>
          <span class="quote-header-stat-value numeric">${this._fmtPrice(quote.prevClose)}</span>
        </div>
      </div>
    `;
  },

  /* ------------------------------------------------------------------ */
  /*  RSI gauge                                                          */
  /* ------------------------------------------------------------------ */
  renderRSI(mountId, ind) {
    const badgeEl = document.getElementById('rsi-zone-badge');
    const valueEl = document.getElementById('rsi-value');
    const mount = document.getElementById(mountId);
    const emptyState = document.getElementById('rsi-empty-state');

    const rsi = ind && ind.rsi_14;
    if (rsi == null) {
      if (mount) mount.style.display = 'none';
      if (valueEl) valueEl.style.display = 'none';
      if (badgeEl) badgeEl.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    if (mount) mount.style.display = 'block';
    if (valueEl) valueEl.style.display = '';
    if (badgeEl) badgeEl.style.display = '';
    if (emptyState) emptyState.style.display = 'none';

    if (valueEl) valueEl.textContent = rsi.toFixed(1);

    let zone = 'neutral', zoneLabel = 'Neutral';
    if (rsi >= 70) { zone = 'overbought'; zoneLabel = 'Overbought'; }
    else if (rsi <= 30) { zone = 'oversold'; zoneLabel = 'Oversold'; }
    if (badgeEl) {
      badgeEl.textContent = zoneLabel;
      badgeEl.className = 'rsi-zone-badge ' + zone;
    }

    const render = () => {
      const chart = window.Charts._getChart(mountId);
      if (!chart) return;
      const p = window.Charts.palette;

      chart.setOption({
        backgroundColor: 'transparent',
        animationDuration: 600,
        series: [{
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          center: ['50%', '85%'],
          radius: '140%',
          min: 0,
          max: 100,
          axisLine: {
            lineStyle: {
              width: 10,
              color: [
                [0.3, p.emerald],
                [0.7, p.purple],
                [1.0, p.red],
              ],
            },
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '50%',
            width: 6,
            offsetCenter: [0, '-5%'],
            itemStyle: { color: window.Charts._isDark() ? p.slate200 : p.slate700 },
          },
          anchor: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          detail: { show: false },
          title: { show: false },
          data: [{ value: rsi }],
        }],
      }, true);
    };

    this._renderFns[mountId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  MACD                                                               */
  /* ------------------------------------------------------------------ */
  renderMACD(mountId, ind) {
    const mount = document.getElementById(mountId);
    const readoutEl = document.getElementById('macd-readout');
    const emptyState = document.getElementById('macd-empty-state');

    const hasData = ind && ind.macd != null && ind.macd_signal != null;
    if (!hasData) {
      if (mount) mount.style.display = 'none';
      if (readoutEl) readoutEl.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }
    if (mount) mount.style.display = 'block';
    if (readoutEl) readoutEl.style.display = '';
    if (emptyState) emptyState.style.display = 'none';

    if (readoutEl) {
      const histClass = ind.macd_hist >= 0 ? 'positive' : 'negative';
      readoutEl.innerHTML = `
        <div class="macd-readout-item is-primary">
          <span class="macd-readout-label">Histogram</span>
          <span class="macd-readout-value ${histClass} numeric">${this._fmtSigned(ind.macd_hist)}</span>
        </div>
        <div class="macd-readout-item">
          <span class="macd-readout-label">MACD</span>
          <span class="macd-readout-value numeric">${ind.macd.toFixed(2)}</span>
        </div>
        <div class="macd-readout-item">
          <span class="macd-readout-label">Signal</span>
          <span class="macd-readout-value numeric">${ind.macd_signal.toFixed(2)}</span>
        </div>
      `;
    }

    const render = () => {
      const chart = window.Charts._getChart(mountId);
      if (!chart) return;
      const p = window.Charts.palette;
      const dark = window.Charts._isDark();

      chart.setOption({
        backgroundColor: 'transparent',
        grid: { left: 0, right: 0, top: 8, bottom: 0, containLabel: false },
        xAxis: { type: 'category', data: ['MACD'], show: false },
        yAxis: { type: 'value', show: false },
        series: [{
          type: 'bar',
          data: [{
            value: ind.macd_hist,
            itemStyle: { color: ind.macd_hist >= 0 ? p.emerald : p.red },
          }],
          barWidth: '40%',
          markLine: {
            symbol: 'none',
            label: { show: false },
            lineStyle: { color: dark ? p.slate600 : p.slate300, type: 'solid', width: 1 },
            data: [{ yAxis: 0 }],
          },
        }],
      }, true);
    };

    this._renderFns[mountId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  Moving averages ribbon (DOM, not a chart — this is a comparison   */
  /*  table, not a trend line, so labeled rows read faster)             */
  /* ------------------------------------------------------------------ */
  renderMovingAverages(containerId, quote, ind) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const price = quote ? quote.price : null;
    const rows = [
      { label: 'SMA 20', value: ind && ind.sma_20 },
      { label: 'SMA 50', value: ind && ind.sma_50 },
      { label: 'EMA 20', value: ind && ind.ema_20 },
    ];

    const anyData = price != null && rows.some(r => r.value != null);
    if (!anyData) {
      el.innerHTML = `<div class="indicator-empty">Not enough price history for moving averages yet.</div>`;
      return;
    }

    el.innerHTML = rows.map(r => {
      if (r.value == null) {
        return `
          <div class="ma-row">
            <span class="ma-row-label">${r.label}</span>
            <span class="ma-row-value">—</span>
          </div>
        `;
      }
      const above = price >= r.value;
      return `
        <div class="ma-row">
          <span class="ma-row-label">${r.label}</span>
          <div class="ma-row-right">
            <span class="ma-row-value numeric">${this._fmtPrice(r.value)}</span>
            <span class="ma-row-badge ${above ? 'above' : 'below'}">Price ${above ? 'above' : 'below'}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  /* ------------------------------------------------------------------ */
  /*  Bollinger Bands position bar                                       */
  /* ------------------------------------------------------------------ */
  renderBollinger(containerId, quote, ind) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const price = quote ? quote.price : null;
    const hasData = price != null && ind && ind.bb_upper != null && ind.bb_lower != null;
    if (!hasData) {
      el.innerHTML = `<div class="indicator-empty">Not enough price history for Bollinger Bands yet.</div>`;
      return;
    }

    const { bb_upper, bb_lower, bb_middle } = ind;
    const range = Math.max(bb_upper - bb_lower, 0.0001);
    // %B: 0 = at lower band, 100 = at upper band. Can go slightly outside
    // 0-100 if price is beyond the bands, which is meaningful (a real
    // breakout signal), so it's clamped only for marker positioning, not
    // for the displayed number.
    const percentB = ((price - bb_lower) / range) * 100;
    const markerPct = Math.min(100, Math.max(0, percentB));

    el.innerHTML = `
      <div class="bb-labels-row">
        <span>${this._fmtPrice(bb_lower)}</span>
        <span>${this._fmtPrice(bb_middle)}</span>
        <span>${this._fmtPrice(bb_upper)}</span>
      </div>
      <div class="bb-track">
        <div class="bb-marker" style="left:${markerPct}%"></div>
      </div>
      <div class="bb-percent-label">
        %B: <strong class="numeric">${percentB.toFixed(0)}%</strong>
        — ${percentB >= 100 ? 'above upper band' : percentB <= 0 ? 'below lower band' : 'within bands'}
      </div>
    `;
  },

  /* ------------------------------------------------------------------ */
  /*  Theme refresh — called by App.toggleTheme()                       */
  /* ------------------------------------------------------------------ */
  refreshAll() {
    Object.values(this._renderFns).forEach(fn => {
      if (typeof fn === 'function') fn();
    });
  },
};