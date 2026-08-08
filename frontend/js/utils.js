/**
 * SentiStock AI — Global Utility Functions
 * =======================================
 * Provides formatting, color helpers, DOM utilities, SVG icons,
 * data-analysis primitives, and theme management for the dashboard.
 *
 * Attached to `window.Utils` — no module system required.
 */

(function () {
  'use strict';

  /* ===================================================================
   *  SVG Icon Library (20×20 viewBox, 1.5px stroke, currentColor)
   * =================================================================*/

  const ICONS = {
    'arrow-up': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="16" x2="10" y2="4"/><polyline points="4 10 10 4 16 10"/></svg>`,

    'arrow-down': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="4" x2="10" y2="16"/><polyline points="4 10 10 16 16 10"/></svg>`,

    'arrow-right': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="10" x2="16" y2="10"/><polyline points="10 4 16 10 10 16"/></svg>`,

    'search': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="5.5"/><line x1="13" y1="13" x2="17" y2="17"/></svg>`,

    'sun': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="3.5"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="10" y1="16" x2="10" y2="18"/><line x1="2" y1="10" x2="4" y2="10"/><line x1="16" y1="10" x2="18" y2="10"/><line x1="4.34" y1="4.34" x2="5.76" y2="5.76"/><line x1="14.24" y1="14.24" x2="15.66" y2="15.66"/><line x1="4.34" y1="15.66" x2="5.76" y2="14.24"/><line x1="14.24" y1="5.76" x2="15.66" y2="4.34"/></svg>`,

    'moon': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11.36A7 7 0 1 1 8.64 3 5.5 5.5 0 0 0 17 11.36z"/></svg>`,

    'trending-up': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 4 17 8 13 8"/><polyline points="3 16 8 11 11 14 17 8"/></svg>`,

    'trending-down': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 16 17 12 13 12"/><polyline points="3 4 8 9 11 6 17 12"/></svg>`,

    'alert-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="11"/><circle cx="10" cy="14" r="0.5" fill="currentColor" stroke="none"/></svg>`,

    'clock': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><polyline points="10 5 10 10 13.5 12"/></svg>`,

    'newspaper': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="13" height="14" rx="1"/><path d="M15 7h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4"/><line x1="5" y1="7" x2="12" y2="7"/><line x1="5" y1="10" x2="12" y2="10"/><line x1="5" y1="13" x2="9" y2="13"/></svg>`,

    'message-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10c0 3.87-3.13 7-7 7a7.07 7.07 0 0 1-3.46-.9L3 17l.9-3.54A7.07 7.07 0 0 1 3 10c0-3.87 3.13-7 7-7s7 3.13 7 7z"/></svg>`,

    'bar-chart': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="3" height="7" rx="0.5"/><rect x="8.5" y="5" width="3" height="12" rx="0.5"/><rect x="14" y="8" width="3" height="9" rx="0.5"/></svg>`,

    'briefcase': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="10" rx="1.5"/><path d="M7 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="2" y1="12" x2="18" y2="12"/></svg>`,

    'external-link': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11v5a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5H9"/><polyline points="12 3 17 3 17 8"/><line x1="8" y1="12" x2="17" y2="3"/></svg>`,

    'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 8 10 13 15 8"/></svg>`,

    'filter': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="2 3 18 3 12 10.5 12 15 8 17 8 10.5 2 3"/></svg>`,

    'refresh': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15.5 2 15.5 6 11.5 6"/><path d="M14.5 12.5A5.5 5.5 0 1 1 15 7l.5-1"/><polyline points="4.5 18 4.5 14 8.5 14"/><path d="M5.5 7.5A5.5 5.5 0 1 1 5 13l-.5 1"/></svg>`,

    'x': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>`,

    'check': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 8 14 16 6"/></svg>`,

    'info': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r="0.5" fill="currentColor" stroke="none"/></svg>`,

    'globe': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><ellipse cx="10" cy="10" rx="3.5" ry="8"/><line x1="2" y1="10" x2="18" y2="10"/><path d="M3.5 5.5h13"/><path d="M3.5 14.5h13"/></svg>`
  };

  /* ===================================================================
   *  Colour palette constants
   * =================================================================*/

  const COLORS = {
    bullish: '#10b981',   // Emerald-500
    bearish: '#ef4444',   // Red-500
    neutral: '#f59e0b',   // Amber-500
  };

  /* ===================================================================
   *  Month abbreviations (avoids Intl for deterministic output)
   * =================================================================*/

  const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  /* ===================================================================
   *  Number Formatting
   * =================================================================*/

  /**
   * Format a number as US-dollar currency.
   * @param {number} value
   * @param {number} [decimals=2]
   * @returns {string} e.g. '$1,234.56' or '-$42.10'
   */
  function formatCurrency(value, decimals = 2) {
    if (value == null || isNaN(value)) return '$0.00';
    const abs = Math.abs(value);
    const formatted = abs.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return value < 0 ? `-$${formatted}` : `$${formatted}`;
  }

  /**
   * Format a number as a percentage with optional leading sign.
   * @param {number} value   — already in percent units (12.3 → '12.3%')
   * @param {number} [decimals=1]
   * @param {boolean} [showSign=true]
   * @returns {string}
   */
  function formatPercent(value, decimals = 1, showSign = true) {
    if (value == null || isNaN(value)) return '0.0%';
    const fixed = Math.abs(value).toFixed(decimals);
    if (showSign) {
      return value >= 0 ? `+${fixed}%` : `-${fixed}%`;
    }
    return value < 0 ? `-${fixed}%` : `${fixed}%`;
  }

  /**
   * Format a number with thousand-separator commas.
   * @param {number} value
   * @param {number} [decimals=0]
   * @returns {string}
   */
  function formatNumber(value, decimals = 0) {
    if (value == null || isNaN(value)) return '0';
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * Compact formatting: 1200 → '1.2K', 3400000 → '3.4M', etc.
   * @param {number} value
   * @returns {string}
   */
  function formatCompact(value) {
    if (value == null || isNaN(value)) return '0';
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return sign + abs.toString();
  }

  /**
   * Truncate a string to a max length with ellipsis.
   * @param {string} str
   * @param {number} len
   * @returns {string}
   */
  function truncateText(str, len = 100) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len - 1).trimEnd() + '…' : str;
  }

  /**
   * Format a sentiment score with explicit sign (e.g. '+0.73', '-0.42').
   * @param {number} score — typically -1..1
   * @returns {string}
   */
  function formatSentimentScore(score) {

    if (score == null || isNaN(score)) return '+0.00';
    const abs = Math.abs(score).toFixed(2);
    return score >= 0 ? `+${abs}` : `-${abs}`;
  }

  /* ===================================================================
   *  Date Formatting
   * =================================================================*/

  /**
   * Parse a date string or Date and return a Date object (local time).
   * @param {string|Date} d
   * @returns {Date}
   */
  function _toDate(d) {
    if (d instanceof Date) return d;
    return new Date(d);
  }

  /**
   * Format a date as 'Jun 19, 2026'.
   * @param {string|Date} dateStr
   * @returns {string}
   */
  function formatDate(dateStr) {
    const d = _toDate(dateStr);
    return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  /**
   * Format a time string as '2:30 PM'.
   * @param {string|Date} timeStr
   * @returns {string}
   */
  function formatTime(timeStr) {
    const d = _toDate(timeStr);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  /**
   * Human-friendly relative time: '2 hours ago', '3 days ago', 'just now'.
   * @param {string|Date} dateStr
   * @returns {string}
   */
  function formatRelativeTime(dateStr) {
    const d = _toDate(dateStr);
    const now = Date.now();
    const diffMs = now - d.getTime();

    // Future dates
    if (diffMs < 0) return 'just now';

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    if (hours === 1) return '1 hour ago';
    if (hours < 24) return `${hours} hours ago`;
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    if (weeks === 1) return '1 week ago';
    if (weeks < 5) return `${weeks} weeks ago`;
    if (months === 1) return '1 month ago';
    if (months < 12) return `${months} months ago`;
    if (years === 1) return '1 year ago';
    return `${years} years ago`;
  }

  /**
   * Short date: 'Jun 19'.
   * @param {string|Date} dateStr
   * @returns {string}
   */
  function formatDateShort(dateStr) {
    const d = _toDate(dateStr);
    return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
  }

  /* ===================================================================
   *  Colour Helpers
   * =================================================================*/

  /**
   * Return a CSS colour based on a sentiment score.
   * @param {number} score  -1 .. 1
   * @returns {string} hex colour
   */
  function getSentimentColor(score) {
    if (score > 0.2) return COLORS.bullish;
    if (score < -0.2) return COLORS.bearish;
    return COLORS.neutral;
  }

  /**
   * Human label for a sentiment score.
   * @param {number} score
   * @returns {'Bullish'|'Bearish'|'Neutral'}
   */
  function getSentimentLabel(score) {
    if (score > 0.2) return 'Bullish';
    if (score < -0.2) return 'Bearish';
    return 'Neutral';
  }

  /**
   * CSS badge class for a sentiment string ('positive', 'negative', 'neutral').
   * @param {string} sentiment
   * @returns {string}
   */
  function getSentimentBadgeClass(sentiment) {
    const map = {
      positive: 'badge-positive',
      bullish: 'badge-positive',
      negative: 'badge-negative',
      bearish: 'badge-negative',
      neutral: 'badge-neutral',
    };
    return map[(sentiment || '').toLowerCase()] || 'badge-neutral';
  }

  /**
   * Linearly interpolate between two hex colours.
   * @param {string} color1 — '#rrggbb'
   * @param {string} color2 — '#rrggbb'
   * @param {number} factor — 0..1
   * @returns {string} '#rrggbb'
   */
  function interpolateColor(color1, color2, factor) {
    factor = Math.max(0, Math.min(1, factor));

    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Map a sentiment score (-1..1) to a heatmap colour:
   *   -1 → red (#ef4444)   0 → yellow (#f59e0b)   +1 → green (#10b981)
   * @param {number} score
   * @returns {string} hex colour
   */
  function scoreToHeatColor(score) {
    score = Math.max(-1, Math.min(1, score));
    if (score <= 0) {
      // Red → Yellow (-1 → 0)
      return interpolateColor('#ef4444', '#f59e0b', score + 1);
    }
    // Yellow → Green (0 → 1)
    return interpolateColor('#f59e0b', '#10b981', score);
  }

  /* ===================================================================
   *  Sentiment Helpers
   * =================================================================*/

  /**
   * Classify a numeric score into a sentiment category.
   * @param {number} score
   * @returns {'positive'|'negative'|'neutral'}
   */
  function classifySentiment(score) {
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  /**
   * Return an emoji glyph for a sentiment score.
   * @param {number} score
   * @returns {string}
   */
  function getSentimentEmoji(score) {
    if (score > 0.2) return '📈';
    if (score < -0.2) return '📉';
    return '➡️';
  }

  /* ===================================================================
   *  DOM Helpers
   * =================================================================*/

  /**
   * Convenience wrapper around `document.createElement`.
   * @param {string} tag
   * @param {string} [className]
   * @param {string} [textContent]
   * @returns {HTMLElement}
   */
  function createElement(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined && textContent !== null) el.textContent = textContent;
    return el;
  }

  /**
   * Return an SVG markup string for a named icon.
   * @param {string} name
   * @returns {string} SVG markup or empty string if unknown
   */
  function createSVGIcon(name) {
    return ICONS[name] || '';
  }

  /* ===================================================================
   *  Debounce / Throttle
   * =================================================================*/

  /**
   * Standard debounce — calls `fn` only after `delay` ms of silence.
   * @param {Function} fn
   * @param {number} delay — milliseconds
   * @returns {Function}
   */
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Standard throttle — calls `fn` at most once every `limit` ms.
   * @param {Function} fn
   * @param {number} limit — milliseconds
   * @returns {Function}
   */
  function throttle(fn, limit) {
    let inThrottle = false;
    let lastArgs = null;
    let lastContext = null;

    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
          if (lastArgs) {
            fn.apply(lastContext, lastArgs);
            lastArgs = null;
            lastContext = null;
          }
        }, limit);
      } else {
        lastArgs = args;
        lastContext = this;
      }
    };
  }

  /* ===================================================================
   *  Data Helpers
   * =================================================================*/

  /**
   * Filter an array of objects to the last N days based on their `date` field.
   * @param {Array<Object>} data — each item should have a `date` property
   * @param {number} days
   * @returns {Array<Object>}
   */
  function filterByDateRange(data, days) {
    if (!Array.isArray(data) || !days) return data || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    return data.filter(item => {
      const d = _toDate(item.date);
      return d >= cutoff;
    });
  }

  /**
   * Compute Pearson correlation coefficient between two equal-length arrays.
   * Returns a value in [-1, 1], or 0 if inputs are invalid.
   * @param {number[]} arr1
   * @param {number[]} arr2
   * @returns {number}
   */
  function calculateCorrelation(arr1, arr2) {
    if (!arr1 || !arr2 || arr1.length !== arr2.length || arr1.length === 0) return 0;

    const n = arr1.length;
    const mean1 = arr1.reduce((s, v) => s + v, 0) / n;
    const mean2 = arr2.reduce((s, v) => s + v, 0) / n;

    let num = 0;
    let den1 = 0;
    let den2 = 0;

    for (let i = 0; i < n; i++) {
      const d1 = arr1[i] - mean1;
      const d2 = arr2[i] - mean2;
      num += d1 * d2;
      den1 += d1 * d1;
      den2 += d2 * d2;
    }

    const denom = Math.sqrt(den1 * den2);
    return denom === 0 ? 0 : num / denom;
  }

  /**
   * Simple moving average over a numeric array.
   * @param {number[]} data
   * @param {number} windowSize
   * @returns {number[]} — same length as `data`; first `windowSize-1` entries
   *                        are averaged over available points.
   */
  function movingAverage(data, windowSize) {
    if (!Array.isArray(data) || data.length === 0) return [];
    windowSize = Math.max(1, windowSize);

    const result = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const slice = data.slice(start, i + 1);
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
      result.push(avg);
    }
    return result;
  }

  /* ===================================================================
   *  Theme Management
   * =================================================================*/

  const THEME_KEY = 'sentistock-theme';

  /**
   * Read the current theme from localStorage, defaulting to 'dark'.
   * @returns {'dark'|'light'}
   */
  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark';
    } catch {
      return 'dark';
    }
  }

  /**
   * Apply a theme to the document and persist to localStorage.
   * @param {'dark'|'light'} theme
   */
  function setTheme(theme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // localStorage unavailable — ignore
    }
  }

  /**
   * Toggle between 'dark' and 'light' themes.
   */
  function toggleTheme() {
    const current = getTheme();
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  /* ===================================================================
   *  Public API
   * =================================================================*/

  window.Utils = {
    // Number formatting
    formatCurrency,
    formatPercent,
    formatNumber,
    formatCompact,
    formatSentimentScore,
    truncateText,


    // Date formatting
    formatDate,
    formatTime,
    formatRelativeTime,
    formatDateShort,

    // Colour helpers
    getSentimentColor,
    getSentimentLabel,
    getSentimentBadgeClass,
    interpolateColor,
    scoreToHeatColor,

    // Sentiment helpers
    classifySentiment,
    getSentimentEmoji,

    // DOM helpers
    createElement,
    createSVGIcon,

    /**
     * Create a standard, reusable Error Card component element.
     * @param {string} title
     * @param {string} message
     * @param {Function} [onRetry] - optional callback function when retry button clicked
     * @returns {HTMLElement}
     */
    createErrorCard(title = 'Unable to Load Data', message = 'Something went wrong while communicating with the server.', onRetry = null) {
      const card = document.createElement('div');
      card.className = 'error-card animate-scale-in';

      const icon = document.createElement('div');
      icon.className = 'error-card-icon';
      icon.innerHTML = '⚠️';

      const titleEl = document.createElement('div');
      titleEl.className = 'error-card-title';
      titleEl.textContent = title;

      const msgEl = document.createElement('div');
      msgEl.className = 'error-card-message';
      msgEl.textContent = message;

      card.appendChild(icon);
      card.appendChild(titleEl);
      card.appendChild(msgEl);

      if (typeof onRetry === 'function') {
        const actions = document.createElement('div');
        actions.className = 'error-card-actions';

        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'btn-retry';
        retryBtn.innerHTML = `🔄 Retry`;
        retryBtn.addEventListener('click', () => onRetry());

        actions.appendChild(retryBtn);
        card.appendChild(actions);
      }

      return card;
    },

    /**
     * Create a skeleton placeholder container with shimmer effect.
     * @param {number} lines
     * @returns {HTMLElement}
     */
    createSkeletonUI(lines = 3) {
      const wrapper = document.createElement('div');
      wrapper.className = 'skeleton-news';
      for (let i = 0; i < lines; i++) {
        const line = document.createElement('div');
        line.className = `skeleton-line ${i === 0 ? 'skeleton-line-title' : i === 1 ? 'skeleton-line-meta' : 'skeleton-line-short'}`;
        wrapper.appendChild(line);
      }
      return wrapper;
    },

    // Debounce / throttle
    debounce,
    throttle,

    // Data helpers
    filterByDateRange,
    calculateCorrelation,
    movingAverage,

    // Theme
    getTheme,
    setTheme,
    toggleTheme,
  };
})();
