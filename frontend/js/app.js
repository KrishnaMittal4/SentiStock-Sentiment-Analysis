/* ============================================================
   app.js — SentiStock AI Main Application Controller
   Initializes the dashboard, manages state, handles events.
   ============================================================ */

(function () {
  'use strict';

  const App = {
    state: {
      currentTicker: 'AAPL',
      currentRange: 30,
      newsFilter: 'all',
      theme: 'dark',
    },

    /* ----------------------------------------------------------
       Initialization
    ---------------------------------------------------------- */
    init() {
      this.state.theme = window.Utils ? window.Utils.getTheme() : 'dark';
      this.applyTheme(this.state.theme);
      this.bindEvents();
      this.populateSelectors();
      this.injectNavIcons();
      this.checkMarketStatus();

      let rendered = false;
      const doRender = () => {
        if (rendered) return;
        rendered = true;
        document.body.classList.add('data-connected');
        this.renderAll();
      };

      document.addEventListener('sentistock:connected', () => {
        doRender();
      });

      if (window.LiveData) {
        if (window.LiveData.isConnected()) {
          doRender();
        }
        window.LiveData.showGate();
        window.LiveData.injectConnectUI();
      } else {
        doRender();
      }

      // Delay charts init slightly so DOM is ready
      requestAnimationFrame(() => {
        window.addEventListener('resize', (window.Utils && window.Utils.debounce)
          ? window.Utils.debounce(() => {
              if (window.Charts) window.Charts.resizeAll();
              if (window.PriceChart) window.PriceChart.resize();
            }, 200)
          : () => {
              if (window.Charts) window.Charts.resizeAll();
              if (window.PriceChart) window.PriceChart.resize();
            });
      });
    },

    /** Render everything that depends on live data. */
    renderAll() {
      const safeRun = (fn, name) => {
        try {
          fn.call(this);
        } catch (err) {
          console.error(`[App] Error in ${name}:`, err);
        }
      };

      safeRun(() => this.renderMarketStrip(), 'renderMarketStrip');
      safeRun(() => this.renderSummaryWidgets(this.state.currentTicker), 'renderSummaryWidgets');
      safeRun(() => this.renderRecommendation(this.state.currentTicker), 'renderRecommendation');
      safeRun(() => this.renderDashboard(), 'renderDashboard');
      safeRun(() => this.renderNewsFeed(), 'renderNewsFeed');
      safeRun(() => this.renderCorrelation(), 'renderCorrelation');
      safeRun(() => this.renderWordCloud(), 'renderWordCloud');
      safeRun(() => this.initPriceChart(), 'initPriceChart');
      safeRun(() => { if (window.Indicators) window.Indicators.renderAll(this.state.currentTicker); }, 'Indicators.renderAll');
      safeRun(() => this.renderAIBrief(this.state.currentTicker), 'renderAIBrief');
      safeRun(() => this.renderEarningsTranscript(this.state.currentTicker), 'renderEarningsTranscript');
      safeRun(() => this.renderRedditSentiment(this.state.currentTicker), 'renderRedditSentiment');
      safeRun(() => this.renderMarketMoodIndex(this.state.currentTicker), 'renderMarketMoodIndex');
      safeRun(() => this.renderHistoricalSentimentStorage(this.state.currentTicker), 'renderHistoricalSentimentStorage');
      safeRun(() => {
        if (window.MLPrediction) {
          window.MLPrediction.init();
          window.MLPrediction.loadPrediction(this.state.currentTicker);
        }
      }, 'MLPrediction');
      safeRun(() => this.startLiveUpdates(), 'startLiveUpdates');
    },

    async onTickerChange() {
      const ticker = this.state.currentTicker;

      // Show loading pulse on summary widgets & chart overlays
      const summaryWidgets = document.querySelectorAll('.widget-card');
      summaryWidgets.forEach(w => w.classList.add('widget-loading-pulse'));

      if (window.PriceChart) window.PriceChart.showLoading(`Loading ${ticker} chart…`);
      if (window.Charts) {
        window.Charts.showLoading('sentiment-gauge', `Loading ${ticker}…`);
        window.Charts.showLoading('sentiment-trend', `Loading ${ticker}…`);
        window.Charts.showLoading('mmi-gauge', `Loading ${ticker}…`);
      }

      if (window.LiveData) {
        try {
          await window.LiveData.loadTicker(ticker);
        } catch (err) {
          console.warn('[App] loadTicker failed for', ticker, err);
        }
      }

      summaryWidgets.forEach(w => w.classList.remove('widget-loading-pulse'));

      this.renderSummaryWidgets(ticker);
      this.renderRecommendation(ticker);
      this.renderDashboard();
      this.renderNewsFeed();
      this.renderCorrelation();
      this.renderWordCloud();
      this.renderAIBrief(ticker);
      this.renderEarningsTranscript(ticker);
      this.renderRedditSentiment(ticker);
      this.renderMarketMoodIndex(ticker);
      this.renderHistoricalSentimentStorage(ticker);
      if (window.PriceChart) window.PriceChart.updateTicker(ticker);
      if (window.Indicators) window.Indicators.renderAll(ticker);
      if (window.MLPrediction) window.MLPrediction.loadPrediction(ticker);
    },

    /** Render the 12 summary KPI widgets at the top of the dashboard */
    renderSummaryWidgets(ticker) {
      const tickerBadge = document.getElementById('summary-widgets-ticker-badge');
      const foundTickerObj = (window.SentimentData?.STOCK_TICKERS || []).find(t => t.ticker === ticker);
      if (tickerBadge) {
        tickerBadge.textContent = `${ticker} — ${foundTickerObj?.name || ticker}`;
      }

      const quotes = window.SentimentData?.QUOTES || {};
      const quote = quotes[ticker];
      const engine = window.SentimentEngine;
      const data = window.SentimentData;
      const summary = engine ? engine.getDashboardSummary(data, ticker) : null;

      // 1. Current Price
      const wPriceVal = document.getElementById('w-price-value');
      const wPriceSub = document.getElementById('w-price-sub');
      const wPriceBadge = document.getElementById('w-price-badge');
      if (wPriceVal) {
        wPriceVal.textContent = quote?.price != null ? `$${quote.price.toFixed(2)}` : '$—';
      }
      if (wPriceSub) {
        wPriceSub.textContent = quote?.high ? `Day High: $${quote.high.toFixed(2)}` : 'Market Close';
      }
      if (wPriceBadge) {
        wPriceBadge.textContent = 'Real-time';
        wPriceBadge.className = 'widget-badge badge-positive';
      }

      // 2. Today's Change
      const wChangeVal = document.getElementById('w-change-value');
      const wChangeSub = document.getElementById('w-change-sub');
      const wChangeBadge = document.getElementById('w-change-badge');
      if (wChangeVal && quote) {
        const isUp = quote.change >= 0;
        const sign = isUp ? '+' : '';
        wChangeVal.textContent = `${sign}$${quote.change.toFixed(2)} (${sign}${quote.changePct.toFixed(2)}%)`;
        wChangeVal.style.color = isUp ? 'var(--color-bullish)' : 'var(--color-bearish)';
        if (wChangeBadge) {
          wChangeBadge.textContent = isUp ? 'Bullish' : 'Bearish';
          wChangeBadge.className = `widget-badge ${isUp ? 'badge-positive' : 'badge-negative'}`;
        }
      } else if (wChangeVal) {
        wChangeVal.textContent = '—';
        wChangeVal.style.color = '';
      }
      if (wChangeSub && quote) {
        wChangeSub.textContent = `Prev Close: $${quote.prevClose?.toFixed(2) || '—'}`;
      }

      // 3. News Sentiment
      const wNewsVal = document.getElementById('w-news-value');
      const wNewsSub = document.getElementById('w-news-sub');
      const wNewsBadge = document.getElementById('w-news-badge');
      if (summary) {
        const score = summary.overallSentiment;
        if (wNewsVal) {
          const sign = score > 0 ? '+' : '';
          wNewsVal.textContent = `${sign}${score.toFixed(2)}`;
          wNewsVal.style.color = score >= 0.15 ? 'var(--color-bullish)' : score <= -0.15 ? 'var(--color-bearish)' : 'var(--color-neutral)';
        }
        if (wNewsSub) {
          wNewsSub.textContent = `${summary.volume || 0} Articles Scored`;
        }
        if (wNewsBadge) {
          wNewsBadge.textContent = summary.marketMood || 'Neutral';
          wNewsBadge.className = `widget-badge ${score >= 0.15 ? 'badge-positive' : score <= -0.15 ? 'badge-negative' : 'badge-neutral'}`;
        }
      }

      // 4. Reddit Sentiment
      const wRedditVal = document.getElementById('w-reddit-value');
      const wRedditSub = document.getElementById('w-reddit-sub');
      const wRedditBadge = document.getElementById('w-reddit-badge');
      const redditCache = window.SentimentData?.REDDIT_DATA?.[ticker];
      if (redditCache && redditCache.average_sentiment != null) {
        const rScore = redditCache.average_sentiment || 0;
        if (wRedditVal) {
          const sign = rScore > 0 ? '+' : '';
          wRedditVal.textContent = `${sign}${rScore.toFixed(2)}`;
          wRedditVal.style.color = rScore >= 0.15 ? 'var(--color-bullish)' : rScore <= -0.15 ? 'var(--color-bearish)' : 'var(--color-neutral)';
        }
        if (wRedditSub) {
          wRedditSub.textContent = `${redditCache.number_of_posts_analyzed || 0} Reddit Posts Analyzed`;
        }
        if (wRedditBadge) {
          wRedditBadge.textContent = redditCache.sentiment_label || 'Neutral';
          wRedditBadge.className = `widget-badge ${rScore >= 0.15 ? 'badge-positive' : rScore <= -0.15 ? 'badge-negative' : 'badge-neutral'}`;
        }
      } else {
        if (wRedditVal) wRedditVal.textContent = '—';
        if (wRedditBadge) wRedditBadge.textContent = 'Fetching…';
      }

      // 5. Transcript Sentiment
      const wTransVal = document.getElementById('w-transcript-value');
      const wTransSub = document.getElementById('w-transcript-sub');
      const wTransBadge = document.getElementById('w-transcript-badge');
      const transcriptCache = window.SentimentData?.TRANSCRIPT_DATA?.[ticker];
      if (transcriptCache && transcriptCache.quarter) {
        const tScore = transcriptCache.sentiment_label || 'Neutral';
        const tConf = transcriptCache.avg_confidence != null ? `${Math.round(transcriptCache.avg_confidence * 100)}% Conf` : 'NLP Engine';
        if (wTransVal) wTransVal.textContent = tScore.charAt(0).toUpperCase() + tScore.slice(1);
        if (wTransSub) wTransSub.textContent = `${transcriptCache.quarter || 'Q1'} ${transcriptCache.year || 2026} Earnings Call`;
        if (wTransBadge) {
          const isPos = tScore.toLowerCase().includes('positive');
          const isNeg = tScore.toLowerCase().includes('negative');
          wTransBadge.textContent = tConf;
          wTransBadge.className = `widget-badge ${isPos ? 'badge-positive' : isNeg ? 'badge-negative' : 'badge-neutral'}`;
        }
      } else {
        if (wTransVal) wTransVal.textContent = '—';
        if (wTransBadge) wTransBadge.textContent = 'Transcript N/A';
      }

      // 6. Market Mood
      const wMoodVal = document.getElementById('w-mood-value');
      const wMoodSub = document.getElementById('w-mood-sub');
      const wMoodBadge = document.getElementById('w-mood-badge');
      const mmiCache = window.SentimentData?.MMI_DATA?.[ticker];
      if (mmiCache && mmiCache.mmi_score != null) {
        if (wMoodVal) wMoodVal.textContent = `${Math.round(mmiCache.mmi_score)} / 100`;
        if (wMoodSub) wMoodSub.textContent = `News, Social & Technicals`;
        if (wMoodBadge) {
          const cat = mmiCache.category || 'Neutral';
          wMoodBadge.textContent = cat;
          wMoodBadge.className = `widget-badge ${cat.includes('Greed') ? 'badge-positive' : cat.includes('Fear') ? 'badge-negative' : 'badge-neutral'}`;
        }
      } else {
        if (wMoodVal) wMoodVal.textContent = '—';
        if (wMoodBadge) wMoodBadge.textContent = 'Calculating…';
      }

      // 7. Prediction
      const wPredVal = document.getElementById('w-prediction-value');
      const wPredSub = document.getElementById('w-prediction-sub');
      const wPredBadge = document.getElementById('w-prediction-badge');
      const mlCache = window.MLPrediction?._lastPrediction;
      if (mlCache && mlCache.ticker === ticker) {
        const dir = mlCache.prediction_label || 'UP';
        const isUp = dir === 'UP';
        const prob = Math.round((isUp ? mlCache.up_probability : mlCache.down_probability) * 100);
        if (wPredVal) {
          wPredVal.textContent = `${isUp ? '⬆️ UP' : '⬇️ DOWN'}`;
          wPredVal.style.color = isUp ? 'var(--color-bullish)' : 'var(--color-bearish)';
        }
        if (wPredSub) wPredSub.textContent = `Model: ${(mlCache.model_name || 'Random Forest').toUpperCase()}`;
        if (wPredBadge) {
          wPredBadge.textContent = `${prob}% Probability`;
          wPredBadge.className = `widget-badge ${isUp ? 'badge-positive' : 'badge-negative'}`;
        }
      } else {
        if (wPredVal) wPredVal.textContent = '—';
        if (wPredBadge) wPredBadge.textContent = 'ML Running…';
      }

      // 8. Recommendation
      const wRecVal = document.getElementById('w-rec-value');
      const wRecSub = document.getElementById('w-rec-sub');
      const wRecBadge = document.getElementById('w-rec-badge');
      const recCache = window.SentimentData?.RECOMMENDATION_DATA?.[ticker];
      if (recCache && recCache.recommendation) {
        const recAction = recCache.recommendation || 'HOLD';
        const confPct = Math.round((recCache.confidence || 0) * 100);
        if (wRecVal) {
          wRecVal.textContent = recAction;
          wRecVal.style.color = recAction === 'BUY' ? 'var(--color-bullish)' : recAction === 'SELL' ? 'var(--color-bearish)' : 'var(--color-neutral)';
        }
        if (wRecSub) wRecSub.textContent = `Score: ${(recCache.score || 0).toFixed(2)}`;
        if (wRecBadge) {
          wRecBadge.textContent = `${confPct}% Conf`;
          wRecBadge.className = `widget-badge ${recAction === 'BUY' ? 'badge-positive' : recAction === 'SELL' ? 'badge-negative' : 'badge-neutral'}`;
        }
      } else {
        if (wRecVal) wRecVal.textContent = 'HOLD';
        if (wRecBadge) wRecBadge.textContent = 'Evaluating…';
      }

      // 9. Correlation
      const wCorrVal = document.getElementById('w-corr-value');
      const wCorrSub = document.getElementById('w-corr-sub');
      const wCorrBadge = document.getElementById('w-corr-badge');
      const corrCache = window.SentimentData?.CORRELATION_DATA?.[ticker];
      if (corrCache && corrCache.pearson_r != null) {
        const r = corrCache.pearson_r;
        const sign = r > 0 ? '+' : '';
        if (wCorrVal) {
          wCorrVal.textContent = `${sign}${r.toFixed(2)}`;
          wCorrVal.style.color = r > 0.3 ? 'var(--color-bullish)' : r < -0.3 ? 'var(--color-bearish)' : 'var(--color-neutral)';
        }
        if (wCorrSub) wCorrSub.textContent = `R² = ${(corrCache.r_squared || 0).toFixed(2)}`;
        if (wCorrBadge) {
          const sig = corrCache.explanation?.signal_classification || 'Neutral';
          wCorrBadge.textContent = sig;
          wCorrBadge.className = `widget-badge ${r > 0.3 ? 'badge-positive' : r < -0.3 ? 'badge-negative' : 'badge-neutral'}`;
        }
      } else {
        if (wCorrVal) wCorrVal.textContent = '—';
        if (wCorrBadge) wCorrBadge.textContent = 'Calculating…';
      }

      // 10. Technical Indicators
      const wTechVal = document.getElementById('w-tech-value');
      const wTechSub = document.getElementById('w-tech-sub');
      const wTechBadge = document.getElementById('w-tech-badge');
      const indData = window.SentimentData?.INDICATORS?.[ticker];
      if (indData && indData.rsi_14 != null) {
        const rsiVal = indData.rsi_14.toFixed(1);
        const macdHist = indData.macd?.histogram;
        const isMacdBull = macdHist >= 0;
        if (wTechVal) wTechVal.textContent = `RSI ${rsiVal}`;
        if (wTechSub) wTechSub.textContent = `MACD ${isMacdBull ? 'Bullish' : 'Bearish'} · EMA ${indData.ema_20 ? '$' + indData.ema_20.toFixed(1) : '—'}`;
        if (wTechBadge) {
          const rsiZone = indData.rsi_14 >= 70 ? 'Overbought' : indData.rsi_14 <= 30 ? 'Oversold' : 'Neutral';
          wTechBadge.textContent = rsiZone;
          wTechBadge.className = `widget-badge ${rsiZone === 'Neutral' ? 'badge-neutral' : rsiZone === 'Overbought' ? 'badge-negative' : 'badge-positive'}`;
        }
      } else {
        if (wTechVal) wTechVal.textContent = '—';
        if (wTechBadge) wTechBadge.textContent = 'TA-Lib';
      }

      // 11. Confidence
      const wConfVal = document.getElementById('w-confidence-value');
      const wConfSub = document.getElementById('w-confidence-sub');
      const wConfBadge = document.getElementById('w-confidence-badge');
      if (summary) {
        const cPct = Math.round((summary.confidence || 0.8) * 100);
        if (wConfVal) wConfVal.textContent = `${cPct}%`;
        if (wConfSub) wConfSub.textContent = `NLP & TA Signal Fit`;
        if (wConfBadge) {
          wConfBadge.textContent = cPct >= 70 ? 'High' : cPct >= 50 ? 'Medium' : 'Low';
          wConfBadge.className = `widget-badge ${cPct >= 70 ? 'badge-positive' : cPct >= 50 ? 'badge-neutral' : 'badge-negative'}`;
        }
      }

      // 12. Recent News
      const wNewsHeadline = document.getElementById('w-news-headline');
      const wNewsSource = document.getElementById('w-news-source');
      const wNewsTag = document.getElementById('w-news-tag');
      const articles = window.SentimentData?.ARTICLES?.[ticker] || window.SentimentData?.ALL_ARTICLES || [];
      if (articles && articles.length > 0) {
        const topArticle = articles[0];
        if (wNewsHeadline) wNewsHeadline.textContent = topArticle.headline || topArticle.title || 'Latest stock news article';
        if (wNewsSource) wNewsSource.textContent = topArticle.source || 'Finnhub News';
        if (wNewsTag) {
          const sent = topArticle.sentiment || 'neutral';
          wNewsTag.textContent = sent.toUpperCase();
          wNewsTag.className = `widget-badge ${sent === 'positive' ? 'badge-positive' : sent === 'negative' ? 'badge-negative' : 'badge-neutral'}`;
        }
      } else if (wNewsHeadline) {
        wNewsHeadline.textContent = 'No recent news articles loaded yet.';
      }
    },






    /* ----------------------------------------------------------
       Theme management
    ---------------------------------------------------------- */
    applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('sentistock-theme', theme);
      this.state.theme = theme;
      this.updateThemeIcon(theme);
    },

    toggleTheme() {
      const next = this.state.theme === 'dark' ? 'light' : 'dark';
      this.applyTheme(next);

      // Refresh charts with new theme colors
      setTimeout(() => {
        window.Charts.refreshAll();
        window.PriceChart.updateTheme();
        if (window.Indicators) window.Indicators.refreshAll();

        // Re-render components that depend on theme colors
        this.renderMarketStrip();
      }, 300);
    },

    updateThemeIcon(theme) {
      const toggle = document.getElementById('theme-toggle');
      if (!toggle) return;
      if (theme === 'dark') {
        toggle.classList.remove('is-light');
        toggle.classList.add('is-dark');
      } else {
        toggle.classList.remove('is-dark');
        toggle.classList.add('is-light');
      }
    },

    /* ----------------------------------------------------------
       Inject SVG icons into nav elements
    ---------------------------------------------------------- */
    injectNavIcons() {
      const searchIcon = document.querySelector('.search-icon');
      if (searchIcon) searchIcon.innerHTML = window.Utils.createSVGIcon('search');

      const sunIcon = document.querySelector('.theme-icon-sun');
      if (sunIcon) sunIcon.innerHTML = window.Utils.createSVGIcon('sun');

      const moonIcon = document.querySelector('.theme-icon-moon');
      if (moonIcon) moonIcon.innerHTML = window.Utils.createSVGIcon('moon');
    },

    /* ----------------------------------------------------------
       Event binding
    ---------------------------------------------------------- */
    bindEvents() {
      // Sticky navigation on scroll
      const topNav = document.querySelector('.top-nav');
      if (topNav) {
        const handleScroll = () => {
          if (window.scrollY > 80) {
            topNav.classList.add('sticky');
          } else {
            topNav.classList.remove('sticky');
          }
        };
        window.addEventListener('scroll', handleScroll);
        handleScroll(); // initial call
      }

      // Hero buttons smooth scroll
      const exploreBtn = document.getElementById('hero-explore-btn');
      const scrollHint = document.getElementById('hero-scroll-hint');
      const mainContent = document.getElementById('main-content');

      const scrollToMain = (e) => {
        e?.preventDefault();
        mainContent?.scrollIntoView({ behavior: 'smooth' });
      };

      if (exploreBtn) exploreBtn.addEventListener('click', scrollToMain);
      if (scrollHint) scrollHint.addEventListener('click', scrollToMain);

      const insightsBtn = document.getElementById('hero-insights-btn');
      if (insightsBtn) {
        insightsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const newsSection = document.querySelector('section[aria-label="News sentiment analysis"]');
          newsSection?.scrollIntoView({ behavior: 'smooth' });
        });
      }

      // Theme toggle
      const themeBtn = document.getElementById('theme-toggle');
      if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

      // Download Report (PDF) — pulls quote + indicators + news +
      // AI brief for the current ticker from GET /api/report/{symbol}
      // and saves it as a file.
      const downloadReportBtn = document.getElementById('download-report-btn');
      if (downloadReportBtn) {
        downloadReportBtn.addEventListener('click', () => this.downloadReport());
      }

      // Time range selector
      document.querySelectorAll('.time-range-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          this.state.currentRange = parseInt(e.target.dataset.range, 10);
          this.onRangeChange();
        });
      });

      // Stock search
      const searchInput = document.getElementById('stock-search');
      if (searchInput) {
        searchInput.addEventListener('input', window.Utils.debounce((e) => {
          this.onSearch(e.target.value.trim());
        }, 250));

        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = searchInput.value.trim().toUpperCase();
            if (val) {
              this.selectTicker(val, val);
            }
          }
        });

        // Keyboard shortcut: / to focus search
        document.addEventListener('keydown', (e) => {
          if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
          }
          if (e.key === 'Escape') {
            searchInput.blur();
            searchInput.value = '';
          }
        });
      }

      // Price ticker selector
      const priceSelect = document.getElementById('price-ticker-select');
      if (priceSelect) {
        priceSelect.addEventListener('change', (e) => {
          this.state.currentTicker = e.target.value;
          this.onTickerChange();
        });
      }

      // Trend ticker selector
      const trendSelect = document.getElementById('trend-ticker-select');
      if (trendSelect) {
        trendSelect.addEventListener('change', async (e) => {
          const ticker = e.target.value;

          // The dropdown lists every ticker in STOCK_TICKERS, but
          // SENTIMENT_DATA[ticker] is only populated once that ticker has
          // actually been loaded via LiveData.loadTicker() (e.g. by being
          // selected as the main price chart ticker). Picking a ticker
          // here that was never loaded left trendData as [] and rendered
          // a blank chart. Fetch it on demand if it's missing.
          if (!window.SentimentData.SENTIMENT_DATA[ticker]) {
            trendSelect.disabled = true;
            window.Charts.showLoading('sentiment-trend', `Loading ${ticker} sentiment…`);
            try {
              await window.LiveData.loadTicker(ticker);
            } catch (err) {
              console.warn('[App] Failed to load sentiment for trend ticker:', ticker, err);
            } finally {
              trendSelect.disabled = false;
              window.Charts.hideLoading('sentiment-trend');
            }
          }

          this.renderSentimentTrend(ticker);
        });
      }

      // News filter
      const newsFilter = document.getElementById('news-filter');
      if (newsFilter) {
        newsFilter.addEventListener('change', (e) => {
          this.state.newsFilter = e.target.value;
          this.renderNewsFeed();
        });
      }

      // Correlation rolling window selector
      const windowSelect = document.getElementById('correlation-window-select');
      if (windowSelect) {
        windowSelect.addEventListener('change', (e) => {
          const windowSize = parseInt(e.target.value, 10);
          this.renderCorrelation(this.state.currentTicker, windowSize);
        });
      }

      // Click outside search wrapper to close autocomplete results
      document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.search-wrapper');
        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer && wrapper && !wrapper.contains(e.target)) {
          resultsContainer.style.display = 'none';
        }
      });
    },

    /* ----------------------------------------------------------
       Populate dropdowns
    ---------------------------------------------------------- */
    populateSelectors() {
      const data = window.SentimentData;
      const tickers = data.STOCK_TICKERS;

      // Price ticker
      const priceSelect = document.getElementById('price-ticker-select');
      if (priceSelect) {
        priceSelect.innerHTML = tickers.map(t =>
          `<option value="${t.ticker}" ${t.ticker === this.state.currentTicker ? 'selected' : ''}>${t.ticker} — ${t.name}</option>`
        ).join('');
      }

      // Trend ticker — same ticker list as the price selector. No more
      // "Overall Market" option; see renderSentimentTrend() for why that
      // cross-ticker average didn't actually work once the app moved to
      // loading one real ticker at a time instead of mock data for all 10.
      const trendSelect = document.getElementById('trend-ticker-select');
      if (trendSelect) {
        trendSelect.innerHTML = tickers.map(t =>
          `<option value="${t.ticker}" ${t.ticker === this.state.currentTicker ? 'selected' : ''}>${t.ticker} — ${t.name}</option>`
        ).join('');
      }

    },

    /* ----------------------------------------------------------
       Market strip (indices)
       Finnhub's free tier has no direct S&P/NASDAQ/Dow
       endpoint, so this uses live /quote data for SPY/QQQ/DIA
       as real-price proxies. No sentiment/sparkline here since
       Finnhub doesn't provide per-index sentiment.
    ---------------------------------------------------------- */
    renderMarketStrip() {
      const quotes = window.LiveData && window.LiveData._indicesCache;
      if (!quotes) return;

      quotes.forEach(idx => {
        const valueEl = document.getElementById(`${idx.id}-value`);
        const changeEl = document.getElementById(`${idx.id}-change`);
        const sentimentEl = document.getElementById(`${idx.id}-sentiment`);
        const nameEl = document.querySelector(`#index-${idx.id} .index-name`);

        if (nameEl) nameEl.textContent = idx.label;
        if (valueEl) valueEl.textContent = idx.price != null ? window.Utils.formatNumber(idx.price, 2) : '—';
        if (changeEl) {
          if (idx.changePct != null) {
            const isPositive = idx.changePct >= 0;
            changeEl.textContent = window.Utils.formatPercent(idx.changePct);
            changeEl.className = `index-change numeric ${isPositive ? 'positive' : 'negative'}`;
          } else {
            changeEl.textContent = '—';
          }
        }
        // No live per-index sentiment source — hide that badge rather than fake it
        if (sentimentEl) sentimentEl.style.display = 'none';
      });
    },

    /* ----------------------------------------------------------
       Primary dashboard (gauge + trend + stats)
    ---------------------------------------------------------- */
    renderDashboard() {
      const data = window.SentimentData;
      const engine = window.SentimentEngine;
      if (!data || !engine) return;

      const summary = engine.getDashboardSummary(data, this.state.currentTicker);

      // Sentiment gauge
      window.Charts.renderSentimentGauge('sentiment-gauge', summary.overallSentiment);

      // Gauge label
      const gaugeLabel = document.getElementById('gauge-label');
      const gaugeSublabel = document.getElementById('gauge-sublabel');
      const gaugeConfidence = document.getElementById('gauge-confidence');
      if (gaugeLabel) gaugeLabel.textContent = summary.marketMood;
      if (gaugeSublabel) gaugeSublabel.textContent = `Based on ${window.Utils.formatCompact(summary.volume)} sources`;
      if (gaugeConfidence) {
        gaugeConfidence.textContent = `${Math.round(summary.confidence * 100)}% confidence`;
        gaugeConfidence.className = `badge ${summary.confidence > 0.7 ? 'badge-positive' : summary.confidence > 0.4 ? 'badge-neutral' : 'badge-negative'}`;
      }

      // Sentiment trend — defaults to whichever ticker the rest of the
      // dashboard is showing, not a cross-ticker "market" average (see
      // renderSentimentTrend() for why that concept doesn't work anymore).
      this.renderSentimentTrend(this.state.currentTicker);

      // Quick stats
      const bullishScore = document.getElementById('top-bullish-score');
      const bullishTicker = document.getElementById('top-bullish-ticker');
      const bearishScore = document.getElementById('top-bearish-score');
      const bearishTicker = document.getElementById('top-bearish-ticker');
      const volumeEl = document.getElementById('sentiment-volume');
      const volumeChange = document.getElementById('volume-change');
      const confidenceEl = document.getElementById('model-confidence');

      const truncate = (str, len) => (str && str.length > len ? str.slice(0, len - 1).trimEnd() + '…' : str);

      if (bullishScore) bullishScore.textContent = window.Utils.formatSentimentScore(summary.topBullish.score);
      if (bullishTicker) {
        bullishTicker.textContent = truncate(summary.topBullish.headline, 46);
        bullishTicker.title = summary.topBullish.headline || '';
      }
      if (bearishScore) bearishScore.textContent = window.Utils.formatSentimentScore(summary.topBearish.score);
      if (bearishTicker) {
        bearishTicker.textContent = truncate(summary.topBearish.headline, 46);
        bearishTicker.title = summary.topBearish.headline || '';
      }
      if (volumeEl) volumeEl.textContent = window.Utils.formatCompact(summary.volume);
      if (volumeChange) {
        // There used to be a hardcoded "+12.3%" here — a leftover from
        // the old mock-data version with no real data behind it (the
        // backend's /api/news response has no period-over-period
        // mentions comparison to compute this from). Hiding it rather
        // than showing a fabricated trend, matching the pattern already
        // used for the market-strip sentiment badges below.
        volumeChange.style.display = 'none';
      }
      if (confidenceEl) {
        confidenceEl.textContent = window.Utils.formatPercent(summary.confidence * 100, 1, false);
        // "Model Confidence" now reflects real FinBERT prediction
        // confidence when it's available (summary.confidenceIsReal).
        // While that hasn't loaded yet (or a ticker somehow has none),
        // fall back to the old coverage-volume heuristic — but say so,
        // rather than implying it's model output.
        const confidenceCaption = document.getElementById('model-confidence-caption');
        if (confidenceCaption) {
          confidenceCaption.textContent = summary.confidenceIsReal
            ? 'VADER + Finance NLP'
            : 'Estimated from coverage volume';
        }
      }
    },

    /* ----------------------------------------------------------
       AI market brief (Groq) — fetched separately from renderDashboard
       so a slow or unconfigured Groq key never blocks the rest of the
       page. Fire-and-forget: the card shows its own loading/error state.
    ---------------------------------------------------------- */
    renderAIBrief(ticker) {
      const textEl = document.getElementById('ai-brief-text');
      const badgeEl = document.getElementById('ai-brief-model-badge');
      if (!textEl || !window.LiveData) return;

      textEl.textContent = `Generating brief for ${ticker}…`;
      textEl.className = 'ai-brief-text is-loading';
      if (badgeEl) badgeEl.textContent = '—';

      window.LiveData.fetchInsight(ticker)
        .then(insight => {
          // Ticker may have changed again while this request was in
          // flight — don't overwrite a newer brief with a stale one.
          if (this.state.currentTicker !== ticker) return;
          textEl.textContent = insight.brief;
          textEl.className = 'ai-brief-text';
          if (badgeEl) badgeEl.textContent = insight.model || 'groq';
        })
        .catch(err => {
          if (this.state.currentTicker !== ticker) return;
          console.warn('[App] AI brief failed:', err.message);
          textEl.textContent = err.message.includes('GROQ_API_KEY')
            ? 'AI market brief isn\'t configured on this backend yet — add a GROQ_API_KEY in backend/.env to enable it.'
            : `AI market brief unavailable right now: ${err.message}`;
          textEl.className = 'ai-brief-text is-error';
          if (badgeEl) badgeEl.textContent = 'offline';
        });
    },

    /* ----------------------------------------------------------
       Earnings Call Transcript rendering
    ---------------------------------------------------------- */
    renderEarningsTranscript(ticker) {
      const data = window.SentimentData;
      if (!data || !data.TRANSCRIPT_DATA) return;

      const transcript = data.TRANSCRIPT_DATA[ticker];
      
      const qtrEl = document.getElementById('earnings-meta-quarter');
      const yrEl = document.getElementById('earnings-meta-year');
      const dtEl = document.getElementById('earnings-meta-date');
      const sentEl = document.getElementById('earnings-meta-sentiment');
      const confEl = document.getElementById('earnings-meta-confidence');
      
      const pctPosEl = document.getElementById('earnings-pct-positive');
      const pctNeuEl = document.getElementById('earnings-pct-neutral');
      const pctNegEl = document.getElementById('earnings-pct-negative');
      const barPosEl = document.getElementById('earnings-bar-positive');
      const barNeuEl = document.getElementById('earnings-bar-neutral');
      const barNegEl = document.getElementById('earnings-bar-negative');
      
      const highlightsEl = document.getElementById('earnings-highlights');

      if (!transcript) {
        // Reset to empty state
        if (qtrEl) qtrEl.textContent = '—';
        if (yrEl) yrEl.textContent = '—';
        if (dtEl) dtEl.textContent = '—';
        if (sentEl) {
          sentEl.textContent = '—';
          sentEl.className = 'badge';
        }
        if (confEl) confEl.textContent = '—';
        
        if (pctPosEl) pctPosEl.textContent = '0%';
        if (pctNeuEl) pctNeuEl.textContent = '0%';
        if (pctNegEl) pctNegEl.textContent = '0%';
        if (barPosEl) barPosEl.style.width = '0%';
        if (barNeuEl) barNeuEl.style.width = '0%';
        if (barNegEl) barNegEl.style.width = '0%';

        window.Charts.renderEarningsTimeline('earnings-timeline', []);
        
        if (highlightsEl) {
          highlightsEl.innerHTML = `
            <div class="empty-state">
              <p class="empty-state-message">No earnings transcript data available for ${ticker}.</p>
            </div>
          `;
        }
        return;
      }

      // Populate meta fields
      if (qtrEl) qtrEl.textContent = transcript.quarter || '—';
      if (yrEl) yrEl.textContent = transcript.year || '—';
      if (dtEl) dtEl.textContent = transcript.date ? window.Utils.formatDate(transcript.date) : '—';
      if (sentEl) {
        const mood = transcript.sentiment_label || 'neutral';
        const moodCap = mood.charAt(0).toUpperCase() + mood.slice(1);
        sentEl.textContent = moodCap === 'Positive' ? 'Bullish' : moodCap === 'Negative' ? 'Bearish' : 'Neutral';
        sentEl.className = `badge ${window.Utils.getSentimentBadgeClass(mood)}`;
      }
      if (confEl) confEl.textContent = transcript.avg_confidence != null ? `${Math.round(transcript.avg_confidence * 100)}%` : '—';

      // Populate percentage breakdown & bars
      if (pctPosEl) pctPosEl.textContent = `${transcript.positive_pct.toFixed(1)}%`;
      if (pctNeuEl) pctNeuEl.textContent = `${transcript.neutral_pct.toFixed(1)}%`;
      if (pctNegEl) pctNegEl.textContent = `${transcript.negative_pct.toFixed(1)}%`;
      
      if (barPosEl) barPosEl.style.width = `${transcript.positive_pct}%`;
      if (barNeuEl) barNeuEl.style.width = `${transcript.neutral_pct}%`;
      if (barNegEl) barNegEl.style.width = `${transcript.negative_pct}%`;

      // Render chart
      const sections = (transcript.chunks || []).map((c, i) => ({
        name: `${i + 1}. ${c.speaker}`,
        sentiment: c.sentiment_score,
      }));
      window.Charts.renderEarningsTimeline('earnings-timeline', sections);

      // Render phrases highlights
      if (highlightsEl) {
        if (transcript.chunks && transcript.chunks.length > 0) {
          highlightsEl.innerHTML = transcript.chunks.map(c => {
            const badgeClass = window.Utils.getSentimentBadgeClass(c.sentiment_label);
            const sign = c.sentiment_score > 0 ? '+' : '';
            return `
              <div class="earnings-sentence sentence-${c.sentiment_label}">
                <div style="display: flex; flex-direction: column; gap: 4px; width: 100%;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600; font-size: var(--text-xs); color: var(--text-primary);">${c.speaker}</span>
                    <span class="badge ${badgeClass}" style="font-size: 10px; padding: 1px 4px;">
                      ${sign}${c.sentiment_score.toFixed(2)}
                    </span>
                  </div>
                  <p class="phrase-text" style="font-size: var(--text-sm); line-height: 1.5; color: var(--text-secondary); margin: 0;">"${c.text}"</p>
                </div>
              </div>
            `;
          }).join('');
        } else {
          highlightsEl.innerHTML = `
            <div class="empty-state">
              <p class="empty-state-message">No transcript content available.</p>
            </div>
          `;
        }
      }
    },

    /* ----------------------------------------------------------
       Download report (PDF) — GET /api/report/{symbol}
    ---------------------------------------------------------- */
    downloadReport() {
      const btn = document.getElementById('download-report-btn');
      const label = document.getElementById('download-report-label');
      if (!btn || !window.LiveData) return;

      if (!window.LiveData.isConnected()) {
        if (label) label.textContent = 'Connect backend first';
        btn.classList.add('is-error');
        setTimeout(() => {
          if (label) label.textContent = 'Download Report';
          btn.classList.remove('is-error');
        }, 2500);
        return;
      }

      const ticker = this.state.currentTicker;
      btn.disabled = true;
      if (label) label.textContent = 'Generating…';

      window.LiveData.fetchReportPdf(ticker)
        .then(({ blob, filename }) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);

          if (label) label.textContent = 'Download Report';
        })
        .catch(err => {
          console.warn('[App] report download failed:', err.message);
          if (label) label.textContent = 'Report failed';
          btn.classList.add('is-error');
          setTimeout(() => {
            if (label) label.textContent = 'Download Report';
            btn.classList.remove('is-error');
          }, 2500);
        })
        .finally(() => {
          btn.disabled = false;
        });
    },

    /* ----------------------------------------------------------
       Sentiment trend chart
    ---------------------------------------------------------- */
    renderSentimentTrend(ticker) {
      const data = window.SentimentData;
      if (!data) return;

      // Previously this also supported ticker === 'MARKET', averaging
      // sentiment across every ticker in SENTIMENT_DATA by index position.
      // That assumed every ticker had an aligned, same-length daily
      // sentiment array — true only in the old mock-data version, which
      // preloaded all 10 tickers with matching date ranges. Now that the
      // app only loads the ticker(s) actually viewed, that average was
      // silently wrong (comparing whatever 1-2 tickers happened to be
      // cached this session, misaligned by array index rather than date)
      // and often just rendered a near-empty chart. Showing one real
      // ticker's real trend is both simpler and actually correct.
      const trendData = data.SENTIMENT_DATA[ticker] || [];

      const filtered = window.Utils.filterByDateRange(trendData, this.state.currentRange);
      window.Charts.renderSentimentTrend('sentiment-trend', filtered, this.state.currentRange);
    },

    /* ----------------------------------------------------------
       News feed
    ---------------------------------------------------------- */
    renderNewsFeed() {
      const data = window.SentimentData;
      if (!data || !data.NEWS_ARTICLES) return;

      const container = document.getElementById('news-feed');
      if (!container) return;

      let articles = [...data.NEWS_ARTICLES];

      // Filter
      if (this.state.newsFilter !== 'all') {
        articles = articles.filter(a => a.sentiment === this.state.newsFilter);
      }

      // Sort by date (newest first)
      articles.sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

      container.innerHTML = articles.map(article => `
        <article class="news-item" role="article" tabindex="0">
          <div class="news-top">
            <h3 class="news-headline">${article.headline}</h3>
            <span class="badge ${window.Utils.getSentimentBadgeClass(article.sentiment)}">
              ${window.Utils.formatSentimentScore(article.score)}
            </span>
          </div>
          <p class="news-summary">${article.summary}</p>
          <div class="news-meta">
            <span class="news-source">${article.source}</span>
            <span class="news-dot" aria-hidden="true">·</span>
            <span class="news-time">${window.Utils.formatRelativeTime(article.date)}</span>
            <span class="news-dot" aria-hidden="true">·</span>
            <span class="news-category">${article.category}</span>
            <div class="news-tickers">
              ${article.tickers.map(t => `<span class="ticker-tag">${t}</span>`).join('')}
            </div>
          </div>
          <div class="news-sentiment-bar">
            <div class="progress-bar">
              <div class="progress-fill ${article.sentiment === 'positive' ? 'fill-bullish' : article.sentiment === 'negative' ? 'fill-bearish' : 'fill-neutral'}"
                   style="width: ${Math.abs(article.score) * 100}%"></div>
            </div>
          </div>
        </article>
      `).join('');

      // Render distribution charts
      const dist = window.SentimentEngine.getSentimentDistribution(data.NEWS_ARTICLES);
      window.Charts.renderSentimentDistribution('sentiment-distribution', dist);

      // Distribution stats
      const distStats = document.getElementById('distribution-stats');
      if (distStats) {
        const pct = (val) => dist.total > 0 ? Math.round((val / dist.total) * 100) : 0;
        distStats.innerHTML = `
          <div class="dist-stat">
            <span class="dist-dot bullish" aria-hidden="true"></span>
            <span class="dist-label">Positive</span>
            <span class="dist-value numeric">${dist.positive}</span>
            <span class="dist-pct numeric">${pct(dist.positive)}%</span>
          </div>
          <div class="dist-stat">
            <span class="dist-dot bearish" aria-hidden="true"></span>
            <span class="dist-label">Negative</span>
            <span class="dist-value numeric">${dist.negative}</span>
            <span class="dist-pct numeric">${pct(dist.negative)}%</span>
          </div>
          <div class="dist-stat">
            <span class="dist-dot neutral" aria-hidden="true"></span>
            <span class="dist-label">Neutral</span>
            <span class="dist-value numeric">${dist.neutral}</span>
            <span class="dist-pct numeric">${pct(dist.neutral)}%</span>
          </div>
        `;
      }

      // Source breakdown donut — real publisher counts from the live feed
      // (Finnhub news comes from wire services, not social/earnings
      // buckets, so this groups by actual outlet instead of a fabricated
      // news/social/earnings split).
      const bySource = {};
      data.NEWS_ARTICLES.forEach(a => {
        const key = a.source || 'Other';
        bySource[key] = (bySource[key] || 0) + 1;
      });
      window.Charts.renderSourceBreakdown('source-breakdown', bySource);
    },

    /* ----------------------------------------------------------
       Correlation analysis
    ---------------------------------------------------------- */
    async renderCorrelation(ticker = this.state.currentTicker, windowSize = null) {
      const data = window.SentimentData;
      if (!data) return;

      const windowSelect = document.getElementById('correlation-window-select');
      const rollingWindow = windowSize || (windowSelect ? parseInt(windowSelect.value, 10) : 7);

      let corrData = data.CORRELATION_DATA && data.CORRELATION_DATA[ticker];

      // Fetch from backend if window size doesn't match cached window size or missing
      if (!corrData || (windowSize && corrData.rolling_window !== windowSize)) {
        try {
          if (window.LiveData && window.LiveData.isConnected()) {
            corrData = await window.LiveData.fetchCorrelation(ticker, '1mo', rollingWindow);
            data.CORRELATION_DATA = data.CORRELATION_DATA || {};
            data.CORRELATION_DATA[ticker] = corrData;
          }
        } catch (err) {
          console.warn('[App] Correlation fetch failed:', err);
        }
      }

      const pearsonValEl = document.getElementById('corr-pearson-value');
      const pearsonBadgeEl = document.getElementById('corr-pearson-badge');
      const rSquaredValEl = document.getElementById('corr-rsquared-value');
      const signalClassEl = document.getElementById('corr-signal-class');
      const sampleSizeEl = document.getElementById('corr-sample-size');
      const tickerBadgeEl = document.getElementById('corr-trend-ticker-badge');

      const summaryEl = document.getElementById('corr-explain-summary');
      const practicalEl = document.getElementById('corr-explain-practical');
      const rollingEl = document.getElementById('corr-explain-rolling');
      const takeawayEl = document.getElementById('corr-explain-takeaway');

      if (!corrData || !corrData.sample_size) {
        if (pearsonValEl) pearsonValEl.textContent = '—';
        if (pearsonBadgeEl) pearsonBadgeEl.textContent = 'No Data';
        if (rSquaredValEl) rSquaredValEl.textContent = '—';
        if (signalClassEl) signalClassEl.textContent = '—';
        if (sampleSizeEl) sampleSizeEl.textContent = '0 Trading Days';
        if (summaryEl) summaryEl.textContent = `No historical correlation data available for ${ticker}.`;
        if (practicalEl) practicalEl.textContent = 'Insufficient records in database.';
        if (rollingEl) rollingEl.textContent = 'N/A';
        if (takeawayEl) takeawayEl.textContent = 'N/A';

        window.Charts.renderCombinedCorrelationTrend('correlation-combined-trend', []);
        window.Charts.renderCorrelation('correlation-scatter', [], []);
        return;
      }

      // Populate Metric Cards
      const r = corrData.pearson_r;
      const signStr = r > 0 ? '+' : '';
      if (pearsonValEl) {
        pearsonValEl.textContent = `${signStr}${r.toFixed(3)}`;
        pearsonValEl.className = `metric-value numeric ${r >= 0.2 ? 'positive' : r <= -0.2 ? 'negative' : ''}`;
      }

      const explanation = corrData.explanation || {};
      if (pearsonBadgeEl) pearsonBadgeEl.textContent = explanation.strength_direction || 'Analyzing…';
      if (rSquaredValEl) rSquaredValEl.textContent = `${(corrData.r_squared * 100).toFixed(1)}%`;
      if (signalClassEl) signalClassEl.textContent = explanation.signal_classification || '—';
      if (sampleSizeEl) sampleSizeEl.textContent = `${corrData.sample_size} Trading Days`;
      if (tickerBadgeEl) tickerBadgeEl.textContent = ticker;

      // Populate Plain English Explanation
      if (summaryEl) summaryEl.textContent = explanation.summary || '';
      if (practicalEl) practicalEl.textContent = explanation.practical_meaning || '';
      if (rollingEl) rollingEl.textContent = explanation.rolling_trend || '';
      if (takeawayEl) takeawayEl.textContent = explanation.investor_takeaway || '';

      // Render Combined Trend Graph (Dual Axis: Price + Sentiment + Rolling Correlation)
      window.Charts.renderCombinedCorrelationTrend('correlation-combined-trend', corrData.combined_trend || []);

      // Render Scatter Plot with Linear Regression Line
      const scatterPts = corrData.scatter_points || [];
      const sScores = scatterPts.map(p => p.sentiment);
      const pPrices = scatterPts.map(p => p.closing_price);
      const pDates = scatterPts.map(p => p.date);

      window.Charts.renderCorrelation('correlation-scatter', sScores, pPrices, {
        dates: pDates,
        slope: corrData.slope,
        intercept: corrData.intercept,
        r: corrData.pearson_r,
      });

      // Legacy fallback stats elements
      const legacyVal = document.getElementById('correlation-value');
      const legacyLbl = document.getElementById('correlation-label');
      if (legacyVal) legacyVal.textContent = `${signStr}${r.toFixed(3)}`;
      if (legacyLbl) legacyLbl.textContent = explanation.strength_direction || '';
    },

    /* ----------------------------------------------------------
       Word cloud
    ---------------------------------------------------------- */
    renderWordCloud() {
      const data = window.SentimentData;
      if (!data || !data.NEWS_ARTICLES) return;

      // getWordFrequency expects { title, summary, sentiment:number } —
      // our live articles store the label in `sentiment` and the numeric
      // score separately in `score`, so remap just for this call.
      const wordFreqInput = data.NEWS_ARTICLES.map(a => ({
        title: a.headline,
        summary: a.summary,
        sentiment: a.score,
      }));
      const words = window.SentimentEngine.getWordFrequency(wordFreqInput, 25);
      const container = document.getElementById('word-cloud');
      if (!container) return;

      const maxCount = Math.max(...words.map(w => w.count));
      const minCount = Math.min(...words.map(w => w.count));
      const range = maxCount - minCount || 1;

      container.innerHTML = words.map(w => {
        const size = 0.75 + ((w.count - minCount) / range) * 1.5; // 0.75rem to 2.25rem
        const color = w.sentiment > 0.1 ? 'var(--color-bullish)' :
                      w.sentiment < -0.1 ? 'var(--color-bearish)' : 'var(--text-secondary)';
        return `<span class="word-cloud-tag" style="font-size: ${size}rem; color: ${color};" title="${w.word}: ${w.count} mentions">${w.word}</span>`;
      }).join(' ');
    },

    /* ----------------------------------------------------------
       Price chart initialization
    ---------------------------------------------------------- */
    initPriceChart() {
      window.PriceChart.init('price-chart-container', this.state.currentTicker);
    },

    /* ----------------------------------------------------------
       Event handlers for state changes
    ---------------------------------------------------------- */
    onRangeChange() {
      this.renderSentimentTrend(document.getElementById('trend-ticker-select')?.value || this.state.currentTicker);
      window.PriceChart.updateTimeRange(this.state.currentRange);
    },

    onTickerChange() {
      if (window.LiveData && window.LiveData.isConnected()) {
        const ticker = this.state.currentTicker;
        const btn = document.getElementById('live-data-btn');
        if (btn) btn.innerHTML = '<span class="live-data-dot live"></span> Loading ' + ticker + '…';

        window.Charts.showLoading('price-chart-container', `Loading ${ticker}…`);
        window.Charts.showLoading('rsi-gauge-mount', 'Loading…');
        window.Charts.showLoading('macd-chart-mount', 'Loading…');
        window.Charts.showLoading('earnings-timeline', 'Loading…');

        window.LiveData.loadTicker(ticker)
          .then(() => {
            if (btn) btn.innerHTML = '<span class="live-data-dot live"></span> Live: ' + ticker;
            window.PriceChart.updateTicker(ticker);
            this.renderCorrelation();
            if (window.Indicators) window.Indicators.renderAll(ticker);
            this.renderAIBrief(ticker);
            this.renderEarningsTranscript(ticker);

            // BUG FIX: loadTicker() already overwrites
            // window.SentimentData.NEWS_ARTICLES with the new ticker's
            // real news (see LiveData._applyToStore), but nothing here
            // was telling the DOM to re-read it — renderNewsFeed(),
            // renderDashboard() (bullish/bearish headlines, mentions,
            // confidence), and renderWordCloud() all read NEWS_ARTICLES
            // but were never called again after the initial page load.
            // That's why switching tickers left the news feed, top
            // headlines, and word cloud stuck on whichever ticker
            // loaded first.
            this.renderNewsFeed();
            this.renderDashboard();
            this.renderWordCloud();
            this.renderRecommendation(ticker);
            this.renderRedditSentiment(ticker);
            this.renderMarketMoodIndex(ticker);
            this.renderHistoricalSentimentStorage(ticker);
            if (window.MLPrediction) window.MLPrediction.loadPrediction(ticker);
          })
          .catch(err => {
            console.warn('[LiveData] load failed, chart/correlation will show stale or empty data:', err.message);
            window.PriceChart.updateTicker(ticker);
            this.renderCorrelation();
          })
          .finally(() => {
            window.Charts.hideLoading('price-chart-container');
            window.Charts.hideLoading('rsi-gauge-mount');
            window.Charts.hideLoading('macd-chart-mount');
            window.Charts.hideLoading('earnings-timeline');
          });
        return;
      }
      window.PriceChart.updateTicker(this.state.currentTicker);
      this.renderCorrelation();
      this.renderRecommendation(this.state.currentTicker);
      this.renderRedditSentiment(this.state.currentTicker);
      this.renderMarketMoodIndex(this.state.currentTicker);
      this.renderHistoricalSentimentStorage(this.state.currentTicker);
      if (window.MLPrediction) window.MLPrediction.loadPrediction(this.state.currentTicker);
    },


    /* ----------------------------------------------------------
       Trade Recommendation rendering
    ---------------------------------------------------------- */
    renderRecommendation(ticker) {
      const data = window.SentimentData;
      if (!data) return;

      const rec = (data.RECOMMENDATION_DATA && data.RECOMMENDATION_DATA[ticker]) || null;

      const tickerBadge = document.getElementById('recommendation-ticker-badge');
      const recBadge = document.getElementById('recommendation-badge');
      const scoreLabel = document.getElementById('recommendation-score-label');
      const confVal = document.getElementById('recommendation-confidence-val');
      const confBar = document.getElementById('recommendation-confidence-bar');
      const confBadge = document.getElementById('recommendation-confidence-badge');
      const summaryText = document.getElementById('recommendation-summary-text');
      const grid = document.getElementById('recommendation-breakdown-grid');

      if (tickerBadge) tickerBadge.textContent = ticker;

      if (!rec) {
        if (recBadge) {
          recBadge.textContent = 'HOLD';
          recBadge.className = 'recommendation-badge badge-hold';
        }
        if (scoreLabel) scoreLabel.textContent = 'Composite Score: 0.00';
        if (confVal) confVal.textContent = '0%';
        if (confBar) confBar.style.width = '0%';
        if (confBadge) confBadge.textContent = 'Analyzing…';
        if (summaryText) summaryText.textContent = `Evaluating trade recommendation for ${ticker}…`;
        if (grid) grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Loading recommendation signals…</div>';
        return;
      }

      // Populate Hero Badge & Row
      const verdict = rec.recommendation || 'HOLD';
      if (recBadge) {
        recBadge.textContent = verdict;
        recBadge.className = `recommendation-badge ${verdict === 'BUY' ? 'badge-buy' : verdict === 'SELL' ? 'badge-sell' : 'badge-hold'}`;
      }

      const score = rec.score || 0;
      if (scoreLabel) scoreLabel.textContent = `Composite Score: ${score > 0 ? '+' : ''}${score.toFixed(2)} (-1.0 to +1.0)`;

      const conf = rec.confidence || 0;
      if (confVal) confVal.textContent = `${conf.toFixed(0)}%`;
      if (confBar) confBar.style.width = `${conf}%`;
      if (confBadge) confBadge.textContent = rec.confidence_label || 'Moderate Confidence';

      // Summary text
      if (summaryText) summaryText.textContent = rec.summary_reasoning || '';

      // Grid breakdown of 6 indicator signals
      if (grid && Array.isArray(rec.indicators_breakdown)) {
        grid.innerHTML = rec.indicators_breakdown.map(item => {
          const sig = item.signal || 'HOLD';
          const badgeClass = sig === 'BUY' ? 'badge-positive' : sig === 'SELL' ? 'badge-negative' : 'badge-neutral';
          return `
            <div class="recommendation-card-item">
              <div class="rec-item-header">
                <span class="rec-item-title">${item.indicator}</span>
                <span class="badge ${badgeClass}">${sig}</span>
              </div>
              <div class="rec-item-val">${item.value}</div>
              <div class="rec-item-reason">${item.reasoning}</div>
            </div>
          `;
        }).join('');
      }
    },


    /* ----------------------------------------------------------
       Market Mood Index (MMI) rendering
    ---------------------------------------------------------- */
    renderMarketMoodIndex(ticker) {
      const data = window.SentimentData;
      if (!data || !data.MMI_DATA) return;

      const mmi = data.MMI_DATA[ticker];

      const catBadge = document.getElementById('mmi-category-badge');
      const statusLabel = document.getElementById('mmi-status-label');
      const newsScoreEl = document.getElementById('mmi-news-score');
      const newsCapEl = document.getElementById('mmi-news-caption');
      const redditScoreEl = document.getElementById('mmi-reddit-score');
      const redditCapEl = document.getElementById('mmi-reddit-caption');
      const techScoreEl = document.getElementById('mmi-technical-score');
      const techCapEl = document.getElementById('mmi-technical-caption');

      if (!mmi) {
        window.Charts.renderMarketMoodGauge('mmi-gauge', 50, 'Neutral');
        if (catBadge) { catBadge.textContent = 'Neutral'; catBadge.className = 'badge badge-neutral'; }
        if (statusLabel) statusLabel.textContent = 'MMI Score: —';
        if (newsScoreEl) newsScoreEl.textContent = '—';
        if (redditScoreEl) redditScoreEl.textContent = '—';
        if (techScoreEl) techScoreEl.textContent = '—';
        return;
      }

      const score = mmi.mmi_score;
      const category = mmi.category;

      // Render Gauge Chart
      window.Charts.renderMarketMoodGauge('mmi-gauge', score, category);

      // Category Badge
      let badgeClass = 'badge-neutral';
      if (score < 20) badgeClass = 'badge-negative';
      else if (score < 40) badgeClass = 'badge-negative';
      else if (score >= 60) badgeClass = 'badge-positive';

      if (catBadge) {
        catBadge.textContent = category;
        catBadge.className = `badge ${badgeClass}`;
      }

      if (statusLabel) {
        statusLabel.textContent = `MMI Score: ${score.toFixed(1)} / 100 (${category})`;
      }

      if (newsScoreEl) newsScoreEl.textContent = `${mmi.news_score.toFixed(1)} / 100`;
      if (newsCapEl) newsCapEl.textContent = `News Sentiment: ${mmi.news_sentiment > 0 ? '+' : ''}${mmi.news_sentiment.toFixed(2)} (${mmi.news_count} articles)`;

      if (redditScoreEl) redditScoreEl.textContent = `${mmi.reddit_score.toFixed(1)} / 100`;
      if (redditCapEl) redditCapEl.textContent = `Reddit Sentiment: ${mmi.reddit_sentiment > 0 ? '+' : ''}${mmi.reddit_sentiment.toFixed(2)} (${mmi.reddit_count} posts)`;

      if (techScoreEl) techScoreEl.textContent = `${mmi.technical_score.toFixed(1)} / 100`;
      if (techCapEl && mmi.technical_details) {
        const details = mmi.technical_details;
        const rsiStr = details.rsi != null ? `RSI ${details.rsi}` : 'RSI —';
        const pctBStr = details.percent_b != null ? `%B ${details.percent_b.toFixed(0)}%` : '%B —';
        techCapEl.textContent = `${rsiStr} · ${pctBStr} · MA: ${details.ma_signal} · MACD: ${details.macd_signal}`;
      }
    },


    /* ----------------------------------------------------------
       Reddit sentiment (r/stocks, r/investing, r/wallstreetbets)
    ---------------------------------------------------------- */
    renderRedditSentiment(ticker) {
      try {
        const data = window.SentimentData;
        if (!data) return;

        const reddit = (data.REDDIT_DATA && data.REDDIT_DATA[ticker]) || null;
        const merged = (data.MERGED_SENTIMENT && data.MERGED_SENTIMENT[ticker]) || null;

        // Metric cards
        const avgSentElem = document.getElementById('reddit-avg-sentiment');
        const postsCountElem = document.getElementById('reddit-posts-count');
        const confElem = document.getElementById('reddit-confidence');
        const mergedScoreElem = document.getElementById('merged-sentiment-score');
        const mergedLabelElem = document.getElementById('merged-sentiment-label');
        const mergedIconElem = document.getElementById('merged-sentiment-icon');

        if (avgSentElem) {
          if (reddit) {
            const score = reddit.average_sentiment || 0;
            avgSentElem.textContent = window.Utils.formatSentimentScore(score);
            avgSentElem.className = 'metric-value numeric ' + (score > 0.05 ? 'positive' : score < -0.05 ? 'negative' : 'neutral');
          } else {
            avgSentElem.textContent = '—';
          }
        }

        if (postsCountElem) {
          postsCountElem.textContent = reddit ? (reddit.number_of_posts_analyzed || 0) : '—';
        }

        if (confElem) {
          confElem.textContent = reddit && reddit.confidence ? Math.round(reddit.confidence * 100) + '%' : '—';
        }

        if (mergedScoreElem && merged) {
          const mScore = merged.merged_sentiment || 0;
          mergedScoreElem.textContent = window.Utils.formatSentimentScore(mScore);
          mergedScoreElem.className = 'metric-value numeric ' + (mScore > 0.05 ? 'positive' : mScore < -0.05 ? 'negative' : 'neutral');
          if (mergedLabelElem) {
            mergedLabelElem.textContent = `Combined Signal (${merged.merged_label})`;
          }
          if (mergedIconElem) {
            mergedIconElem.className = `metric-icon ${mScore > 0.05 ? 'bullish' : mScore < -0.05 ? 'bearish' : 'volume'}`;
          }
        }

        // Render Trending Discussions feed
        const feedContainer = document.getElementById('reddit-feed');
        if (feedContainer) {
          if (reddit && Array.isArray(reddit.trending_discussions) && reddit.trending_discussions.length > 0) {
            feedContainer.innerHTML = reddit.trending_discussions.map(post => {
              const labelClass = post.sentiment_label === 'positive' ? 'badge-bullish' : post.sentiment_label === 'negative' ? 'badge-bearish' : 'badge-neutral';
              const bodyRaw = post.body || 'No post body available.';
              const bodySnippet = window.Utils.truncateText ? window.Utils.truncateText(bodyRaw, 180) : (bodyRaw.length > 180 ? bodyRaw.slice(0, 179) + '…' : bodyRaw);
              const confPct = post.confidence ? Math.round(post.confidence * 100) : 85;
              return `
                <article class="news-item" role="article" tabindex="0">
                  <div class="news-top">
                    <h3 class="news-headline"><a href="${post.url}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${post.title}</a></h3>
                    <span class="badge ${labelClass}">
                      ${window.Utils.formatSentimentScore(post.sentiment_score)}
                    </span>
                  </div>
                  <p class="news-summary">${bodySnippet}</p>
                  <div class="reddit-post-meta">
                    <span class="reddit-badge-sub">r/${post.subreddit}</span>
                    <span>·</span>
                    <span>u/${post.author}</span>
                    <span>·</span>
                    <span>👍 ${post.score || 0} upvotes</span>
                    <span>·</span>
                    <span>💬 ${post.num_comments || 0} comments</span>
                    <span>·</span>
                    <span>Confidence: ${confPct}%</span>
                  </div>
                </article>
              `;
            }).join('');
          } else {
            feedContainer.innerHTML = `<div class="empty-state"><p class="empty-state-message">No Reddit discussions found for ${ticker}.</p></div>`;
          }
        }

        // Render Subreddit Breakdown list
        const subListContainer = document.getElementById('subreddit-breakdown-list');
        if (subListContainer) {
          if (reddit && Array.isArray(reddit.subreddits_breakdown) && reddit.subreddits_breakdown.length > 0) {
            subListContainer.innerHTML = reddit.subreddits_breakdown.map(sub => {
              const sentClass = sub.average_sentiment > 0.05 ? 'badge-bullish' : sub.average_sentiment < -0.05 ? 'badge-bearish' : 'badge-neutral';
              return `
                <div class="subreddit-card-item">
                  <div>
                    <span class="subreddit-tag">${sub.subreddit}</span>
                    <span style="font-size: var(--text-xs); color: var(--text-muted); margin-left: 8px;">(${sub.count} posts)</span>
                  </div>
                  <span class="badge ${sentClass}">
                    ${window.Utils.formatSentimentScore(sub.average_sentiment)}
                  </span>
                </div>
              `;
            }).join('');
          } else {
            subListContainer.innerHTML = `<div class="empty-state"><p class="empty-state-message">No subreddit breakdown available.</p></div>`;
          }
        }

        // Render News vs Reddit Comparison chart
        const chartContainer = document.getElementById('sentiment-compare-chart');
        if (chartContainer && merged && window.Charts && typeof window.Charts.renderNewsVsRedditChart === 'function') {
          window.Charts.renderNewsVsRedditChart('sentiment-compare-chart', merged);
        }
      } catch (err) {
        console.error('[App] error in renderRedditSentiment:', err);
      }
    },

    /* ----------------------------------------------------------
       Historical Sentiment Storage rendering
    ---------------------------------------------------------- */
    renderHistoricalSentimentStorage(ticker) {
      try {
        const data = window.SentimentData;
        const records = (data && data.HISTORICAL_STORAGE && data.HISTORICAL_STORAGE[ticker]) || [];

        const tickerLabel = document.getElementById('historical-storage-ticker-label');
        const countBadge = document.getElementById('historical-storage-count-badge');
        const tbody = document.getElementById('historical-storage-tbody');

        if (tickerLabel) tickerLabel.textContent = ticker;
        if (countBadge) countBadge.textContent = `${records.length} ${records.length === 1 ? 'Entry' : 'Entries'}`;

        if (!tbody) return;

        if (!records || records.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="7" style="padding: var(--space-6); text-align: center; color: var(--color-text-muted);">
                No stored historical sentiment database entries found for ${ticker}.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = records.map(r => {
          const newsSent = parseFloat(r.news_sentiment || 0);
          const redditSent = parseFloat(r.reddit_sentiment || 0);
          const combSent = parseFloat(r.combined_sentiment || 0);
          const price = parseFloat(r.closing_price || 0);
          const pred = r.prediction || 'Neutral';

          let predBadgeClass = 'badge-neutral';
          if (pred.includes('Bullish')) predBadgeClass = 'badge-positive';
          else if (pred.includes('Bearish')) predBadgeClass = 'badge-negative';

          const fmtScore = (val) => {
            const sign = val > 0 ? '+' : '';
            return `${sign}${val.toFixed(4)}`;
          };

          const scoreColor = (val) => val > 0.05 ? 'var(--color-bullish)' : val < -0.05 ? 'var(--color-bearish)' : 'var(--text-secondary)';

          return `
            <tr style="border-bottom: 1px solid var(--color-border); font-size: var(--text-sm);">
              <td style="padding: var(--space-3) var(--space-4); font-weight: 500;">${r.date}</td>
              <td style="padding: var(--space-3) var(--space-4);"><span class="ticker-tag">${r.ticker}</span></td>
              <td style="padding: var(--space-3) var(--space-4); color: ${scoreColor(newsSent)}; font-weight: 500;">${fmtScore(newsSent)}</td>
              <td style="padding: var(--space-3) var(--space-4); color: ${scoreColor(redditSent)}; font-weight: 500;">${fmtScore(redditSent)}</td>
              <td style="padding: var(--space-3) var(--space-4); color: ${scoreColor(combSent)}; font-weight: 600;">${fmtScore(combSent)}</td>
              <td style="padding: var(--space-3) var(--space-4); font-weight: 600;">$${price > 0 ? price.toFixed(2) : '—'}</td>
              <td style="padding: var(--space-3) var(--space-4);"><span class="badge ${predBadgeClass}">${pred}</span></td>
            </tr>
          `;
        }).join('');
      } catch (err) {
        console.error('[App] error in renderHistoricalSentimentStorage:', err);
      }
    },




    onSearch(query) {
      const resultsContainer = document.getElementById('search-results');
      
      if (!query) {
        // Reset highlights
        document.querySelectorAll('.highlight-match').forEach(el => el.classList.remove('highlight-match'));
        if (resultsContainer) {
          resultsContainer.innerHTML = '';
          resultsContainer.style.display = 'none';
        }
        return;
      }

      const q = query.toUpperCase();
      // Highlight matching tickers in news, trending, portfolio
      document.querySelectorAll('.ticker-tag').forEach(tag => {
        if (tag.textContent.includes(q)) {
          tag.classList.add('highlight-match');
        } else {
          tag.classList.remove('highlight-match');
        }
      });

      // Populate autocomplete dropdown dynamically from API if connected
      if (window.LiveData && window.LiveData.isConnected() && resultsContainer) {
        window.LiveData.searchStocks(query)
          .then(matches => {
            this.renderSearchResults(matches, resultsContainer, query);
          })
          .catch(err => {
            console.warn('[App] Dynamic search failed, falling back to local tickers:', err.message);
            this.renderLocalSearchResults(q, resultsContainer, query);
          });
      } else if (resultsContainer) {
        this.renderLocalSearchResults(q, resultsContainer, query);
      }
    },

    renderSearchResults(matches, resultsContainer, query) {
      if (matches && matches.length > 0) {
        resultsContainer.innerHTML = matches.map(t => `
          <div class="search-results-item" data-ticker="${t.ticker}" data-name="${t.name}">
            <span class="item-ticker">${t.ticker}</span>
            <span class="item-name">${t.name}</span>
          </div>
        `).join('');
        resultsContainer.style.display = 'block';

        // Bind click event to each item
        resultsContainer.querySelectorAll('.search-results-item').forEach(item => {
          item.addEventListener('click', () => {
            const ticker = item.dataset.ticker;
            const name = item.dataset.name;
            this.selectTicker(ticker, name);
          });
        });
      } else {
        resultsContainer.innerHTML = `<div class="search-results-no-results">No results found for "${query}"</div>`;
        resultsContainer.style.display = 'block';
      }
    },

    renderLocalSearchResults(q, resultsContainer, query) {
      const data = window.SentimentData;
      if (data && data.STOCK_TICKERS) {
        const matches = data.STOCK_TICKERS.filter(t => 
          t.ticker.toUpperCase().includes(q) || 
          t.name.toUpperCase().includes(q)
        );
        this.renderSearchResults(matches.map(m => ({ ticker: m.ticker, name: m.name })), resultsContainer, query);
      }
    },

    selectTicker(ticker, name) {
      this.state.currentTicker = ticker;
      
      // Update search input
      const searchInput = document.getElementById('stock-search');
      if (searchInput) searchInput.value = ticker;

      // Close dropdown
      const resultsContainer = document.getElementById('search-results');
      if (resultsContainer) {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';
      }

      // Reset highlights
      document.querySelectorAll('.highlight-match').forEach(el => el.classList.remove('highlight-match'));

      // Dropdown synchronization: Ensure the custom ticker exists in the select dropdowns
      const priceSelect = document.getElementById('price-ticker-select');
      const trendSelect = document.getElementById('trend-ticker-select');

      const ensureOption = (selectEl) => {
        if (!selectEl) return;
        let option = selectEl.querySelector(`option[value="${ticker}"]`);
        if (!option) {
          option = document.createElement('option');
          option.value = ticker;
          option.textContent = `${ticker} — ${name || ticker}`;
          selectEl.appendChild(option);
        }
      };

      ensureOption(priceSelect);
      ensureOption(trendSelect);

      // Update dropdown selections
      if (priceSelect) priceSelect.value = ticker;

      const trendSelectEl = document.getElementById('trend-ticker-select');
      if (trendSelectEl) {
        trendSelectEl.value = ticker;
        this.renderSentimentTrend(ticker);
      }

      this.onTickerChange();
    },

    checkMarketStatus() {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour12: false,
          year: 'numeric', month: 'numeric', day: 'numeric',
          hour: 'numeric', minute: 'numeric', second: 'numeric',
          weekday: 'long'
        });
        
        const parts = formatter.formatToParts(new Date());
        const partMap = {};
        parts.forEach(p => partMap[p.type] = p.value);
        
        const weekday = partMap.weekday; // 'Monday', 'Tuesday', etc.
        const hour = parseInt(partMap.hour, 10);
        const minute = parseInt(partMap.minute, 10);
        
        const isWeekend = weekday === 'Saturday' || weekday === 'Sunday';
        let isOpen = false;
        
        if (!isWeekend) {
          const totalMinutes = hour * 60 + minute;
          const openMinutes = 9 * 60 + 30; // 9:30 AM
          const closeMinutes = 16 * 60;    // 4:00 PM
          isOpen = totalMinutes >= openMinutes && totalMinutes < closeMinutes;
        }
        
        const statusDot = document.querySelector('.market-status .status-dot');
        const statusText = document.querySelector('.market-status .status-text');
        
        if (statusDot && statusText) {
          if (isOpen) {
            statusDot.classList.add('open');
            statusDot.classList.remove('closed');
            statusText.textContent = 'Market Open';
          } else {
            statusDot.classList.remove('open');
            statusDot.classList.add('closed');
            statusText.textContent = weekday === 'Saturday' || weekday === 'Sunday' ? 'Market Closed (Weekend)' : 'Market Closed';
          }
        }
      } catch (e) {
        console.error("Error checking market status:", e);
      }
    },

    /* ----------------------------------------------------------
       Periodic refresh — re-pull real data instead of faking jitter
    ---------------------------------------------------------- */
    startLiveUpdates() {
      // Re-fetch the current ticker's real data every 5 minutes (matches
      // LiveData's own cache window) so numbers stay current without
      // hammering the free-tier rate limit.
      setInterval(() => {
        if (!window.LiveData || !window.LiveData.isConnected()) return;
        window.LiveData.loadTicker(this.state.currentTicker)
          .then(() => {
            window.PriceChart.updateTicker(this.state.currentTicker);
            this.renderDashboard();
            this.renderNewsFeed();
            this.renderCorrelation();
            this.renderWordCloud();
            if (window.Indicators) window.Indicators.renderAll(this.state.currentTicker);
          })
          .catch(err => console.warn('[App] periodic refresh failed:', err.message));
      }, 5 * 60 * 1000);

      // Check US stock market open status every 30 seconds
      setInterval(() => {
        this.checkMarketStatus();
      }, 30000);
    },
  };

  /* ----------------------------------------------------------
     Boot sequence
  ---------------------------------------------------------- */
  function boot() {
    // Wait for all dependencies to load
    if (typeof echarts === 'undefined' || typeof LightweightCharts === 'undefined') {
      setTimeout(boot, 100);
      return;
    }

    App.init();
    // Price chart now initializes inside renderAll(), once live data for
    // the default ticker has actually loaded — no more blind setTimeout.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();