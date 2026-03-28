(function () {
  const data = window.STORAGE_SURFACE_DATA;
  if (!data || !Array.isArray(data.steps) || !data.steps.length) {
    return;
  }

  function buildOps(before, after) {
    const ops = [];
    let i = 0;
    let j = 0;

    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && before[i] === after[j]) {
        ops.push({ tag: "equal", text: before[i], before_index: i, after_index: j });
        i += 1;
        j += 1;
        continue;
      }

      const nextAfterInBefore = j < after.length ? before.indexOf(after[j], i + 1) : -1;
      const nextBeforeInAfter = i < before.length ? after.indexOf(before[i], j + 1) : -1;

      if (
        i < before.length &&
        (
          j >= after.length ||
          (
            nextAfterInBefore !== -1 &&
            (nextBeforeInAfter === -1 || nextAfterInBefore - i <= nextBeforeInAfter - j)
          )
        )
      ) {
        ops.push({ tag: "delete", text: before[i], before_index: i, after_index: null });
        i += 1;
        continue;
      }

      if (j < after.length) {
        ops.push({ tag: "insert", text: after[j], before_index: null, after_index: j });
        j += 1;
        continue;
      }

      break;
    }

    return ops;
  }

  const steps = data.steps.map((step, index) => {
    const beforeLines = index === 0 ? step.code.split("\n") : data.steps[index - 1].code.split("\n");
    const afterLines = step.code.split("\n");
    return {
      ...step,
      before_lines: beforeLines,
      after_lines: afterLines,
      ops: buildOps(beforeLines, afterLines),
    };
  });
  const finalStepLabel = steps[steps.length - 1].label;

  const metricStep = document.getElementById("metric-step");
  const metricGen = document.getElementById("metric-gen");
  const metricGenerations = document.getElementById("metric-generations");
  const metricValid = document.getElementById("metric-valid");
  const metricSeed = document.getElementById("metric-seed");
  const metricBest = document.getElementById("metric-best");
  const editorBody = document.getElementById("editor-body");
  const editorFocus = document.getElementById("editor-focus");
  const editorBadge = document.getElementById("editor-badge");
  const scoreMiniSvg = document.getElementById("score-mini-svg");
  const scoreMiniLabel = document.getElementById("score-mini-label");
  const dispatchSvg = document.getElementById("dispatch-svg");
  const scenarioGrid = document.getElementById("scenario-grid");
  const dispatchScenarioTitle = document.getElementById("dispatch-scenario-title");
  const dispatchScenarioMeta = document.getElementById("dispatch-scenario-meta");
  const editorLinePool = [];

  const totalStepDuration = 4.8;
  const loopEndHoldDuration = 2.2;
  const totalDuration = steps.length * totalStepDuration + loopEndHoldDuration;

  metricValid.textContent = `${data.meta.evaluationsValid} / ${data.meta.evaluationsTotal}`;
  if (metricGenerations) {
    metricGenerations.textContent = `${data.meta.generations}`;
  }
  metricSeed.textContent = data.meta.seedScore.toFixed(3);
  metricBest.textContent = data.meta.bestScore.toFixed(3);
  dispatchScenarioTitle.textContent = data.dispatchSnapshots.seed.title;
  dispatchScenarioMeta.textContent = data.dispatchSnapshots.seed.note;

  const maxVisibleChars = Math.max(...steps.flatMap((step) => step.ops.map((op) => (op.text || "").length)));

  function getEditorLayoutForLineCount(lineCount) {
    let pitch = 30;
    if (lineCount > 60) {
      pitch = 21;
    } else if (lineCount > 52) {
      pitch = 23;
    } else if (lineCount > 44) {
      pitch = 26;
    }
    const lineHeight = Math.max(16, pitch - 6);
    const bodyHeight = Math.max(280, 24 + lineCount * pitch);
    const fontSize = maxVisibleChars > 100 || lineCount > 56
      ? 10.2
      : lineCount > 46
        ? 10.75
        : 11.35;
    return { pitch, lineHeight, bodyHeight, fontSize };
  }

  function applyEditorLayout(step, settleT) {
    const previousLayout = getEditorLayoutForLineCount(step.before_lines.length);
    const currentLayout = getEditorLayoutForLineCount(step.after_lines.length);
    const layout = {
      pitch: mix(previousLayout.pitch, currentLayout.pitch, settleT),
      lineHeight: mix(previousLayout.lineHeight, currentLayout.lineHeight, settleT),
      bodyHeight: mix(previousLayout.bodyHeight, currentLayout.bodyHeight, settleT),
      fontSize: mix(previousLayout.fontSize, currentLayout.fontSize, settleT),
      previousPitch: previousLayout.pitch,
      currentPitch: currentLayout.pitch,
    };
    editorBody.style.height = `${layout.bodyHeight}px`;
    editorBody.style.setProperty("--editor-font-size", `${layout.fontSize}px`);
    editorBody.style.setProperty("--editor-line-height", `${layout.lineHeight}px`);
    return layout;
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function buildEditorLine(op) {
    const line = document.createElement("div");
    line.className = `storage-editor-line ${op.tag}`;
    line.innerHTML = `
      <span class="ln">${op.after_index !== null ? op.after_index + 1 : op.before_index + 1}</span>
      <span class="pm">${op.tag === "equal" ? "" : op.tag === "delete" ? "-" : "+"}</span>
      <span class="code"></span>
    `;
    line.querySelector(".code").textContent = op.text;
    return line;
  }

  function ensureEditorLinePool(size) {
    while (editorLinePool.length < size) {
      const line = buildEditorLine({ tag: "equal", text: "", before_index: 0, after_index: 0 });
      editorBody.appendChild(line);
      editorLinePool.push(line);
    }
  }

  function syncEditorLine(line, op) {
    const nextClass = `storage-editor-line ${op.tag}`;
    if (line.className !== nextClass) {
      line.className = nextClass;
    }

    const ln = line.querySelector(".ln");
    const pm = line.querySelector(".pm");
    const code = line.querySelector(".code");
    const nextLn = String(op.after_index !== null ? op.after_index + 1 : op.before_index + 1);
    const nextPm = op.tag === "equal" ? "" : op.tag === "delete" ? "-" : "+";

    if (ln.textContent !== nextLn) {
      ln.textContent = nextLn;
    }
    if (pm.textContent !== nextPm) {
      pm.textContent = nextPm;
    }
    if (code.textContent !== op.text) {
      code.textContent = op.text;
    }
  }

  function renderCode(stepIndex, localT) {
    const step = steps[stepIndex];
    const ops = step.ops;
    const deleteT = ease(clamp((localT - 0.18) / 0.22, 0, 1));
    const insertT = ease(clamp((localT - 0.42) / 0.26, 0, 1));
    const settleT = ease(clamp((localT - 0.42) / 0.16, 0, 1));
    const layout = applyEditorLayout(step, settleT);

    const changedOnly = ops.filter((op) => op.tag !== "equal");
    if (changedOnly.length) {
      const changedIndices = changedOnly.flatMap((op) => [op.before_index, op.after_index].filter((value) => value !== null));
      const minIdx = Math.min(...changedIndices);
      const maxIdx = Math.max(...changedIndices);
      const focusTop = mix(12 + minIdx * layout.previousPitch - 6, 12 + minIdx * layout.currentPitch - 6, settleT);
      const focusHeight = mix(
        (maxIdx - minIdx + 1) * layout.previousPitch + 10,
        (maxIdx - minIdx + 1) * layout.currentPitch + 10,
        settleT
      );
      editorFocus.style.opacity = "1";
      editorFocus.style.top = `${focusTop}px`;
      editorFocus.style.height = `${focusHeight}px`;
    } else {
      editorFocus.style.opacity = "0";
    }

    ensureEditorLinePool(ops.length);

    for (let index = 0; index < ops.length; index += 1) {
      const op = ops[index];
      const line = editorLinePool[index];
      syncEditorLine(line, op);
      const beforeY = op.before_index === null ? null : 12 + op.before_index * layout.previousPitch;
      const afterY = op.after_index === null ? null : 12 + op.after_index * layout.currentPitch;
      line.style.display = "";

      if (op.tag === "equal") {
        line.style.transform = `translateY(${mix(beforeY, afterY, settleT)}px)`;
        line.style.opacity = "1";
      } else if (op.tag === "delete") {
        line.style.transform = `translateY(${beforeY - deleteT * 12}px)`;
        line.style.opacity = `${1 - deleteT}`;
      } else {
        const y = mix(afterY + 8, afterY, settleT);
        line.style.transform = `translateY(${y}px)`;
        line.style.opacity = `${insertT}`;
      }
    }

    for (let index = ops.length; index < editorLinePool.length; index += 1) {
      const line = editorLinePool[index];
      line.style.display = "none";
      line.style.opacity = "0";
    }
  }

  function updateMetrics(stepIndex, step) {
    metricStep.textContent = `${stepIndex} / ${Math.max(0, steps.length - 1)}`;
    metricGen.textContent = `${step.generation}`;
  }

  function phaseFor(localT) {
    if (localT < 0.18) return "hold";
    if (localT < 0.4) return "delete";
    if (localT < 0.68) return "insert";
    return "settle";
  }

  function updatePhaseUI(stepIndex, phase) {
    const step = steps[stepIndex];
    editorBadge.textContent = stepIndex === 0 ? "seed" : `gen ${step.generation} · ${phase}`;
    editorBadge.classList.toggle("is-phase", stepIndex !== 0);
  }

  function renderMiniScore(stepIndex, morph) {
    const accent = cssVar("--accent", "#0a84ff");
    const accentSoft = cssVar("--accent-soft", "rgba(10,132,255,0.10)");
    const bg = cssVar("--bg", "#ffffff");
    const width = 340;
    const height = 108;
    const pad = { left: 6, right: 6, top: 8, bottom: 14 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const scoreMin = Math.min(...steps.map((step) => step.score));
    const scoreMax = Math.max(...steps.map((step) => step.score));
    const xAt = (index) => pad.left + plotW * (index / Math.max(1, steps.length - 1));
    const yAt = (score) => {
      const norm = (score - scoreMin) / Math.max(1e-9, scoreMax - scoreMin);
      return pad.top + plotH - norm * plotH;
    };
    const path = steps.map((step, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(step.score)}`).join(" ");
    const areaPath = `${path} L ${xAt(steps.length - 1)} ${pad.top + plotH} L ${xAt(0)} ${pad.top + plotH} Z`;
    const markerX = mix(xAt(Math.max(0, stepIndex - 1)), xAt(stepIndex), morph);
    const markerY = mix(yAt(steps[Math.max(0, stepIndex - 1)].score), yAt(steps[stepIndex].score), morph);

    scoreMiniSvg.innerHTML = `
      <path d="${areaPath}" fill="${accentSoft}" />
      <path d="${path}" fill="none" stroke="${accent}" stroke-width="2" />
      <circle cx="${markerX}" cy="${markerY}" r="4.2" fill="${bg}" stroke="${accent}" stroke-width="2" />
    `;
    scoreMiniLabel.textContent = `best ${steps[stepIndex].score.toFixed(3)}`;
  }

  function renderDispatch(stepIndex, morph) {
    const current = steps[stepIndex];
    const previous = steps[Math.max(0, stepIndex - 1)];
    const currentSnapshot = data.dispatchSnapshots[current.label] || data.dispatchSnapshots[finalStepLabel];
    const previousSnapshot = data.dispatchSnapshots[previous.label] || currentSnapshot;
    const priceSeries = currentSnapshot.prices_eur_per_mwh.map((value, index) => mix(previousSnapshot.prices_eur_per_mwh[index], value, morph));
    const charge = currentSnapshot.charge_mw.map((value, index) => mix(previousSnapshot.charge_mw[index], value, morph));
    const discharge = currentSnapshot.discharge_mw.map((value, index) => mix(previousSnapshot.discharge_mw[index], value, morph));
    const soc = currentSnapshot.soc_mwh.map((value, index) => mix(previousSnapshot.soc_mwh[index], value, morph));
    const priceColor = cssVar("--price", "#0a0a0a");
    const priceAreaColor = cssVar("--price-area", "rgba(10, 132, 255, 0.08)");
    const chargeColor = cssVar("--charge", "#17864b");
    const dischargeColor = cssVar("--discharge", "#cb3d3d");
    const socColor = cssVar("--soc", "#0a84ff");
    const line = cssVar("--line-strong", "rgba(10,10,10,0.16)");
    const muted = cssVar("--muted", "#6a6a6a");
    const width = 340;
    const height = 300;
    const pad = { left: 20, right: 16, top: 18, bottom: 24 };
    const plotW = width - pad.left - pad.right;
    const priceTop = 16;
    const priceHeight = 116;
    const actionTop = 148;
    const actionHeight = 48;
    const socTop = 210;
    const socHeight = 58;
    const priceMin = Math.min(...priceSeries);
    const priceMax = Math.max(...priceSeries);
    const xAt = (index) => pad.left + plotW * (index / Math.max(1, priceSeries.length - 1));
    const yPrice = (value) => priceTop + priceHeight - ((value - priceMin) / Math.max(1e-9, priceMax - priceMin)) * priceHeight;
    const ySoc = (value) => socTop + socHeight - (value / 4) * socHeight;
    const pricePath = priceSeries.map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yPrice(value)}`).join(" ");
    const priceArea = `${pricePath} L ${xAt(priceSeries.length - 1)} ${priceTop + priceHeight} L ${xAt(0)} ${priceTop + priceHeight} Z`;
    const socPath = soc.map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${ySoc(value)}`).join(" ");

    const bars = charge.map((value, index) => {
      const x = xAt(index);
      const barW = 8;
      const chargeH = Math.max(0, (value / 1) * actionHeight);
      const dischargeH = Math.max(0, (discharge[index] / 1) * actionHeight);
      return `
        <rect x="${x - barW - 1}" y="${actionTop + actionHeight - chargeH}" width="${barW}" height="${chargeH}" fill="${chargeColor}" rx="2" />
        <rect x="${x + 1}" y="${actionTop + actionHeight - dischargeH}" width="${barW}" height="${dischargeH}" fill="${dischargeColor}" rx="2" />
      `;
    }).join("");

    dispatchScenarioTitle.textContent = currentSnapshot.title;
    dispatchScenarioMeta.textContent = currentSnapshot.note;

    dispatchSvg.innerHTML = `
      <path d="${priceArea}" fill="${priceAreaColor}" />
      <path d="${pricePath}" fill="none" stroke="${priceColor}" stroke-width="1.6" />
      <line x1="${pad.left}" y1="${actionTop + actionHeight}" x2="${width - pad.right}" y2="${actionTop + actionHeight}" stroke="${line}" stroke-width="1" />
      <line x1="${pad.left}" y1="${socTop + socHeight}" x2="${width - pad.right}" y2="${socTop + socHeight}" stroke="${line}" stroke-width="1" />
      ${bars}
      <path d="${socPath}" fill="none" stroke="${socColor}" stroke-width="2.2" />
      <text x="${pad.left}" y="${priceTop - 2}" fill="${muted}" font-size="11">price EUR/MWh</text>
      <text x="${pad.left}" y="${actionTop - 4}" fill="${muted}" font-size="11">dispatch MW</text>
      <text x="${pad.left}" y="${socTop - 4}" fill="${muted}" font-size="11">state of charge MWh</text>
      <text x="${width - pad.right}" y="${priceTop - 2}" fill="${muted}" font-size="11" text-anchor="end">capture ${(current.oracle_capture_ratio * 100).toFixed(1)}%</text>
      <text x="${width - pad.right}" y="${socTop - 4}" fill="${muted}" font-size="11" text-anchor="end">regret ${current.regret_mean_eur.toFixed(1)} EUR</text>
    `;
  }

  function renderScenarioCards(stepIndex, morph) {
    const current = steps[stepIndex];
    const previous = steps[Math.max(0, stepIndex - 1)];
    const currentSnapshot = data.scenarioSnapshots[current.label] || {};
    const previousSnapshot = data.scenarioSnapshots[previous.label] || currentSnapshot;
    const currentDispatchScenario = (data.dispatchSnapshots[current.label] || {}).id || data.focusScenario.id;
    const referenceSnapshot = data.scenarioSnapshots[finalStepLabel] || currentSnapshot;
    const maxCapture = Math.max(...Object.values(referenceSnapshot).map((scenario) => scenario.oracle_capture_ratio));
    scenarioGrid.innerHTML = "";
    for (const scenario of data.scenarios) {
      const prevMetrics = previousSnapshot[scenario.id] || currentSnapshot[scenario.id] || scenario;
      const currMetrics = currentSnapshot[scenario.id] || scenario;
      const capture = mix(prevMetrics.oracle_capture_ratio, currMetrics.oracle_capture_ratio, morph);
      const profit = mix(prevMetrics.candidate_profit_eur, currMetrics.candidate_profit_eur, morph);
      const regret = mix(prevMetrics.regret_eur, currMetrics.regret_eur, morph);
      const card = document.createElement("article");
      card.className = "storage-scenario-card";
      const fill = `${(capture / maxCapture) * 100}%`;
      const isFocus = scenario.id === currentDispatchScenario;
      const activeClass = isFocus ? " style=\"border-color: rgba(10,132,255,0.22); background: color-mix(in srgb, var(--panel) 92%, rgba(10,132,255,0.05));\"" : "";
      card.innerHTML = `
        <div class="storage-scenario-head">
          <strong>${scenario.market_date}</strong>
          <span>${(capture * 100).toFixed(1)}% capture</span>
        </div>
        <div class="storage-scenario-meter"${activeClass}>
          <div class="storage-scenario-meter-fill" style="width:${fill}"></div>
        </div>
        <div class="storage-scenario-meta">
          <span>profit ${profit.toFixed(1)} EUR</span>
          <span>regret ${regret.toFixed(1)}</span>
        </div>
      `;
      if (isFocus) {
        card.style.borderColor = "rgba(10,132,255,0.22)";
      }
      scenarioGrid.appendChild(card);
    }
  }

  function renderFrame(now) {
    const t = (now / 1000) % totalDuration;
    const inEndHold = t >= steps.length * totalStepDuration;
    const effectiveT = inEndHold ? (steps.length * totalStepDuration) - 1e-6 : t;
    const stepIndex = Math.min(steps.length - 1, Math.floor(effectiveT / totalStepDuration));
    const localT = inEndHold ? 0.999 : (effectiveT % totalStepDuration) / totalStepDuration;
    const morph = ease(clamp((localT - 0.38) / 0.52, 0, 1));
    const phase = phaseFor(localT);

    updateMetrics(stepIndex, steps[stepIndex]);
    updatePhaseUI(stepIndex, phase);
    renderCode(stepIndex, localT);
    renderMiniScore(stepIndex, morph);
    renderDispatch(stepIndex, morph);
    renderScenarioCards(stepIndex, morph);

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
})();
