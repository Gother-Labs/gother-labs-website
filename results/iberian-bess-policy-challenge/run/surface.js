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
      <path d="M54 218H580M54 54V218" fill="none" stroke="currentColor" stroke-width="1"/>
      <path d="${path(points)}" fill="none" stroke="#0f766e" stroke-width="4"/>
      ${points.map(([x, y, step]) => `
        <circle cx="${x}" cy="${y}" r="7" fill="#0f766e"></circle>
        <text x="${x}" y="${y - 14}" text-anchor="middle" font-size="13">${fmt(step.score, 1)}</text>
        <text x="${x}" y="242" text-anchor="middle" font-size="12">${escapeHtml(step.label)}</text>
      `).join("")}
    `;
  }

  function renderScenario(scenarioId) {
    const scenario = data.dispatch.scenarios.find((item) => item.scenario_id === scenarioId) || data.dispatch.scenarios[0];
    const comparison = data.comparison.rows.find((item) => item.scenario_id === scenario.scenario_id);
    scenarioTitle.textContent = `${scenario.scenario_id} · €${fmt(comparison.candidate_profit_eur)} candidate profit`;
    scenarioSplit.textContent = `${scenario.split} · uplift €${fmt(comparison.uplift_vs_comparison_baseline_eur)}`;

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
      const fill = value >= 0 ? "#0f766e" : "#b45309";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="10" height="${height.toFixed(1)}" fill="${fill}" opacity="0.68"></rect>`;
    }).join("");

    dispatchChart.innerHTML = `
      <path d="M58 330H838M58 54V330" fill="none" stroke="currentColor" stroke-width="1"/>
      ${bars}
      <path d="${path(pricePoints)}" fill="none" stroke="#0f766e" stroke-width="3"/>
      <path d="${path(socPoints)}" fill="none" stroke="#2563eb" stroke-width="3"/>
      <text x="58" y="30" font-size="14" fill="#0f766e">Price EUR/MWh</text>
      <text x="192" y="30" font-size="14" fill="#2563eb">State of charge MWh</text>
      <text x="372" y="30" font-size="14" fill="#b45309">Charge</text>
      <text x="442" y="30" font-size="14" fill="#0f766e">Discharge</text>
      ${hours.filter((_, index) => index % 4 === 0).map((hour) => `
        <text x="${mapX(hour.hour)}" y="360" text-anchor="middle" font-size="12">${hour.hour}</text>
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
