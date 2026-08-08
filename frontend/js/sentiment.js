/**
 * SentiStock AI — Sentiment Analysis Engine
 * ========================================
 * Core analytical logic for computing sentiment metrics, trends,
 * correlations, and dashboard summaries.
 *
 * Depends on `window.Utils` for helper functions.
 * Attached to `window.SentimentEngine` — no module system required.
 */

(function () {
  'use strict';

  /* ===================================================================
   *  Common financial stop-words (excluded from word-frequency analysis)
   * =================================================================*/

  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
    'being', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
    'these', 'those', 'it', 'its', 'not', 'no', 'as', 'if', 'so', 'than',
    'too', 'very', 'just', 'about', 'also', 'into', 'over', 'after',
    'before', 'between', 'through', 'up', 'out', 'all', 'more', 'most',
    'other', 'some', 'such', 'only', 'own', 'same', 'then', 'there',
    'when', 'where', 'which', 'while', 'who', 'how', 'what', 'new',
    'said', 'per', 'one', 'two', 'vs', 'via', 'says', 'get', 'got',
    'like', 'well', 'back', 'even', 'still', 'way', 'take', 'come',
    'make', 'many', 'much', 'each', 'every', 'year', 'years', 'day',
    'days', 'week', 'weeks', 'month', 'months', 'time', 'according',
  ]);

  /* ===================================================================
   *  Internal helpers
   * =================================================================*/

  /**
   * Safely compute the arithmetic mean of a numeric array.
   * @param {number[]} arr
   * @returns {number}
   */
  function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  /**
   * Clamp a value between min and max.
   * @param {number} val
   * @param {number} lo
   * @param {number} hi
   * @returns {number}
   */
  function clamp(val, lo, hi) {
    return Math.max(lo, Math.min(hi, val));
  }

  /* ===================================================================
   *  Public API
   * =================================================================*/

  /**
   * Calculate aggregate sentiment from multiple source arrays.
   * Weights: news 40 %, social 30 %, earnings 30 %.
   *
   * @param {number[]} newsScores    — array of sentiment scores from news
   * @param {number[]} socialScores  — array of sentiment scores from social media
   * @param {number[]} earningsScores — array of sentiment scores from earnings
   * @returns {{ score: number, confidence: number, label: string }}
   */
  function calculateAggregateSentiment(newsScores, socialScores, earningsScores) {
    const news = Array.isArray(newsScores) ? newsScores : [];
    const social = Array.isArray(socialScores) ? socialScores : [];
    const earnings = Array.isArray(earningsScores) ? earningsScores : [];

    const newsMean = mean(news);
    const socialMean = mean(social);
    const earningsMean = mean(earnings);

    // Weighted combination
    const score = clamp(
      newsMean * 0.4 + socialMean * 0.3 + earningsMean * 0.3,
      -1,
      1
    );

    // Confidence is driven by total data volume
    const totalMentions = news.length + social.length + earnings.length;
    const confidence = getConfidence(totalMentions);

    const label = classifyLabel(score);

    return { score, confidence, label };
  }

  /**
   * Compute overall market sentiment by aggregating all tickers over a
   * given number of days.
   *
   * @param {Object} sentimentData — { [ticker]: [{ date, score }] }
   * @param {number} [days=7]
   * @returns {{ score: number, trend: string, momentum: number }}
   */
  function getMarketSentiment(sentimentData, days = 7) {
    if (!sentimentData || typeof sentimentData !== 'object') {
      return { score: 0, trend: 'stable', momentum: 0 };
    }

    const Utils = window.Utils;
    const allScores = [];
    const recentScores = [];

    for (const ticker of Object.keys(sentimentData)) {
      const items = sentimentData[ticker];
      if (!Array.isArray(items)) continue;

      const filtered = Utils
        ? Utils.filterByDateRange(items, days)
        : items;

      filtered.forEach(item => {
        if (item && typeof item.score === 'number') {
          allScores.push(item.score);
        }
      });
    }

    // Split into first-half and second-half for momentum
    const half = Math.floor(allScores.length / 2);
    const firstHalf = allScores.slice(0, half);
    const secondHalf = allScores.slice(half);

    const score = clamp(mean(allScores), -1, 1);
    const momentum = mean(secondHalf) - mean(firstHalf);

    const trend = getSentimentTrend(allScores);

    return { score, trend, momentum };
  }

  /**
   * Determine sentiment trend based on moving-average direction.
   *
   * @param {number[]} scores — ordered array of sentiment scores
   * @param {number} [windowSize=7]
   * @returns {'improving'|'declining'|'stable'}
   */
  function getSentimentTrend(scores, windowSize = 7) {
    if (!Array.isArray(scores) || scores.length < 3) return 'stable';

    const Utils = window.Utils;
    const ma = Utils
      ? Utils.movingAverage(scores, Math.min(windowSize, scores.length))
      : movingAverageFallback(scores, Math.min(windowSize, scores.length));

    // Compare the last MA value with one near the start
    const recent = ma[ma.length - 1];
    const earlier = ma[Math.max(0, ma.length - Math.min(windowSize, ma.length))];
    const delta = recent - earlier;

    const THRESHOLD = 0.05;
    if (delta > THRESHOLD) return 'improving';
    if (delta < -THRESHOLD) return 'declining';
    return 'stable';
  }

  /**
   * Identify the biggest sentiment movers — tickers with the largest
   * sentiment changes, enriched with price correlation.
   *
   * @param {Object} sentimentData — { [ticker]: [{ date, score }] }
   * @param {Object} priceData     — { [ticker]: [{ date, change }] }
   * @param {number} [count=5]
   * @returns {Array<{ ticker, sentimentChange, priceChange, correlation }>}
   */
  function getTopMovers(sentimentData, priceData, count = 5) {
    if (!sentimentData) return [];

    const movers = [];

    for (const ticker of Object.keys(sentimentData)) {
      const sentItems = sentimentData[ticker];
      if (!Array.isArray(sentItems) || sentItems.length < 2) continue;

      // Sort by date ascending
      const sorted = [...sentItems].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );

      const earliest = sorted[0].score;
      const latest = sorted[sorted.length - 1].score;
      const sentimentChange = latest - earliest;

      // Price change
      let priceChange = 0;
      let correlation = 0;

      if (priceData && Array.isArray(priceData[ticker]) && priceData[ticker].length >= 2) {
        const prices = priceData[ticker];
        // Price data uses 'time' not 'date'
        const firstClose = prices[0].close;
        const lastClose = prices[prices.length - 1].close;
        priceChange = ((lastClose - firstClose) / firstClose) * 100;

        // Compute daily price changes for correlation
        const dailyChanges = [];
        for (let i = 1; i < prices.length; i++) {
          dailyChanges.push({
            date: prices[i].time || prices[i].date,
            change: ((prices[i].close - prices[i - 1].close) / prices[i - 1].close) * 100,
          });
        }

        // Align sentiment scores with daily price changes by date
        const dateMap = new Map();
        sorted.forEach(s => dateMap.set(s.date, { score: s.score }));
        dailyChanges.forEach(p => {
          const entry = dateMap.get(p.date);
          if (entry) entry.change = p.change;
        });

        const paired = [...dateMap.values()].filter(
          e => e.score !== undefined && e.change !== undefined
        );

        if (paired.length >= 3) {
          correlation = calculateCorrelation(
            paired.map(p => p.score),
            paired.map(p => p.change)
          );
        }
      }

      movers.push({ ticker, sentimentChange, priceChange, correlation });
    }

    // Sort by absolute sentiment change descending
    movers.sort((a, b) => Math.abs(b.sentimentChange) - Math.abs(a.sentimentChange));
    return movers.slice(0, count);
  }

  /**
   * Pearson correlation coefficient.
   * @param {number[]} sentimentScores
   * @param {number[]} priceChanges
   * @returns {number} -1..1
   */
  function calculateCorrelation(sentimentScores, priceChanges) {
    // Delegate to Utils if available
    if (window.Utils && typeof window.Utils.calculateCorrelation === 'function') {
      return window.Utils.calculateCorrelation(sentimentScores, priceChanges);
    }
    return pearson(sentimentScores, priceChanges);
  }

  /**
   * Inline Pearson implementation (fallback).
   */
  function pearson(x, y) {
    if (!x || !y || x.length !== y.length || x.length === 0) return 0;
    const n = x.length;
    const mx = mean(x);
    const my = mean(y);
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom === 0 ? 0 : num / denom;
  }

  /**
   * Count positive / negative / neutral articles.
   *
   * @param {Array<{ sentiment: string|number }>} articles
   * @returns {{ positive: number, negative: number, neutral: number, total: number }}
   */
  function getSentimentDistribution(articles) {
    const dist = { positive: 0, negative: 0, neutral: 0, total: 0 };
    if (!Array.isArray(articles)) return dist;

    articles.forEach(article => {
      dist.total++;
      const s = typeof article.sentiment === 'number'
        ? classifyLabel(article.sentiment)
        : (article.sentiment || 'neutral').toLowerCase();

      if (s === 'positive' || s === 'bullish') dist.positive++;
      else if (s === 'negative' || s === 'bearish') dist.negative++;
      else dist.neutral++;
    });

    return dist;
  }

  /**
   * Compute a confidence score (0–0.99) based on the number of mentions.
   * Uses a logarithmic curve that saturates around 100+ mentions.
   *
   * @param {number} mentionCount
   * @returns {number} 0..0.99
   */
  function getConfidence(mentionCount) {
    if (!mentionCount || mentionCount <= 0) return 0;
    // Logarithmic saturation: approaches 0.99 as mentions grow
    const raw = 1 - 1 / (1 + Math.log1p(mentionCount) * 0.3);
    return Math.min(0.99, Math.round(raw * 100) / 100);
  }

  /**
   * Build a summary object suitable for rendering KPI cards.
   *
   * @param {Object} data — {
   *   sentimentByTicker: { [ticker]: [{ date, score }] },
   *   priceByTicker:     { [ticker]: [{ date, change }] },
   *   articles:          [{ title, source, date, sentiment, ticker }],
   *   NEWS_CONFIDENCE:   { [ticker]: number|null } — real FinBERT avg
   *                      confidence from the backend, if loaded
   *   days: number
   * }
   * @param {string} [ticker] — current ticker, used to look up real
   *   confidence in data.NEWS_CONFIDENCE. Omit to always use the
   *   mention-volume fallback heuristic.
   * @returns {{
   *   overallSentiment: number,
   *   marketMood: string,
   *   topBullish: Array,
   *   topBearish: Array,
   *   volume: number,
   *   confidence: number,
   *   confidenceIsReal: boolean
   * }}
   */
  function getDashboardSummary(data, ticker) {
    if (!data) {
      return {
        overallSentiment: 0,
        marketMood: 'Neutral',
        topBullish: { headline: 'No data yet', score: 0 },
        topBearish: { headline: 'No data yet', score: 0 },
        volume: 0,
        confidence: 0,
        confidenceIsReal: false,
      };
    }

    // Accept both naming conventions
    const sentimentByTicker = data.SENTIMENT_DATA || data.sentimentByTicker || {};
    const articles = data.NEWS_ARTICLES || data.articles || [];
    const days = data.days || 7;

    // Market-level sentiment
    const market = getMarketSentiment(sentimentByTicker, days);

    // Most bullish / most bearish individual headline for the ticker(s)
    // currently loaded. (Cross-ticker "movers" comparison — picking which
    // *ticker* moved most relative to others — needs many tickers loaded
    // at once, which doesn't happen anymore now that the app only loads
    // the ticker you're actually viewing. Picking the single most
    // positive/negative real headline is the equivalent that still means
    // something with one ticker's real news loaded.)
    let topBullish = { headline: null, score: 0 };
    let topBearish = { headline: null, score: 0 };
    articles.forEach(a => {
      const score = typeof a.score === 'number' ? a.score : 0;
      if (score > 0 && (topBullish.headline === null || score > topBullish.score)) {
        topBullish = { headline: a.headline, score, source: a.source };
      }
      if (score < 0 && (topBearish.headline === null || score < topBearish.score)) {
        topBearish = { headline: a.headline, score, source: a.source };
      }
    });
    if (topBullish.headline === null) topBullish = { headline: 'No bullish headlines yet', score: 0 };
    if (topBearish.headline === null) topBearish = { headline: 'No bearish headlines yet', score: 0 };

    // Total article volume. Previously this also summed a d.sources.*/
    // d.volume field from sentimentByTicker's daily entries, but the
    // real backend's /api/news response only ever returns {date, score}
    // per day (see sentiment_service.py) — that field never existed on
    // real data, so it was dead code that only mattered for the old
    // mock-data shape. Removed rather than kept as silent no-op, since
    // it would have started double-counting the moment someone added a
    // volume field to the backend response without knowing this read it.
    const totalMentions = articles.length;

    // Confidence: prefer the real mean FinBERT prediction confidence
    // computed server-side (window.SentimentData.NEWS_CONFIDENCE[ticker],
    // populated by LiveData.loadTicker from avg_confidence in the
    // /api/news response). Only fall back to the old mention-volume
    // heuristic when that isn't available yet (e.g. still loading, or
    // ticker not passed in) — and callers can check confidenceIsReal to
    // label the fallback honestly rather than implying it's model output.
    const realConfidence = ticker && data.NEWS_CONFIDENCE ? data.NEWS_CONFIDENCE[ticker] : null;
    const confidenceIsReal = realConfidence != null;
    const confidence = confidenceIsReal ? realConfidence : getConfidence(totalMentions);

    // Mood label
    const marketMood = classifyLabel(market.score);
    const moodCapitalized = marketMood.charAt(0).toUpperCase() + marketMood.slice(1);

    return {
      overallSentiment: market.score,
      marketMood: moodCapitalized === 'Positive'
        ? 'Bullish'
        : moodCapitalized === 'Negative'
          ? 'Bearish'
          : 'Neutral',
      topBullish,
      topBearish,
      volume: totalMentions,
      confidence,
      confidenceIsReal,
    };
  }

  /**
   * Filter and sort an article array by multiple optional criteria.
   *
   * @param {Array<Object>} articles
   * @param {Object} criteria
   * @param {string}  [criteria.ticker]    — exact ticker match
   * @param {string}  [criteria.sentiment] — 'positive', 'negative', 'neutral'
   * @param {number}  [criteria.dateRange] — last N days
   * @param {string}  [criteria.source]    — source name substring match
   * @returns {Array<Object>}
   */
  function filterArticles(articles, { ticker, sentiment, dateRange, source } = {}) {
    if (!Array.isArray(articles)) return [];

    let result = [...articles];

    // Filter by ticker
    if (ticker) {
      const t = ticker.toUpperCase();
      result = result.filter(a =>
        (a.ticker || '').toUpperCase() === t ||
        (Array.isArray(a.tickers) && a.tickers.some(tk => tk.toUpperCase() === t))
      );
    }

    // Filter by sentiment category
    if (sentiment) {
      const s = sentiment.toLowerCase();
      result = result.filter(a => {
        const artSentiment = typeof a.sentiment === 'number'
          ? classifyLabel(a.sentiment)
          : (a.sentiment || '').toLowerCase();
        return artSentiment === s;
      });
    }

    // Filter by date range (last N days)
    if (dateRange && dateRange > 0) {
      const Utils = window.Utils;
      if (Utils && typeof Utils.filterByDateRange === 'function') {
        result = Utils.filterByDateRange(result, dateRange);
      } else {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - dateRange);
        cutoff.setHours(0, 0, 0, 0);
        result = result.filter(a => new Date(a.date) >= cutoff);
      }
    }

    // Filter by source (substring, case-insensitive)
    if (source) {
      const src = source.toLowerCase();
      result = result.filter(a =>
        (a.source || '').toLowerCase().includes(src)
      );
    }

    // Sort newest first
    result.sort((a, b) => new Date(b.date) - new Date(a.date));

    return result;
  }

  /**
   * Extract the most-common meaningful words from article titles and
   * descriptions, tagged with average sentiment.
   *
   * @param {Array<{ title?: string, description?: string, summary?: string, sentiment?: number }>} articles
   * @param {number} [topN=30]
   * @returns {Array<{ word: string, count: number, sentiment: number }>}
   */
  function getWordFrequency(articles, topN = 30) {
    if (!Array.isArray(articles) || articles.length === 0) return [];

    /** @type {Map<string, { count: number, sentimentSum: number }>} */
    const freq = new Map();

    articles.forEach(article => {
      const text = [
        article.title || '',
        article.description || '',
        article.summary || '',
      ].join(' ');

      const sentimentValue = typeof article.sentiment === 'number'
        ? article.sentiment
        : 0;

      // Tokenise: lowercase, keep only word characters
      const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));

      const seen = new Set(); // dedupe within a single article
      words.forEach(word => {
        if (seen.has(word)) return;
        seen.add(word);

        if (freq.has(word)) {
          const entry = freq.get(word);
          entry.count++;
          entry.sentimentSum += sentimentValue;
        } else {
          freq.set(word, { count: 1, sentimentSum: sentimentValue });
        }
      });
    });

    // Convert to array, sort by count descending, take topN
    return Array.from(freq.entries())
      .map(([word, data]) => ({
        word,
        count: data.count,
        sentiment: data.count > 0
          ? Math.round((data.sentimentSum / data.count) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
  }

  /* ===================================================================
   *  Internal helper — classify score into label string
   * =================================================================*/

  function classifyLabel(score) {
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  /**
   * Fallback simple moving average (when Utils isn't loaded yet).
   */
  function movingAverageFallback(data, w) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - w + 1);
      const slice = data.slice(start, i + 1);
      result.push(slice.reduce((s, v) => s + v, 0) / slice.length);
    }
    return result;
  }

  /* ===================================================================
   *  Expose on window
   * =================================================================*/

  window.SentimentEngine = {
    calculateAggregateSentiment,
    getMarketSentiment,
    getSentimentTrend,
    getTopMovers,
    calculateCorrelation,
    getSentimentDistribution,
    getConfidence,
    getDashboardSummary,
    filterArticles,
    getWordFrequency,
  };
})();