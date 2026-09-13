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
  const scenarioLive = document.getElementById("scenario-live");
  const scenarioSummary = document.getElementById("selected-scenario-summary");
  const scenarioHourlyRows = document.getElementById("scenario-hourly-rows");
  const dispatchChartSummary = document.getElementById("dispatch-chart-summary");
  const dispatchChart = document.getElementById("dispatch-chart");
  const scoreChart = document.getElementById("score-chart");
  const code = document.getElementById("candidate-code");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function humanizeId(value) {
    return String(value ?? "").replace(/_/g, " ");
  }

  function yesNo(value) {
    return value ? "yes" : "no";
  }

  function path(points) {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  }

  function renderMetrics() {
    const metrics = data.metrics;
    const cards = [
      ["Quantile baseline score", `${fmt(metrics.seed)} score units`],
      ["Accepted score", `${fmt(metrics.best)} score units`],
      ["Absolute score delta", `${fmt(metrics.improvement)} score units`],
      ["Relative score reduction", `${fmt(metrics.improvement_pct)}%`],
      ["Mean gross uplift vs quantile", `€${fmt(metrics.uplift_vs_quantile_dispatch_baseline_mean_eur)}/day`],
      ["Cycle-adjusted margin", `€${fmt(metrics.cycle_adjusted_margin_mean_eur)}/day`],
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

  function renderScenarioText(scenario, comparison) {
    const baselineId = comparison.comparison_baseline_id || data.comparison.comparison_baseline_id;
    const summaryItems = [
      ["Scenario", scenario.scenario_id],
      ["Split", scenario.split],
      ["Market date", comparison.market_date],
      ["Candidate profit", `€${fmt(comparison.candidate_profit_eur)}`],
      [`Baseline · ${humanizeId(baselineId)}`, `€${fmt(comparison.baseline_profit_eur)}`],
      ["Uplift vs baseline", `€${fmt(comparison.uplift_vs_comparison_baseline_eur)}`],
      ["Regret vs oracle", `€${fmt(comparison.regret_eur)}`],
      ["Cycle-adjusted margin", `€${fmt(comparison.candidate_cycle_adjusted_margin_eur)}`],
      ["Cycles used", fmt(comparison.cycles_used, 3)],
      ["Terminal SOC error", fmt(comparison.terminal_soc_error, 3)],
      ["Feasibility penalty", fmt(comparison.feasibility_penalty, 3)],
      ["Simultaneous-power penalty", fmt(comparison.simultaneous_power_penalty, 3)],
      ["Constraint breached", yesNo(comparison.constraint_breached)],
      ["Replay valid", yesNo(comparison.valid)],
    ];

    scenarioSummary.innerHTML = summaryItems.map(([label, value]) => `
      <div>
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>
    `).join("");

    scenarioHourlyRows.innerHTML = scenario.hours.map((hour) => {
      const charge = Number(hour.candidate_charge_mw);
      const discharge = Number(hour.candidate_discharge_mw);
      const netAction = discharge - charge;
      return `
        <tr>
          <th scope="row">${escapeHtml(hour.hour)}</th>
          <td>${fmt(hour.price_eur_per_mwh, 2)}</td>
          <td>${fmt(charge, 3)}</td>
          <td>${fmt(discharge, 3)}</td>
          <td>${fmt(netAction, 3)}</td>
          <td>${fmt(hour.candidate_soc_mwh, 3)}</td>
        </tr>
      `;
    }).join("");
  }

  function announceScenario(scenario, comparison) {
    const baselineId = comparison.comparison_baseline_id || data.comparison.comparison_baseline_id;
    const constraintState = comparison.constraint_breached ? "constraint breach recorded" : "no constraint breach";
    const validity = comparison.valid ? "replay valid" : "replay invalid";
    scenarioLive.textContent = `${scenario.scenario_id} selected. Candidate profit €${fmt(comparison.candidate_profit_eur)}; uplift €${fmt(comparison.uplift_vs_comparison_baseline_eur)} versus ${humanizeId(baselineId)}; regret €${fmt(comparison.regret_eur)}; ${constraintState}; ${validity}. 24 hourly rows updated.`;
  }

  function renderScenario(scenarioId, { announce = false } = {}) {
    const scenario = data.dispatch.scenarios.find((item) => item.scenario_id === scenarioId) || data.dispatch.scenarios[0];
    const comparison = data.comparison.rows.find((item) => item.scenario_id === scenario.scenario_id);
    if (!comparison) return;

    scenarioTitle.textContent = `${scenario.scenario_id} · €${fmt(comparison.candidate_profit_eur)} candidate profit`;
    scenarioSplit.textContent = `${scenario.split} · uplift €${fmt(comparison.uplift_vs_comparison_baseline_eur)} · baseline €${fmt(comparison.baseline_profit_eur)} · regret €${fmt(comparison.regret_eur)}`;
    renderScenarioText(scenario, comparison);

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

    dispatchChart.setAttribute("aria-label", `Dispatch trace for ${scenario.scenario_id}`);
    dispatchChartSummary.textContent = `${scenario.scenario_id} is a frozen 24-hour ${scenario.split} scenario. The chart uses a solid price line, a dashed state-of-charge line, dashed-border charge bars below the zero-dispatch axis, and solid-border discharge bars above it. Candidate profit is €${fmt(comparison.candidate_profit_eur)}, uplift versus the comparison baseline is €${fmt(comparison.uplift_vs_comparison_baseline_eur)}, and regret versus the oracle is €${fmt(comparison.regret_eur)}. The complete hourly values are available in the textual replay table below. This offline benchmark excludes intraday, reserves, imbalance, taxes, grid and portfolio effects.`;

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

    if (announce) announceScenario(scenario, comparison);
  }

  function init() {
    renderMetrics();
    renderScore();
    code.textContent = data.candidateCode;
    scenarioSelect.innerHTML = data.dispatch.scenarios.map((scenario) => `
      <option value="${escapeHtml(scenario.scenario_id)}">${escapeHtml(scenario.scenario_id)} · ${escapeHtml(scenario.split)}</option>
    `).join("");
    scenarioSelect.addEventListener("change", () => renderScenario(scenarioSelect.value, { announce: true }));
    const defaultScenario = data.dispatch.scenarios.find((scenario) => scenario.split === "stress_tail") || data.dispatch.scenarios[0];
    scenarioSelect.value = defaultScenario.scenario_id;
    scenarioLive.textContent = "";
    renderScenario(defaultScenario.scenario_id);
  }

  init();
})();
