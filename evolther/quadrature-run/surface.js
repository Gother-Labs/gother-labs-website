(function () {
  const data = window.QUADRATURE_SURFACE_DATA;

  if (!data || !Array.isArray(data.steps)) {
    return;
  }

  const allSteps = data.steps;

  function buildOps(before, after) {
    const ops = [];
    let i = 0;
    let j = 0;

    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && before[i] === after[j]) {
        ops.push({
          tag: "equal",
          text: before[i],
          before_index: i,
          after_index: j,
        });
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
        ops.push({
          tag: "delete",
          text: before[i],
          before_index: i,
          after_index: null,
        });
        i += 1;
        continue;
      }

      if (j < after.length) {
        ops.push({
          tag: "insert",
          text: after[j],
          before_index: null,
          after_index: j,
        });
        j += 1;
        continue;
      }

      break;
    }

    return ops;
  }

  const steps = [];
  let bestSeen = Infinity;
  for (const sourceStep of allSteps) {
    if (sourceStep.score < bestSeen - 1e-6) {
      const previousShown = steps[steps.length - 1];
      const beforeLines = previousShown ? previousShown.after_lines : sourceStep.before_lines;
      const chainedStep = {
        ...sourceStep,
        before_lines: beforeLines,
        ops: buildOps(beforeLines, sourceStep.after_lines),
      };
      steps.push(chainedStep);
      bestSeen = sourceStep.score;
    }
  }

  if (!steps.length) {
    return;
  }

  const meta = {
    generations: data.meta?.generations ?? 100,
    seedScore: data.meta?.seed_score ?? steps[0].score,
    bestScore: data.meta?.best_score ?? Math.min(...steps.map((step) => step.score)),
  };

  const metricStep = document.getElementById("metric-step");
  const metricGen = document.getElementById("metric-gen");
  const signalGains = document.getElementById("signal-gains");
  const signalSeed = document.getElementById("signal-seed");
  const signalBest = document.getElementById("signal-best");
  const editorBody = document.getElementById("editor-body");
  const editorFocus = document.getElementById("editor-focus");
  const editorBadge = document.getElementById("editor-badge");
  const ruleSvg = document.getElementById("rule-svg");
  const scoreMiniSvg = document.getElementById("score-mini-svg");
  const scoreMiniLabel = document.getElementById("score-mini-label");
  const integrandsGrid = document.getElementById("integrands-grid");
  const editorLinePool = [];

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  signalGains.textContent = `${Math.max(0, steps.length - 1)}`;
  signalSeed.textContent = `${meta.seedScore.toFixed(3)}`;
  signalBest.textContent = `${meta.bestScore.toFixed(3)}`;

  const totalStepDuration = 4.8;
  const loopEndHoldDuration = 2.2;
  const totalDuration = steps.length * totalStepDuration + loopEndHoldDuration;

  const scoreMin = Math.min(...steps.map((step) => step.score));
  const scoreMax = Math.max(...steps.map((step) => step.score));
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
        : 11.4;
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

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function sampleFunction(name, x) {
    if (name === "sin_pi") return Math.sin(Math.PI * x);
    if (name === "sqrt") return Math.sqrt(x);
    if (name === "log1p") return Math.log1p(x);
    return x;
  }

  function buildEditorLine(op) {
    const line = document.createElement("div");
    line.className = `quadrature-editor-line ${op.tag}`;
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
    const nextClass = `quadrature-editor-line ${op.tag}`;
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
        const moveT = settleT;
        const y = mix(beforeY, afterY, moveT);
        line.style.transform = `translateY(${y}px)`;
        line.style.opacity = "1";
      } else if (op.tag === "delete") {
        const y = beforeY - deleteT * 12;
        line.style.transform = `translateY(${y}px)`;
        line.style.opacity = `${1 - deleteT}`;
      } else {
        const enter = insertT;
        const moveT = settleT;
        const startY = afterY + 8;
        const y = mix(startY, afterY, moveT);
        line.style.transform = `translateY(${y}px)`;
        line.style.opacity = `${enter}`;
      }
    }

    for (let index = ops.length; index < editorLinePool.length; index += 1) {
      const line = editorLinePool[index];
      line.style.display = "none";
      line.style.opacity = "0";
    }
  }

  function interpolateStep(prev, curr, t) {
    const prevNodes = prev.nodes || [];
    const currNodes = curr.nodes || [];
    const prevWeights = prev.weights || [];
    const currWeights = curr.weights || [];
    return {
      nodes: currNodes.map((value, index) => mix(prevNodes[index] ?? value, value, t)),
      weights: currWeights.map((value, index) => mix(prevWeights[index] ?? value, value, t)),
      integrands: curr.integrands,
    };
  }

  function renderRule(interpolated) {
    const nodes = interpolated.nodes;
    const weights = interpolated.weights;
    const accent = cssVar("--accent", "#0a84ff");
    const muted = cssVar("--muted", "#6a6a6a");
    const line = cssVar("--line-strong", "rgba(10,10,10,0.16)");
    const width = 340;
    const axisY = 136;
    const left = 20;
    const right = width - 18;
    const top = 24;
    const lines = [];

    lines.push(`<line x1="${left}" y1="${axisY}" x2="${right}" y2="${axisY}" stroke="${line}" stroke-width="1" />`);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const x = left + (right - left) * node;
      const stemTop = axisY - Math.max(8, weights[i] * 90);
      lines.push(`<line x1="${x}" y1="${axisY}" x2="${x}" y2="${stemTop}" stroke="${accent}" stroke-width="1.4" />`);
      lines.push(`<circle cx="${x}" cy="${stemTop}" r="3.2" fill="${accent}" />`);
      lines.push(`<circle cx="${x}" cy="${axisY}" r="1.9" fill="${accent}" opacity="0.64" />`);
    }

    const sum = weights.reduce((a, b) => a + b, 0);
    const spread = Math.max(...nodes) - Math.min(...nodes);

    ruleSvg.innerHTML = `
      <svg viewBox="0 0 340 180" preserveAspectRatio="none">
        ${lines.join("")}
        <text x="${left}" y="${top}" fill="${muted}" font-size="11">weight sum ${sum.toFixed(3)}</text>
        <text x="${right}" y="${top}" fill="${muted}" font-size="11" text-anchor="end">spread ${spread.toFixed(3)}</text>
        <text x="${left}" y="${axisY + 16}" fill="${muted}" font-size="11">0</text>
        <text x="${right}" y="${axisY + 16}" fill="${muted}" font-size="11" text-anchor="end">1</text>
      </svg>
    `;
  }

  function renderMiniCharts(interpolated) {
    const nodes = interpolated.nodes;
    const integrands = interpolated.integrands;
    const accent = cssVar("--accent", "#0a84ff");

    integrandsGrid.innerHTML = "";

    for (const item of integrands) {
      const card = document.createElement("article");
      card.className = "quadrature-mini-chart";

      const xs = Array.from({ length: 40 }, (_, index) => index / 39);
      const width = 250;
      const height = 100;
      const pad = { left: 8, right: 8, top: 8, bottom: 18 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const values = xs.map((x) => sampleFunction(item.name, x));
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);
      const yFor = (value) => pad.top + plotH - ((value - minVal) / Math.max(1e-9, maxVal - minVal)) * plotH;
      const xFor = (x) => pad.left + x * plotW;
      const path = xs.map((x, index) => `${index === 0 ? "M" : "L"} ${xFor(x)} ${yFor(values[index])}`).join(" ");
      const dots = nodes.map((x) => {
        const y = sampleFunction(item.name, x);
        return `<circle cx="${xFor(x)}" cy="${yFor(y)}" r="3" fill="${accent}" />`;
      }).join("");

      card.innerHTML = `
        <div class="quadrature-mini-head">
          <strong>${item.name}</strong>
          <span>err ${item.error.toFixed(4)}</span>
        </div>
        <svg class="quadrature-mini-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="${item.name} quadrature view">
          <path d="${path}" fill="none" stroke="${accent}" stroke-width="1.5" />
          ${dots}
        </svg>
      `;
      integrandsGrid.appendChild(card);
    }
  }

  function updateMetrics(stepIndex, step) {
    metricStep.textContent = `${stepIndex} / ${Math.max(0, steps.length - 1)}`;
    metricGen.textContent = `${step.generation}`;
  }

  function phaseFor(localT) {
    if (localT < 0.18) return "hold";
    if (localT < 0.40) return "delete";
    if (localT < 0.68) return "insert";
    return "settle";
  }

  function updatePhaseUI(stepIndex, phase) {
    editorBadge.textContent = stepIndex === 0 ? "seed" : `accepted ${stepIndex} · ${phase}`;
    editorBadge.classList.toggle("is-phase", stepIndex !== 0);
  }

  function renderMiniScore(stepIndex, morph, displayedBest) {
    const accent = cssVar("--accent", "#0a84ff");
    const accentSoft = cssVar("--accent-soft", "rgba(10,132,255,0.10)");
    const bg = cssVar("--bg", "#ffffff");
    const width = 340;
    const height = 108;
    const pad = { left: 6, right: 6, top: 8, bottom: 14 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const xAt = (index) => pad.left + plotW * (index / Math.max(1, steps.length - 1));
    const yAt = (score) => {
      const norm = (score - scoreMin) / Math.max(1e-9, scoreMax - scoreMin);
      return pad.top + plotH - norm * plotH;
    };

    const bestVals = [];
    let best = Infinity;
    for (const step of steps) {
      best = Math.min(best, step.score);
      bestVals.push(best);
    }

    const areaPath = `${steps.map((step, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(bestVals[index])}`).join(" ")} L ${xAt(steps.length - 1)} ${pad.top + plotH} L ${xAt(0)} ${pad.top + plotH} Z`;
    const linePath = steps.map((step, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(bestVals[index])}`).join(" ");
    const markerX = mix(xAt(Math.max(0, stepIndex - 1)), xAt(stepIndex), morph);
    const markerY = mix(yAt(bestVals[Math.max(0, stepIndex - 1)]), yAt(bestVals[stepIndex]), morph);

    scoreMiniSvg.innerHTML = `
      <path d="${areaPath}" fill="${accentSoft}" />
      <path d="${linePath}" fill="none" stroke="${accent}" stroke-width="2" />
      <circle cx="${markerX}" cy="${markerY}" r="4.2" fill="${bg}" stroke="${accent}" stroke-width="2" />
    `;
    scoreMiniLabel.textContent = `best ${displayedBest.toFixed(3)}`;
  }

  function renderFrame(now) {
    const t = (now / 1000) % totalDuration;
    const inEndHold = t >= steps.length * totalStepDuration;
    const effectiveT = inEndHold ? (steps.length * totalStepDuration) - 1e-6 : t;
    const stepIndex = Math.min(steps.length - 1, Math.floor(effectiveT / totalStepDuration));
    const localT = inEndHold ? 0.999 : (effectiveT % totalStepDuration) / totalStepDuration;
    const prevStep = steps[Math.max(0, stepIndex - 1)];
    const currStep = steps[stepIndex];
    const phase = phaseFor(localT);
    const morph = ease(clamp((localT - 0.38) / 0.52, 0, 1));
    const previousBest = Math.min(...steps.slice(0, Math.max(1, stepIndex)).map((step) => step.score));
    const currentBest = Math.min(...steps.slice(0, stepIndex + 1).map((step) => step.score));
    const displayedBest = mix(previousBest, currentBest, morph);

    updateMetrics(stepIndex, currStep);
    updatePhaseUI(stepIndex, phase);
    renderCode(stepIndex, localT);
    renderMiniScore(stepIndex, morph, displayedBest);

    const interpolated = interpolateStep(prevStep, currStep, morph);
    renderRule(interpolated);
    renderMiniCharts(interpolated);

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
})();
