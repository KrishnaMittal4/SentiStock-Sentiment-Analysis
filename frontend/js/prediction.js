/**
 * ML Price Movement Prediction Controller — Handles fetching, rendering,
 * and algorithm switching for Random Forest, XGBoost, and LightGBM models.
 */

window.MLPrediction = (function () {
  let currentSymbol = 'AAPL';
  let currentModelKey = 'rf';

  async function loadPrediction(symbol, modelKey = null) {
    if (symbol) currentSymbol = symbol.toUpperCase();
    if (modelKey) currentModelKey = modelKey;

    const tickerBadge = document.getElementById('ml-ticker-badge');
    const directionBadge = document.getElementById('ml-direction-badge');
    const directionArrow = document.getElementById('ml-direction-arrow');
    const directionText = document.getElementById('ml-direction-text');
    const directionCard = document.getElementById('ml-direction-card');
    const primaryProbVal = document.getElementById('ml-primary-prob-val');
    const probUpVal = document.getElementById('ml-prob-up-val');
    const probDownVal = document.getElementById('ml-prob-down-val');
    const probUpBar = document.getElementById('ml-prob-up-bar');
    const confidenceBadge = document.getElementById('ml-confidence-badge');
    const predDateLabel = document.getElementById('ml-prediction-date-label');
    const metricAcc = document.getElementById('ml-metric-accuracy');
    const metricRoc = document.getElementById('ml-metric-roc');
    const metricPrec = document.getElementById('ml-metric-precision');
    const metricF1 = document.getElementById('ml-metric-f1');
    const reasoningText = document.getElementById('ml-summary-reasoning-text');
    const importancesList = document.getElementById('ml-feature-importances-list');
    const evalTbody = document.getElementById('ml-historical-eval-tbody');

    if (tickerBadge) tickerBadge.textContent = `${currentSymbol}`;
    if (reasoningText) reasoningText.textContent = `Training ${currentModelKey.toUpperCase()} model on multi-modal features...`;

    try {
      const baseUrl = window.LiveData ? window.LiveData.BASE_URL : 'http://localhost:8000/api';
      const response = await fetch(`${baseUrl}/prediction/${encodeURIComponent(currentSymbol)}?model=${currentModelKey}&period=1y`);
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }
      const data = await response.json();
      window.MLPrediction._lastPrediction = data;

      // 1. Direction & Glowing Card styling
      const isUp = data.prediction === 'UP';
      if (directionArrow) directionArrow.textContent = isUp ? '⬆️' : '⬇️';
      if (directionText) {
        directionText.textContent = data.prediction;
        directionText.style.color = isUp ? '#10b981' : '#ef4444';
      }

      if (directionCard) {
        if (isUp) {
          directionCard.style.background = 'rgba(16, 185, 129, 0.08)';
          directionCard.style.borderColor = 'rgba(16, 185, 129, 0.35)';
          directionCard.style.boxShadow = '0 0 20px rgba(16, 185, 129, 0.15)';
        } else {
          directionCard.style.background = 'rgba(239, 68, 68, 0.08)';
          directionCard.style.borderColor = 'rgba(239, 68, 68, 0.35)';
          directionCard.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.15)';
        }
      }

      // 2. Probabilities & Meter
      if (primaryProbVal) primaryProbVal.textContent = `${data.confidence_score}%`;
      if (probUpVal) probUpVal.textContent = `${data.probability_up}%`;
      if (probDownVal) probDownVal.textContent = `${data.probability_down}%`;
      if (probUpBar) probUpBar.style.width = `${data.probability_up}%`;

      if (confidenceBadge) {
        confidenceBadge.textContent = data.confidence_label;
        if (data.confidence_score >= 65) {
          confidenceBadge.className = 'badge badge-success';
        } else if (data.confidence_score >= 55) {
          confidenceBadge.className = 'badge badge-warning';
        } else {
          confidenceBadge.className = 'badge badge-neutral';
        }
      }

      if (predDateLabel) predDateLabel.textContent = `Target Date: ${data.prediction_date}`;

      // 3. Performance Metrics
      if (metricAcc) metricAcc.textContent = `${(data.metrics.accuracy * 100).toFixed(1)}%`;
      if (metricRoc) metricRoc.textContent = data.metrics.roc_auc.toFixed(2);
      if (metricPrec) metricPrec.textContent = `${(data.metrics.precision * 100).toFixed(1)}%`;
      if (metricF1) metricF1.textContent = `${(data.metrics.f1_score * 100).toFixed(1)}%`;

      // 4. Executive Reasoning
      if (reasoningText) reasoningText.textContent = data.summary_reasoning;

      // 5. Feature Importance List
      if (importancesList && Array.isArray(data.feature_importances)) {
        importancesList.innerHTML = '';
        data.feature_importances.slice(0, 7).forEach((item) => {
          const row = document.createElement('div');
          row.style.background = 'var(--color-bg-subtle)';
          row.style.padding = '8px 12px';
          row.style.borderRadius = 'var(--radius-md)';
          row.style.border = '1px solid var(--color-border)';

          let catColor = 'var(--color-accent)';
          if (item.category === 'Market Sentiment') catColor = '#8b5cf6';
          if (item.category === 'Volume Dynamics') catColor = '#f59e0b';
          if (item.category === 'Historical Prices') catColor = '#06b6d4';

          row.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: var(--text-xs); margin-bottom: 4px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 600; color: var(--color-text-primary);">${item.feature_name}</span>
                <span style="font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,0.06); color: ${catColor}; border: 1px solid rgba(255,255,255,0.1);">${item.category}</span>
              </div>
              <span style="font-weight: 700; color: var(--color-text-primary);">${item.importance_pct}%</span>
            </div>
            <div style="height: 6px; width: 100%; background: var(--color-bg); border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; width: ${Math.min(100, item.importance_pct * 3.5)}%; background: ${catColor}; border-radius: 3px;"></div>
            </div>
          `;
          importancesList.appendChild(row);
        });
      }

      // 6. Historical Test Set Evaluations
      if (evalTbody && Array.isArray(data.historical_evaluations)) {
        evalTbody.innerHTML = '';
        data.historical_evaluations.forEach((item) => {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--color-border)';
          
          const isCorrect = item.is_correct;
          const predUp = item.predicted_direction === 'UP';
          const actUp = item.actual_direction === 'UP';

          tr.innerHTML = `
            <td style="padding: 6px 12px; font-weight: 500;">${item.date}</td>
            <td style="padding: 6px 12px; font-weight: 600; color: ${predUp ? '#10b981' : '#ef4444'};">${predUp ? '⬆️ UP' : '⬇️ DOWN'}</td>
            <td style="padding: 6px 12px; font-weight: 600; color: ${actUp ? '#10b981' : '#ef4444'};">${actUp ? 'UP' : 'DOWN'} (${item.actual_change_pct > 0 ? '+' : ''}${item.actual_change_pct}%)</td>
            <td style="padding: 6px 12px; font-weight: 500;">${item.probability_up}%</td>
            <td style="padding: 6px 12px;">
              <span class="badge ${isCorrect ? 'badge-success' : 'badge-danger'}" style="font-size: 10px; padding: 2px 6px;">
                ${isCorrect ? '✓ Correct' : '✗ Miss'}
              </span>
            </td>
          `;
          evalTbody.appendChild(tr);
        });
      }

    } catch (err) {
      console.error('Error loading ML Prediction:', err);
      if (reasoningText) reasoningText.textContent = `Failed to load prediction for ${currentSymbol}: ${err.message}`;
    }
  }

  function init() {
    const modelSelect = document.getElementById('ml-model-select');
    if (modelSelect) {
      modelSelect.addEventListener('change', (e) => {
        loadPrediction(currentSymbol, e.target.value);
      });
    }
  }

  return {
    init: init,
    loadPrediction: loadPrediction,
  };
})();
