(function () {
  const data = window.STORAGE_BESS_SURFACE_DATA;
  if (!data) return;

  const fmt = (value, digits = 2) => Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  const metricCards = document.getElementById("metric-cards");
  const scenarioSelect = document.getElementById("scenario-select");
  const scenarioTitle = document.getElementById("scenario-title");
  const scenarioSplit = document.getElementById("scenario-split");
  const dispatchChart = document.getElementById("dispatch-chart");
  const scoreChart = document.getElementById("score-chart");
  const code = document.getElementById("candidate-code");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function path(points) {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  }

  function renderMetrics() {
    const metrics = data.metrics;
    const cards = [
      ["Score reduction", fmt(metrics.improvement)],
      ["Avg uplift", `€${fmt(metrics.uplift_vs_quantile_dispatch_baseline_mean_eur)}/day`],
      ["Cycle-adjusted margin", `€${fmt(metrics.cycle_adjusted_margin_mean_eur)}`],
      ["Breaches", String(Math.round(metrics.constraint_breach_count))],
    ];
    metricCards.innerHTML = cards.map(([label, value]) => `
      <div class="storage-run-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join("");
  }

  function renderScore() {
    const steps = data.scoreTrace.steps;
    const scores = steps.map((step) => Number(step.score));
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const span = Math.max(max - min, 1);
    const points = steps.map((step, index) => [
      70 + index * 220,
      210 - ((Number(step.score) - min) / span) * 130,
      step,
    ]);
    scoreChart.innerHTML = `
      <path class="storage-grid" d="M54 88H580M54 153H580M54 218H580"/>
      <path class="storage-axis" d="M54 54V218H580"/>
      <path class="storage-score-line" d="${path(points)}"/>
      ${points.map(([x, y, step], index) => `
        <circle class="storage-score-dot${index === points.length - 1 ? " storage-score-dot--accepted" : ""}" cx="${x}" cy="${y}" r="${index === points.length - 1 ? "7.5" : "6.5"}"></circle>
        <text class="storage-score-value" x="${x}" y="${y - 14}" text-anchor="middle">${fmt(step.score, 1)}</text>
        <text class="storage-chart-tick" x="${x}" y="242" text-anchor="middle">${escapeHtml(step.label)}</text>
      `).join("")}
      <text class="storage-chart-label" x="54" y="30">Score trace</text>
    `;
  }

  function renderScenario(scenarioId) {
    const scenario = data.dispatch.scenarios.find((item) => item.scenario_id === scenarioId) || data.dispatch.scenarios[0];
    const comparison = data.comparison.rows.find((item) => item.scenario_id === scenario.scenario_id);
    scenarioTitle.textContent = `${scenario.scenario_id} · €${fmt(comparison.candidate_profit_eur)} candidate profit`;
    scenarioSplit.textContent = `${scenario.split} · uplift €${fmt(comparison.uplift_vs_comparison_baseline_eur)} · baseline €${fmt(comparison.baseline_profit_eur)} · regret €${fmt(comparison.regret_eur)}`;

    const hours = scenario.hours;
    const prices = hours.map((hour) => Number(hour.price_eur_per_mwh));
    const soc = hours.map((hour) => Number(hour.candidate_soc_mwh));
    const action = hours.map((hour) => Number(hour.candidate_discharge_mw) - Number(hour.candidate_charge_mw));
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceSpan = Math.max(maxPrice - minPrice, 1);
    const mapX = (index) => 58 + index * (780 / 23);
    const pricePoints = prices.map((price, index) => [mapX(index), 250 - ((price - minPrice) / priceSpan) * 170]);
    const socPoints = soc.map((value, index) => [mapX(index), 312 - (value / 4) * 220]);
    const bars = action.map((value, index) => {
      const x = mapX(index) - 6;
      const height = Math.abs(value) * 54;
      const y = value >= 0 ? 330 - height : 330;
      const cls = value >= 0 ? "storage-discharge-bar" : "storage-charge-bar";
      return `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="10" height="${height.toFixed(1)}"></rect>`;
    }).join("");

    dispatchChart.innerHTML = `
      <path class="storage-grid" d="M58 88H838M58 148H838M58 208H838M58 270H838"/>
      <path class="storage-axis" d="M58 330H838M58 54V330"/>
      ${bars}
      <path class="storage-price-line" d="${path(pricePoints)}"/>
      <path class="storage-soc-line" d="${path(socPoints)}"/>
      <text class="storage-chart-legend" x="58" y="30">price</text>
      <line class="storage-price-line" x1="98" y1="26" x2="128" y2="26"/>
      <text class="storage-chart-legend" x="154" y="30">SOC</text>
      <line class="storage-soc-line" x1="190" y1="26" x2="220" y2="26"/>
      <rect class="storage-charge-bar" x="250" y="18" width="12" height="14"></rect>
      <text class="storage-chart-legend" x="270" y="30">charge</text>
      <rect class="storage-discharge-bar" x="330" y="18" width="12" height="14"></rect>
      <text class="storage-chart-legend" x="350" y="30">discharge</text>
      <text class="storage-chart-label" x="58" y="390">Hour of day</text>
      <text class="storage-chart-label" x="20" y="202" transform="rotate(-90 20 202)">Dispatch / price / SOC</text>
      ${hours.filter((_, index) => index % 4 === 0).map((hour) => `
        <text class="storage-chart-tick" x="${mapX(hour.hour)}" y="360" text-anchor="middle">${hour.hour}</text>
      `).join("")}
    `;
  }

  function init() {
    renderMetrics();
    renderScore();
    code.textContent = data.candidateCode;
    scenarioSelect.innerHTML = data.dispatch.scenarios.map((scenario) => `
      <option value="${escapeHtml(scenario.scenario_id)}">${escapeHtml(scenario.scenario_id)} · ${escapeHtml(scenario.split)}</option>
    `).join("");
    scenarioSelect.addEventListener("change", () => renderScenario(scenarioSelect.value));
    const defaultScenario = data.dispatch.scenarios.find((scenario) => scenario.split === "stress_tail") || data.dispatch.scenarios[0];
    scenarioSelect.value = defaultScenario.scenario_id;
    renderScenario(defaultScenario.scenario_id);
  }

  init();
})();
