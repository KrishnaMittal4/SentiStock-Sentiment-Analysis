// ============================================================================
// SentiStock AI — Static Reference Data
// ============================================================================
// This file used to contain randomly-generated mock prices, sentiment scores,
// news articles, social data, earnings transcripts, portfolio holdings, and
// market indices. All of that has been removed — the app now shows ONLY
// live data pulled from Finnhub (see live-data.js) once a viewer
// connects their own API key.
//
// The only thing kept here is the static ticker directory used to populate
// the search box and ticker dropdowns. Everything else starts empty and is
// filled in at runtime by LiveData once a key is connected.
// ============================================================================

(function () {
  'use strict';

  var STOCK_TICKERS = [
    { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    { ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology' },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical' },
    { ticker: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive' },
    { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
    { ticker: 'META', name: 'Meta Platforms Inc.', sector: 'Technology' },
    { ticker: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial Services' },
    { ticker: 'V', name: 'Visa Inc.', sector: 'Financial Services' },
    { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' }
  ];

  // Filled in by LiveData.loadTicker() once connected. Empty until then —
  // no simulated placeholders.
  window.SentimentData = {
    STOCK_TICKERS: STOCK_TICKERS,
    PRICE_DATA: {},
    SENTIMENT_DATA: {},
    NEWS_ARTICLES: [],
    LIVE_ARTICLES: {}
  };

})();
