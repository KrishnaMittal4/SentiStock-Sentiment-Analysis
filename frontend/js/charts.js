/**
 * SentiStock AI — ECharts Chart Configurations
 * 
 * All chart instances rendered via Apache ECharts.
 * Reads theme from [data-theme] attribute on <html> for dark/light adaptation.
 * Stores every instance in `this.instances` for coordinated resize / theme refresh.
 *
 * Dependencies:
 *   - Apache ECharts (CDN, loaded before this script)
 *   - window.SentimentData  (data provider)
 *   - window.Utils          (helpers)
 */

window.Charts = {

  /* ------------------------------------------------------------------ */
  /*  Instance registry                                                  */
  /* ------------------------------------------------------------------ */
  instances: {},          // { containerId: echartsInstance }
  _renderFns: {},         // { containerId: () => void } — re-render callbacks

  /* ------------------------------------------------------------------ */
  /*  Design-system palette                                              */
  /* ------------------------------------------------------------------ */
  palette: {
    emerald:  '#10b981',
    red:      '#ef4444',
    amber:    '#f59e0b',
    blue:     '#3b82f6',
    purple:   '#8b5cf6',
    slate50:  '#f8fafc',
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

  /**
   * Returns a reusable ECharts-compatible theme config object that adapts
   * to the current dark / light mode by reading CSS custom properties.
   */
  getThemeConfig() {
    const dark = this._isDark();
    const p = this.palette;

    return {
      backgroundColor: 'transparent',

      // Global text defaults
      textStyle: {
        fontFamily: 'Geist, system-ui, sans-serif',
        color: dark ? p.slate400 : p.slate600,
        fontSize: 12,
      },

      // Title
      title: {
        textStyle: {
          fontFamily: 'Geist, system-ui, sans-serif',
          color: dark ? p.slate100 : p.slate800,
          fontWeight: 600,
          fontSize: 14,
        },
        subtextStyle: {
          fontFamily: 'Geist, system-ui, sans-serif',
          color: dark ? p.slate400 : p.slate500,
          fontSize: 12,
        },
      },

      // Legend
      legend: {
        textStyle: {
          fontFamily: 'Geist, system-ui, sans-serif',
          color: dark ? p.slate400 : p.slate600,
          fontSize: 12,
        },
      },

      // Tooltip
      tooltip: {
        backgroundColor: dark ? p.slate800 : '#ffffff',
        borderColor: dark ? p.slate700 : p.slate200,
        borderWidth: 1,
        textStyle: {
          fontFamily: 'Geist, system-ui, sans-serif',
          color: dark ? p.slate200 : p.slate700,
          fontSize: 12,
        },
        extraCssText: 'border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.12);',
      },

      // Category / value axes
      categoryAxis: {
        axisLine:  { lineStyle: { color: dark ? p.slate700 : p.slate200 } },
        axisTick:  { lineStyle: { color: dark ? p.slate700 : p.slate300 } },
        axisLabel: { color: dark ? p.slate400 : p.slate500, fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11 },
        splitLine: { lineStyle: { color: dark ? 'rgba(51,65,85,.35)' : 'rgba(226,232,240,.7)' } },
      },

      valueAxis: {
        axisLine:  { lineStyle: { color: dark ? p.slate700 : p.slate200 } },
        axisTick:  { show: false },
        axisLabel: { color: dark ? p.slate400 : p.slate500, fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11 },
        splitLine: { lineStyle: { color: dark ? 'rgba(51,65,85,.35)' : 'rgba(226,232,240,.7)', type: 'dashed' } },
      },
    };
  },

  /** Convenience: return themed tooltip config */
  _tooltip(extra = {}) {
    const t = this.getThemeConfig().tooltip;
    return { ...t, trigger: 'axis', ...extra };
  },

  /* ------------------------------------------------------------------ */
  /*  Loading overlay — uses the .chart-loading shimmer skeleton already */
  /*  defined in charts.css. Any chart-container can show/hide this      */
  /*  while its data is being fetched, instead of just sitting blank/    */
  /*  stale during the network round trip.                               */
  /* ------------------------------------------------------------------ */
  showLoading(containerId, message = 'Loading…') {
    const container = document.getElementById(containerId);
    if (!container) return;
    this.hideLoading(containerId); // avoid stacking duplicate overlays

    // .chart-loading is position:absolute; inset:0 — the container needs
    // to be a positioning context for that to anchor correctly.
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const overlay = document.createElement('div');
    overlay.className = 'chart-loading';
    overlay.id = containerId + '-loading-overlay';
    overlay.innerHTML = `<span class="chart-loading-text">${message}</span>`;
    container.appendChild(overlay);
  },

  hideLoading(containerId) {
    document.getElementById(containerId + '-loading-overlay')?.remove();
  },

  showNoData(containerId, message = 'No data available for the selected view.') {
    const container = document.getElementById(containerId);
    if (!container) return;
    this.hideLoading(containerId);
    this.hideNoData(containerId);
    this.hideError(containerId);

    if (this.instances[containerId]) {
      try { this.instances[containerId].dispose(); } catch (e) {}
      delete this.instances[containerId];
    }

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const overlay = document.createElement('div');
    overlay.className = 'chart-no-data-overlay';
    overlay.id = containerId + '-nodata-overlay';
    overlay.innerHTML = `
      <span class="overlay-icon" aria-hidden="true">📊</span>
      <div class="overlay-title">No Data Available</div>
      <div class="overlay-message">${message}</div>
    `;
    container.appendChild(overlay);
  },

  hideNoData(containerId) {
    document.getElementById(containerId + '-nodata-overlay')?.remove();
  },

  showError(containerId, message = 'An error occurred while loading this chart.') {
    const container = document.getElementById(containerId);
    if (!container) return;
    this.hideLoading(containerId);
    this.hideNoData(containerId);
    this.hideError(containerId);

    if (this.instances[containerId]) {
      try { this.instances[containerId].dispose(); } catch (e) {}
      delete this.instances[containerId];
    }

    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const overlay = document.createElement('div');
    overlay.className = 'chart-error-overlay';
    overlay.id = containerId + '-error-overlay';

    const renderFn = this._renderFns[containerId];
    if (renderFn && window.Utils && window.Utils.createErrorCard) {
      const card = window.Utils.createErrorCard('Chart Display Error', message, () => {
        this.hideError(containerId);
        this.showLoading(containerId, 'Retrying chart render…');
        setTimeout(() => renderFn(), 300);
      });
      overlay.appendChild(card);
    } else {
      overlay.innerHTML = `
        <span class="overlay-icon" aria-hidden="true">⚠️</span>
        <div class="overlay-title">Chart Display Error</div>
        <div class="overlay-message">${message}</div>
      `;
    }

    container.appendChild(overlay);
  },

  hideError(containerId) {
    document.getElementById(containerId + '-error-overlay')?.remove();
  },

  /* ------------------------------------------------------------------ */
  /*  Internal: get-or-create chart instance                             */
  /* ------------------------------------------------------------------ */
  _getChart(containerId) {
    const dom = document.getElementById(containerId);
    if (!dom) {
      console.warn(`[Charts] Container #${containerId} not found`);
      return null;
    }

    // Dispose old instance if it exists
    if (this.instances[containerId]) {
      this.instances[containerId].dispose();
    }

    const chart = echarts.init(dom);
    this.instances[containerId] = chart;
    return chart;
  },

  /* ------------------------------------------------------------------ */
  /*  1. Sentiment Gauge                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Premium semicircular gauge.
   * @param {string} containerId - DOM element id
   * @param {number} score       - Sentiment score in range -1 … 1
   */
  renderSentimentGauge(containerId, score) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (score == null || isNaN(score)) {
          this.showNoData(containerId, 'No sentiment score available to display gauge.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;

        // Map -1…1 → 0…100 for gauge internals
        const gaugeValue = ((score + 1) / 2) * 100;

        // Determine label
        let label = 'Neutral';
        let labelColor = p.amber;
        if (score >= 0.2)       { label = 'Bullish';  labelColor = p.emerald; }
        else if (score <= -0.2) { label = 'Bearish';  labelColor = p.red; }

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          series: [
            {
              type: 'gauge',
              startAngle: 200,
              endAngle: -20,
              center: ['50%', '60%'],
              radius: '90%',
              min: 0,
              max: 100,

              // Thick arc with gradient color stops
              axisLine: {
                lineStyle: {
                  width: 20,
                  color: [
                    [0.3, p.red],
                    [0.6, p.amber],
                    [1.0, p.emerald],
                  ],
                },
              },

              // Elegant thin needle pointer
              pointer: {
                icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                length: '55%',
                width: 8,
                offsetCenter: [0, '-10%'],
                itemStyle: {
                  color: dark ? p.slate200 : p.slate700,
                  shadowColor: 'rgba(0,0,0,.25)',
                  shadowBlur: 6,
                  shadowOffsetY: 3,
                },
              },

              // Anchor dot at center of needle
              anchor: {
                show: true,
                showAbove: true,
                size: 14,
                itemStyle: {
                  borderWidth: 3,
                  borderColor: dark ? p.slate600 : p.slate300,
                  color: dark ? p.slate800 : '#ffffff',
                  shadowColor: 'rgba(0,0,0,.15)',
                  shadowBlur: 4,
                },
              },

              // Scale ticks
              axisTick: {
                distance: -24,
                length: 6,
                lineStyle: { color: dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)', width: 1 },
              },

              splitLine: {
                distance: -28,
                length: 12,
                lineStyle: { color: dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.2)', width: 2 },
              },

              // Scale labels (hidden — we use custom detail)
              axisLabel: { show: false },

              // Large center value label (actual score)
              detail: {
                valueAnimation: true,
                fontSize: 28,
                fontWeight: 700,
                fontFamily: 'Geist, system-ui, sans-serif',
                color: dark ? '#f1f5f9' : '#0f172a',
                offsetCenter: [0, '20%'],
                formatter: function () {
                  return score.toFixed(2);
                },
              },

              // Title below the score
              title: {
                offsetCenter: [0, '42%'],
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'Geist, system-ui, sans-serif',
                color: labelColor,
              },

              data: [{ value: gaugeValue, name: label }],
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering sentiment gauge #${containerId}:`, err);
        this.showError(containerId, 'Failed to render sentiment gauge chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /**
   * Market Mood Index (MMI) Gauge (0–100 score).
   * Color stops: 0-20 Extreme Fear, 20-40 Fear, 40-60 Neutral, 60-80 Greed, 80-100 Extreme Greed.
   * @param {string} containerId - DOM element id
   * @param {number} score       - MMI score (0..100)
   * @param {string} category    - Extreme Fear | Fear | Neutral | Greed | Extreme Greed
   */
  renderMarketMoodGauge(containerId, score, category) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (score == null || isNaN(score)) {
          this.showNoData(containerId, 'No Market Mood Index data available.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;

        let labelColor = p.amber;
        if (score < 20) labelColor = '#dc2626';
        else if (score < 40) labelColor = '#f97316';
        else if (score < 60) labelColor = '#eab308';
        else if (score < 80) labelColor = '#10b981';
        else labelColor = '#059669';

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          series: [
            {
              type: 'gauge',
              startAngle: 200,
              endAngle: -20,
              center: ['50%', '60%'],
              radius: '90%',
              min: 0,
              max: 100,
              axisLine: {
                lineStyle: {
                  width: 22,
                  color: [
                    [0.2, '#dc2626'], // Extreme Fear
                    [0.4, '#f97316'], // Fear
                    [0.6, '#eab308'], // Neutral
                    [0.8, '#10b981'], // Greed
                    [1.0, '#059669'], // Extreme Greed
                  ],
                },
              },
              pointer: {
                icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                length: '55%',
                width: 8,
                offsetCenter: [0, '-10%'],
                itemStyle: {
                  color: dark ? p.slate200 : p.slate700,
                  shadowColor: 'rgba(0,0,0,.25)',
                  shadowBlur: 6,
                  shadowOffsetY: 3,
                },
              },
              anchor: {
                show: true,
                showAbove: true,
                size: 14,
                itemStyle: {
                  borderWidth: 3,
                  borderColor: dark ? p.slate600 : p.slate300,
                  color: dark ? p.slate800 : '#ffffff',
                  shadowColor: 'rgba(0,0,0,.15)',
                  shadowBlur: 4,
                },
              },
              axisTick: {
                distance: -26,
                length: 6,
                lineStyle: { color: dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.15)', width: 1 },
              },
              splitLine: {
                distance: -30,
                length: 12,
                lineStyle: { color: dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.2)', width: 2 },
              },
              axisLabel: { show: false },
              detail: {
                valueAnimation: true,
                fontSize: 32,
                fontWeight: 700,
                fontFamily: 'Geist, system-ui, sans-serif',
                color: dark ? '#f1f5f9' : '#0f172a',
                offsetCenter: [0, '20%'],
                formatter: function () {
                  return score != null ? score.toFixed(1) : '—';
                },
              },
              title: {
                offsetCenter: [0, '42%'],
                fontSize: 16,
                fontWeight: 700,
                fontFamily: 'Geist, system-ui, sans-serif',
                color: labelColor,
              },
              data: [{ value: score || 0, name: category || 'Analyzing...' }],
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering market mood gauge #${containerId}:`, err);
        this.showError(containerId, 'Failed to render market mood gauge chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },


  /* ------------------------------------------------------------------ */
  /*  2. Sentiment Trend Area Chart                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Area chart with green > 0 / red < 0 gradient.
   * @param {string}   containerId
   * @param {Array<{date:string, score:number}>} data
   * @param {number}   days - number of days to display
   */
  renderSentimentTrend(containerId, data, days = 30) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (!data || !Array.isArray(data) || data.length === 0) {
          this.showNoData(containerId, 'No sentiment trend history available for selected ticker.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;
        const theme = this.getThemeConfig();

        // Trim to last N days
        const sliced = data.slice(-days);
        const dates  = sliced.map(d => d.date);
        const scores = sliced.map(d => d.score);

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          tooltip: {
            ...theme.tooltip,
            trigger: 'axis',
            formatter(params) {
              const pt = params[0];
              const val = pt.value;
              const color = val >= 0 ? p.emerald : p.red;
              return `<div style="font-family:Geist,system-ui,sans-serif">
                <div style="margin-bottom:4px;font-weight:600;color:${dark ? p.slate200 : p.slate800}">${pt.axisValue}</div>
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>
                Sentiment: <strong style="color:${color}">${val.toFixed(3)}</strong>
              </div>`;
            },
          },
          grid: { left: 48, right: 24, top: 24, bottom: 36, containLabel: false },
          xAxis: {
            type: 'category',
            data: dates,
            boundaryGap: false,
            ...theme.categoryAxis,
          },
          yAxis: {
            type: 'value',
            min: -1,
            max: 1,
            ...theme.valueAxis,
            splitNumber: 4,
          },
          series: [
            {
              type: 'line',
              data: scores,
              smooth: 0.35,
              symbol: 'none',
              lineStyle: { width: 2.5 },
              areaStyle: {
                opacity: 0.18,
              },
              // Zero-line via markLine
              markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: {
                  color: dark ? p.slate600 : p.slate300,
                  type: 'dashed',
                  width: 1,
                },
                data: [{ yAxis: 0 }],
                label: { show: false },
              },
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering sentiment trend #${containerId}:`, err);
        this.showError(containerId, 'Failed to render sentiment trend chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  3. Source Breakdown Donut                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Donut chart for source breakdown.
   * @param {string} containerId
   * @param {{ news:number, social:number, earnings:number }} data
   */
  renderSourceBreakdown(containerId, data) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
        if (!entries || entries.length === 0) {
          this.showNoData(containerId, 'No news publisher source breakdown data available.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;
        const theme = this.getThemeConfig();

        const total = entries.reduce((sum, [, count]) => sum + count, 0);
        const palette = [p.blue, p.purple, p.amber, p.emerald, p.red, p.slate400];

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          tooltip: {
            ...theme.tooltip,
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)',
          },
          legend: {
            orient: 'horizontal',
            bottom: 4,
            ...theme.legend,
            icon: 'circle',
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 16,
          },
          series: [
            {
              type: 'pie',
              radius: ['52%', '78%'],   // Donut
              center: ['50%', '45%'],
              avoidLabelOverlap: true,
              itemStyle: {
                borderRadius: 6,
                borderColor: dark ? p.slate900 : '#ffffff',
                borderWidth: 3,
              },
              label: {
                show: false,        // We rely on legend + center label
              },
              emphasis: {
                scaleSize: 8,
                label: {
                  show: true,
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Geist, system-ui, sans-serif',
                  color: dark ? p.slate200 : p.slate700,
                  formatter: '{b}\n{d}%',
                },
              },
              data: entries.map(([name, value], i) => ({
                value,
                name,
                itemStyle: { color: palette[i % palette.length] },
              })),
            },
          ],
          // Center total label via graphic
          graphic: [
            {
              type: 'text',
              left: 'center',
              top: '40%',
              style: {
                text: total.toLocaleString(),
                textAlign: 'center',
                fill: dark ? p.slate100 : p.slate800,
                fontSize: 22,
                fontWeight: 700,
                fontFamily: 'Geist, system-ui, sans-serif',
              },
            },
            {
              type: 'text',
              left: 'center',
              top: '50%',
              style: {
                text: 'Total',
                textAlign: 'center',
                fill: dark ? p.slate400 : p.slate500,
                fontSize: 11,
                fontFamily: 'Geist, system-ui, sans-serif',
              },
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering source breakdown #${containerId}:`, err);
        this.showError(containerId, 'Failed to render source breakdown chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  4. Social Volume Stacked Bar Chart                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Stacked bar chart — Twitter / Reddit / StockTwits volume.
   * @param {string} containerId
   * @param {Array<{date:string, twitter:number, reddit:number, stocktwits:number}>} data
   */
  renderSocialVolume(containerId, data) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (!data || !Array.isArray(data) || data.length === 0) {
          this.showNoData(containerId, 'No social volume data available.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;
        const theme = this.getThemeConfig();

        const dates = data.map(d => d.date);

        const barSeries = (name, key, color) => ({
          name,
          type: 'bar',
          stack: 'volume',
          data: data.map(d => d[key] || 0),
          itemStyle: { color, borderRadius: [0, 0, 0, 0] },
          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.15)' } },
          barMaxWidth: 24,
        });

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          tooltip: {
            ...theme.tooltip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
          },
          legend: {
            ...theme.legend,
            bottom: 4,
            icon: 'roundRect',
            itemWidth: 12,
            itemHeight: 8,
            itemGap: 16,
          },
          grid: { left: 48, right: 16, top: 24, bottom: 48, containLabel: false },
          xAxis: {
            type: 'category',
            data: dates,
            ...theme.categoryAxis,
          },
          yAxis: {
            type: 'value',
            name: 'Mentions',
            nameTextStyle: { color: dark ? p.slate400 : p.slate500, fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11 },
            ...theme.valueAxis,
          },
          series: [
            barSeries('Twitter',    'twitter',    p.blue),
            barSeries('Reddit',     'reddit',     p.amber),
            barSeries('StockTwits', 'stocktwits', p.purple),
          ],
        };

        // Round top corners on the topmost visible series
        option.series[option.series.length - 1].itemStyle.borderRadius = [4, 4, 0, 0];

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering social volume #${containerId}:`, err);
        this.showError(containerId, 'Failed to render social volume chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  5. Earnings Call Sentiment Timeline                                */
  /* ------------------------------------------------------------------ */

  /**
   * Bar chart showing sentiment per earnings-call section.
   * @param {string} containerId
   * @param {Array<{name:string, sentiment:number}>} sections
   */
  renderEarningsTimeline(containerId, sections) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (!sections || !Array.isArray(sections) || sections.length === 0) {
          this.showNoData(containerId, 'No earnings call transcript timeline data available.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;
        const theme = this.getThemeConfig();

        // Color each bar based on sentiment value
        const barColors = sections.map(s => {
          if (s.sentiment >= 0.2)  return p.emerald;
          if (s.sentiment <= -0.2) return p.red;
          return p.amber;
        });

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          tooltip: {
            ...theme.tooltip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter(params) {
              const pt = params[0];
              const val = pt.value;
              const color = val >= 0.2 ? p.emerald : val <= -0.2 ? p.red : p.amber;
              return `<div style="font-family:Geist,system-ui,sans-serif">
                <div style="margin-bottom:4px;font-weight:600;color:${dark ? p.slate200 : p.slate800}">${pt.name}</div>
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>
                Sentiment: <strong style="color:${color}">${val.toFixed(2)}</strong>
              </div>`;
            },
          },
          grid: { left: 120, right: 48, top: 16, bottom: 24 },
          xAxis: {
            type: 'value',
            min: -1,
            max: 1,
            ...theme.valueAxis,
            splitNumber: 4,
            // Zero line
            splitLine: { lineStyle: { color: dark ? 'rgba(51,65,85,.35)' : 'rgba(226,232,240,.7)', type: 'dashed' } },
          },
          yAxis: {
            type: 'category',
            data: sections.map(s => s.name),
            inverse: true,
            ...theme.categoryAxis,
            axisLabel: {
              color: dark ? p.slate300 : p.slate600,
              fontFamily: 'Geist, system-ui, sans-serif',
              fontSize: 11,
              width: 100,
              overflow: 'truncate',
            },
          },
          series: [
            {
              type: 'bar',
              data: sections.map((s, i) => ({
                value: s.sentiment,
                itemStyle: {
                  color: barColors[i],
                  borderRadius: s.sentiment >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
                },
              })),
              barMaxWidth: 20,
              label: {
                show: true,
                position: 'right',
                fontFamily: 'Geist, system-ui, sans-serif',
                fontSize: 11,
                fontWeight: 600,
                color: dark ? p.slate300 : p.slate600,
                formatter: params => params.value.toFixed(2),
              },
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering earnings timeline #${containerId}:`, err);
        this.showError(containerId, 'Failed to render earnings call sentiment timeline.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  6. Correlation Analysis (Combined Trend + Scatter Plot)            */
  /* ------------------------------------------------------------------ */

  /**
   * Combined dual-axis line chart for Price ($), Sentiment (-1..+1), and Rolling Correlation (-1..+1).
   * @param {string} containerId
   * @param {Array<{date:string, closing_price:number, sentiment:number, rolling_correlation:number|null}>} combinedTrend
   */
  renderCombinedCorrelationTrend(containerId, combinedTrend) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (!combinedTrend || !Array.isArray(combinedTrend) || combinedTrend.length === 0) {
          this.showNoData(containerId, 'No historical price & sentiment database records available for correlation trend.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;
        const theme = this.getThemeConfig();

      const dates = combinedTrend.map(d => d.date);
      const prices = combinedTrend.map(d => d.closing_price);
      const sentiments = combinedTrend.map(d => d.sentiment);
      const rolling = combinedTrend.map(d => d.rolling_correlation);

      const option = {
        backgroundColor: 'transparent',
        animationDuration: 800,
        animationEasing: 'cubicOut',
        tooltip: {
          ...theme.tooltip,
          trigger: 'axis',
          axisPointer: { type: 'cross' },
          formatter(params) {
            let html = `<div style="font-family:Geist,system-ui,sans-serif">
              <div style="margin-bottom:6px;font-weight:600;color:${dark ? p.slate200 : p.slate800}">${params[0].axisValue}</div>`;
            params.forEach(pt => {
              if (pt.value == null) return;
              const valFormatted = pt.seriesName.includes('Price')
                ? `$${pt.value.toFixed(2)}`
                : pt.value.toFixed(3);
              html += `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:3px">
                <span><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${pt.color};margin-right:6px"></span>${pt.seriesName}:</span>
                <strong style="color:${pt.color}">${valFormatted}</strong>
              </div>`;
            });
            html += `</div>`;
            return html;
          },
        },
        grid: { left: 54, right: 54, top: 28, bottom: 40 },
        xAxis: {
          type: 'category',
          data: dates,
          boundaryGap: false,
          ...theme.categoryAxis,
        },
        yAxis: [
          // Y-axis 0: Stock Price ($)
          {
            type: 'value',
            name: 'Price ($)',
            nameTextStyle: { color: p.blue, fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11 },
            scale: true,
            position: 'left',
            ...theme.valueAxis,
            axisLabel: {
              ...theme.valueAxis.axisLabel,
              formatter: v => `$${v.toFixed(0)}`,
            },
          },
          // Y-axis 1: Sentiment Score & Rolling Correlation (-1..+1)
          {
            type: 'value',
            name: 'Score / Correlation',
            nameTextStyle: { color: p.emerald, fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11 },
            min: -1.0,
            max: 1.0,
            position: 'right',
            ...theme.valueAxis,
            splitLine: { show: false },
          },
        ],
        series: [
          // Stock Price Series
          {
            name: 'Closing Price',
            type: 'line',
            yAxisIndex: 0,
            data: prices,
            smooth: 0.25,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2.5, color: p.blue },
            itemStyle: { color: p.blue },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(59,130,246,0.20)' },
                  { offset: 1, color: 'rgba(59,130,246,0.01)' },
                ],
              },
            },
          },
          // Sentiment Score Series
          {
            name: 'Sentiment Score',
            type: 'line',
            yAxisIndex: 1,
            data: sentiments,
            smooth: 0.35,
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: { width: 2, color: p.emerald },
            itemStyle: { color: p.emerald },
          },
          // Rolling Correlation Series
          {
            name: 'Rolling Correlation',
            type: 'line',
            yAxisIndex: 1,
            data: rolling,
            smooth: 0.3,
            symbol: 'none',
            lineStyle: { width: 2, color: p.purple, type: 'dashed' },
            itemStyle: { color: p.purple },
          },
        ],
      };

      chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering combined correlation trend #${containerId}:`, err);
        this.showError(containerId, 'Failed to render combined correlation trend chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /**
   * Scatter: sentiment score vs price with linear regression trendline.
   * @param {string}   containerId
   * @param {number[]} sentimentScores  — array of daily sentiment scores
   * @param {number[]} priceChanges     — array of daily closing prices or price change %
   * @param {object}   [opts]           — optional custom slope/intercept/r/dates
   */
  renderCorrelation(containerId, sentimentScores, priceChanges, opts = {}) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (!sentimentScores || !Array.isArray(sentimentScores) || sentimentScores.length === 0) {
          this.showNoData(containerId, 'No sentiment & price scatter plot data points available.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;
        const theme = this.getThemeConfig();

        // Build scatter data and color by quadrant/sign
        const dates = opts.dates || [];
        const points = sentimentScores.map((s, i) => {
          const pc = priceChanges[i];
          let color = p.amber;
          if (s >= 0.05 && pc >= 0)       color = p.emerald;  // +sentiment +price
          else if (s < -0.05 && pc < 0)   color = p.red;      // -sentiment -price
          
          return {
            value: [s, pc],
            date: dates[i] || '',
            itemStyle: { color, borderColor: dark ? p.slate800 : '#ffffff', borderWidth: 1.5 },
          };
        });

        // Linear regression
        let slope = opts.slope;
        let intercept = opts.intercept;
        let r = opts.r;

        if (slope == null || intercept == null) {
          const n = sentimentScores.length;
          let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
          for (let i = 0; i < n; i++) {
            const x = sentimentScores[i];
            const y = priceChanges[i];
            sumX  += x;
            sumY  += y;
            sumXY += x * y;
            sumX2 += x * x;
            sumY2 += y * y;
          }
          slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
          intercept = (sumY - slope * sumX) / n || 0;
          const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
          r = denom ? (n * sumXY - sumX * sumY) / denom : 0;
        }

        // Trendline endpoints
        const xMin = -1.0, xMax = 1.0;
        const trendData = [
          [xMin, slope * xMin + intercept],
          [xMax, slope * xMax + intercept],
        ];

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          tooltip: {
            ...theme.tooltip,
            trigger: 'item',
            formatter(params) {
              if (params.seriesIndex !== 0) return '';
              const [sent, price] = params.value;
              const dateStr = params.data.date ? `<div style="color:${dark ? p.slate400 : p.slate500};margin-bottom:4px">${params.data.date}</div>` : '';
              const isPriceVal = price > 10;
              const priceFmt = isPriceVal ? `$${price.toFixed(2)}` : `${price.toFixed(2)}%`;

              return `<div style="font-family:Geist,system-ui,sans-serif">
                ${dateStr}
                Sentiment Score: <strong>${sent.toFixed(3)}</strong><br/>
                Closing Price: <strong>${priceFmt}</strong>
              </div>`;
            },
          },
          grid: { left: 56, right: 24, top: 36, bottom: 44, containLabel: false },
          xAxis: {
            type: 'value',
            name: 'Sentiment Score',
            nameLocation: 'center',
            nameGap: 28,
            nameTextStyle: { fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11, color: dark ? p.slate400 : p.slate500 },
            min: -1,
            max: 1,
            ...theme.valueAxis,
          },
          yAxis: {
            type: 'value',
            name: priceChanges[0] > 10 ? 'Price ($)' : 'Price Δ %',
            nameLocation: 'center',
            nameGap: 40,
            scale: true,
            nameTextStyle: { fontFamily: 'Geist, system-ui, sans-serif', fontSize: 11, color: dark ? p.slate400 : p.slate500 },
            ...theme.valueAxis,
          },
          graphic: [
            {
              type: 'text',
              right: 16,
              top: 8,
              style: {
                text: `Pearson r = ${(r || 0).toFixed(3)}`,
                fill: dark ? p.slate300 : p.slate600,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'Geist, system-ui, sans-serif',
              },
            },
          ],
          series: [
            // Scatter points
            {
              type: 'scatter',
              data: points,
              symbolSize: 10,
              emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,.3)' } },
            },
            // Trendline
            {
              type: 'line',
              data: trendData,
              symbol: 'none',
              lineStyle: {
                color: dark ? p.slate400 : p.slate500,
                width: 2,
                type: 'dashed',
              },
              silent: true,
              tooltip: { show: false },
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering correlation scatter #${containerId}:`, err);
        this.showError(containerId, 'Failed to render correlation scatter plot.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  7. Sentiment Distribution                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Horizontal bar chart for positive / neutral / negative distribution.
   * @param {string} containerId
   * @param {{ positive:number, neutral:number, negative:number }} distribution
   */
  renderSentimentDistribution(containerId, distribution) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (!distribution) {
          this.showNoData(containerId, 'No sentiment distribution data available.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const dark = this._isDark();
        const p = this.palette;
        const theme = this.getThemeConfig();

        const total = (distribution.positive || 0) + (distribution.neutral || 0) + (distribution.negative || 0);
        const pct = v => total ? ((v / total) * 100).toFixed(1) : '0.0';

        const categories = ['Negative', 'Neutral', 'Positive'];
        const values     = [distribution.negative || 0, distribution.neutral || 0, distribution.positive || 0];
        const colors     = [p.red, p.amber, p.emerald];

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 800,
          animationEasing: 'cubicOut',
          tooltip: {
            ...theme.tooltip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter(params) {
              const pt = params[0];
              return `<div style="font-family:Geist,system-ui,sans-serif">
                ${pt.name}: <strong>${pt.value}</strong> (${pct(pt.value)}%)
              </div>`;
            },
          },
          grid: { left: 80, right: 64, top: 8, bottom: 8, containLabel: false },
          xAxis: {
            type: 'value',
            show: false,
          },
          yAxis: {
            type: 'category',
            data: categories,
            ...theme.categoryAxis,
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: {
              fontFamily: 'Geist, system-ui, sans-serif',
              fontSize: 12,
              fontWeight: 600,
              color: dark ? p.slate300 : p.slate600,
            },
          },
          series: [
            {
              type: 'bar',
              data: values.map((v, i) => ({
                value: v,
                itemStyle: { color: colors[i], borderRadius: [0, 6, 6, 0] },
              })),
              barMaxWidth: 22,
              label: {
                show: true,
                position: 'right',
                fontFamily: 'Geist, system-ui, sans-serif',
                fontSize: 11,
                fontWeight: 600,
                color: dark ? p.slate300 : p.slate600,
                formatter: params => `${params.value}  (${pct(params.value)}%)`,
              },
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering distribution #${containerId}:`, err);
        this.showError(containerId, 'Failed to render sentiment distribution chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  8. Mini Sparkline                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Tiny sparkline for embedding inside tables (≈80×24 px container).
   * No axes, no labels, no grid — just the line.
   * @param {string}   containerId
   * @param {number[]} data - array of sentiment scores over time
   */
  renderSparkline(containerId, data) {
    const render = () => {
      try {
        if (!data || !Array.isArray(data) || data.length === 0) {
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const p = this.palette;

        // Determine trend direction: compare first and last value
        const trending = data.length >= 2 ? data[data.length - 1] - data[0] : 0;
        const lineColor = trending >= 0 ? p.emerald : p.red;

        const option = {
          backgroundColor: 'transparent',
          animationDuration: 600,
          animationEasing: 'cubicOut',
          grid: { left: 0, right: 0, top: 0, bottom: 0 },
          xAxis: { type: 'category', show: false, data: data.map((_, i) => i) },
          yAxis: { type: 'value', show: false },
          series: [
            {
              type: 'line',
              data: data,
              smooth: 0.4,
              symbol: 'none',
              lineStyle: { width: 1.5, color: lineColor },
              areaStyle: {
                color: {
                  type: 'linear',
                  x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: lineColor + '30' },
                    { offset: 1, color: lineColor + '05' },
                  ],
                },
              },
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering sparkline #${containerId}:`, err);
      }
    };

    this._renderFns[containerId] = render;
    render();
  },

  /* ------------------------------------------------------------------ */
  /*  9. News vs Reddit Comparison Chart                                */
  /* ------------------------------------------------------------------ */
  renderNewsVsRedditChart(containerId, merged) {
    const render = () => {
      try {
        this.hideLoading(containerId);
        this.hideNoData(containerId);
        this.hideError(containerId);

        if (!merged) {
          this.showNoData(containerId, 'No merged News vs Reddit sentiment data available.');
          return;
        }

        const chart = this._getChart(containerId);
        if (!chart) return;

        const p = this.palette;
        const dark = this._isDark();

        const newsVal = merged.news_sentiment || 0;
        const redditVal = merged.reddit_sentiment || 0;
        const mergedVal = merged.merged_sentiment || 0;

        const option = {
          backgroundColor: 'transparent',
          grid: { top: 20, bottom: 30, left: 60, right: 30 },
          tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            formatter: params => {
              const item = params[0];
              return `${item.name}: <b>${item.value > 0 ? '+' : ''}${item.value}</b>`;
            },
          },
          xAxis: {
            type: 'category',
            data: ['News', 'Reddit', 'Merged'],
            axisLine: { lineStyle: { color: dark ? p.slate700 : p.slate200 } },
            axisLabel: { color: dark ? p.slate300 : p.slate600, fontSize: 11 },
          },
          yAxis: {
            type: 'value',
            min: -1,
            max: 1,
            splitLine: { lineStyle: { color: dark ? 'rgba(255,255,255,0.06)' : p.slate100 } },
            axisLabel: { color: dark ? p.slate400 : p.slate500, fontSize: 10 },
          },
          series: [
            {
              type: 'bar',
              barWidth: '40%',
              data: [
                {
                  value: newsVal,
                  itemStyle: { color: newsVal >= 0 ? p.emerald : p.red, borderRadius: [4, 4, 0, 0] },
                },
                {
                  value: redditVal,
                  itemStyle: { color: '#ff4500', borderRadius: [4, 4, 0, 0] },
                },
                {
                  value: mergedVal,
                  itemStyle: { color: '#a855f7', borderRadius: [4, 4, 0, 0] },
                },
              ],
            },
          ],
        };

        chart.setOption(option);
      } catch (err) {
        console.error(`[Charts] Error rendering news vs reddit comparison #${containerId}:`, err);
        this.showError(containerId, 'Failed to render news vs reddit comparison chart.');
      }
    };

    this._renderFns[containerId] = render;
    render();
  },


  /* ------------------------------------------------------------------ */
  /*  Instance lifecycle                                                 */
  /* ------------------------------------------------------------------ */

  /** Resize every active chart instance (bind to window resize). */
  resizeAll() {
    Object.values(this.instances).forEach(chart => {
      if (chart && !chart.isDisposed()) chart.resize();
    });
  },

  /** Dispose and re-render every chart (call after theme change). */
  refreshAll() {
    Object.keys(this._renderFns).forEach(id => {
      const fn = this._renderFns[id];
      if (typeof fn === 'function') fn();
    });
  },

  /** Destroy all chart instances and clear the registry. */
  destroyAll() {
    Object.values(this.instances).forEach(chart => {
      if (chart && !chart.isDisposed()) chart.dispose();
    });
    this.instances  = {};
    this._renderFns = {};
  },
};