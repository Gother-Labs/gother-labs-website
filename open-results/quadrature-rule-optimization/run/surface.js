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

  function visibleCodeLines(lines) {
    return lines.filter((line) => !/^# EVOLVE_(START|END)/.test(line));
  }

  const steps = [];
  let bestSeen = Infinity;
  for (const sourceStep of allSteps) {
    if (sourceStep.score < bestSeen - 1e-6) {
      const previousShown = steps[steps.length - 1];
      const afterLines = visibleCodeLines(sourceStep.after_lines);
      const beforeLines = previousShown ? previousShown.after_lines : visibleCodeLines(sourceStep.before_lines);
      const chainedStep = {
        ...sourceStep,
        before_lines: beforeLines,
        after_lines: afterLines,
        ops: buildOps(beforeLines, afterLines),
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

  const scoreReduction = ((meta.seedScore - meta.bestScore) / Math.max(1e-9, meta.seedScore)) * 100;

  signalGains.textContent = `${scoreReduction.toFixed(2)}%`;
  signalSeed.textContent = `${meta.seedScore.toFixed(3)}`;
  signalBest.textContent = `${meta.bestScore.toFixed(3)}`;

  const totalStepDuration = 4.8;
  const loopEndHoldDuration = 2.2;
  const totalDuration = steps.length * totalStepDuration + loopEndHoldDuration;

  const scoreMin = Math.min(...allSteps.map((step) => step.score));
  const scoreMax = Math.max(...allSteps.map((step) => step.score));
  const maxVisibleChars = Math.max(...steps.flatMap((step) => step.ops.map((op) => (op.text || "").length)));
  const acceptedStep = allSteps.reduce((best, step) => (step.score < best.score ? step : best), allSteps[0]);
  const baselineStep = allSteps[0];
  const bestByTrace = [];
  let traceBest = Infinity;
  for (const step of allSteps) {
    traceBest = Math.min(traceBest, step.score);
    bestByTrace.push(traceBest);
  }

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

  function integrandNotation(name) {
    if (name === "sin_pi") {
      return { index: 1, expression: "sin(&pi;x)" };
    }
    if (name === "sqrt") {
      return { index: 2, expression: "&radic;x" };
    }
    if (name === "log1p") {
      return { index: 3, expression: "log(1+x)" };
    }
    return { index: 0, expression: name };
  }

  function formatObjective(value) {
    return value >= 100 ? value.toFixed(1) : value.toFixed(3);
  }

  function weightAxis(maxWeight) {
    if (maxWeight <= 0.25) {
      return { max: 0.25, ticks: [0.1, 0.2, 0.25] };
    }
    if (maxWeight <= 0.35) {
      return { max: 0.3, ticks: [0.1, 0.2, 0.3] };
    }
    if (maxWeight <= 0.55) {
      return { max: 0.5, ticks: [0.25, 0.5] };
    }
    return { max: 1, ticks: [0.5, 1] };
  }

  function formatWeightTick(value) {
    if (value === 1) return "1";
    if (value === 0.25) return "0.25";
    return value.toFixed(1);
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
    const text = cssVar("--text", "#ffffff");
    const muted = cssVar("--muted", "#6a6a6a");
    const line = cssVar("--line-strong", "rgba(10,10,10,0.16)");
    const width = 420;
    const height = 190;
    const left = 56;
    const right = width - 20;
    const top = 38;
    const bottom = 144;
    const axis = weightAxis(Math.max(...weights, 0));
    const maxWeight = axis.max;
    const lines = [];
    const xAt = (x) => left + (right - left) * x;
    const yAt = (w) => bottom - (Math.min(maxWeight, Math.max(0, w)) / maxWeight) * (bottom - top);

    for (const tick of axis.ticks) {
      const y = yAt(tick);
      lines.push(`<line class="quadrature-paper-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${right}" y2="${y.toFixed(1)}" />`);
      lines.push(`<text class="quadrature-axis-tick" x="${left - 11}" y="${(y + 3).toFixed(1)}" text-anchor="end">${formatWeightTick(tick)}</text>`);
    }

    lines.push(`<line class="quadrature-paper-axis" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" />`);
    lines.push(`<line class="quadrature-paper-axis" x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" />`);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const x = xAt(node);
      const stemTop = yAt(weights[i]);
      lines.push(`<line class="quadrature-rule-stem" x1="${x.toFixed(1)}" y1="${bottom}" x2="${x.toFixed(1)}" y2="${stemTop.toFixed(1)}" />`);
      lines.push(`<circle class="quadrature-rule-node" cx="${x.toFixed(1)}" cy="${stemTop.toFixed(1)}" r="4.1" />`);
    }

    const sum = weights.reduce((a, b) => a + b, 0);
    const spread = Math.max(...nodes) - Math.min(...nodes);

    ruleSvg.innerHTML = `
      <text class="quadrature-figure-title" x="${left}" y="22">Current rule coordinates</text>
      <g class="quadrature-rule-legend" transform="translate(${right - 86} 22)">
        <circle class="quadrature-rule-node" cx="0" cy="-3" r="4" />
        <text x="13" y="1">current candidate</text>
      </g>
      ${lines.join("")}
      <text class="quadrature-axis-tick quadrature-rule-x-value" x="${left}" y="${bottom + 17}">0</text>
      <text class="quadrature-axis-tick quadrature-rule-x-value" x="${xAt(0.5)}" y="${bottom + 17}">0.5</text>
      <text class="quadrature-axis-tick quadrature-rule-x-value" x="${right}" y="${bottom + 17}">1</text>
      <text class="quadrature-axis-title quadrature-rule-x-label" x="${left + (right - left) / 2}" y="${bottom + 35}">
        <tspan>node position </tspan><tspan font-style="italic">x</tspan><tspan baseline-shift="sub" font-size="8">i</tspan>
      </text>
      <text class="quadrature-axis-title quadrature-rule-y-label" x="17" y="${top + (bottom - top) / 2}" transform="rotate(-90 17 ${top + (bottom - top) / 2})">
        <tspan>normalized weight </tspan><tspan font-style="italic">w</tspan><tspan baseline-shift="sub" font-size="8">i</tspan>
      </text>
    `;
  }

  function renderMiniCharts(interpolated) {
    const nodes = interpolated.nodes;
    const integrands = interpolated.integrands;
    const accent = cssVar("--accent", "#0a84ff");
    const text = cssVar("--text", "#ffffff");
    const muted = cssVar("--muted", "#d7d7d7");

    integrandsGrid.innerHTML = "";

    for (const item of integrands) {
      const card = document.createElement("article");
      card.className = "quadrature-mini-chart";
      const notation = integrandNotation(item.name);

      const xs = Array.from({ length: 40 }, (_, index) => index / 39);
      const width = 250;
      const height = 108;
      const pad = { left: 16, right: 10, top: 10, bottom: 12 };
      const plotW = width - pad.left - pad.right;
      const plotH = height - pad.top - pad.bottom;
      const values = xs.map((x) => sampleFunction(item.name, x));
      const maxVal = Math.max(...values);
      const yFor = (value) => pad.top + plotH - (Math.max(0, value) / Math.max(1e-9, maxVal)) * plotH;
      const xFor = (x) => pad.left + x * plotW;
      const path = xs.map((x, index) => `${index === 0 ? "M" : "L"} ${xFor(x)} ${yFor(values[index])}`).join(" ");
      const intervals = nodes.map((x, index) => {
        const previous = index === 0 ? 0 : (nodes[index - 1] + x) / 2;
        const next = index === nodes.length - 1 ? 1 : (x + nodes[index + 1]) / 2;
        return [Math.max(0, previous), Math.min(1, next)];
      });
      const areaCells = intervals.map(([x0, x1], index) => {
        const node = nodes[index];
        const cellX = xFor(x0);
        const cellW = Math.max(1.5, xFor(x1) - cellX);
        const y = yFor(sampleFunction(item.name, node));
        const h = pad.top + plotH - y;
        const regionSamples = Array.from({ length: 14 }, (_, sampleIndex) => {
          const t = sampleIndex / 13;
          const sampleX = x0 + (x1 - x0) * t;
          return [xFor(sampleX), yFor(sampleFunction(item.name, sampleX))];
        });
        const curveEdge = regionSamples
          .slice()
          .reverse()
          .map(([sx, sy]) => `L${sx.toFixed(1)} ${sy.toFixed(1)}`)
          .join(" ");
        const gapPath = `M${cellX.toFixed(1)} ${y.toFixed(1)} L${(cellX + cellW).toFixed(1)} ${y.toFixed(1)} ${curveEdge} Z`;
        const nodeX = xFor(node);
        return `
          <g class="quadrature-mini-cell">
            <rect class="quadrature-mini-cell-area" x="${cellX.toFixed(1)}" y="${y.toFixed(1)}" width="${cellW.toFixed(1)}" height="${h.toFixed(1)}" />
            <path class="quadrature-mini-gap-fill" d="${gapPath}" />
            <path class="quadrature-mini-gap-hatch" d="${gapPath}" />
            <line class="quadrature-mini-stem" x1="${nodeX.toFixed(1)}" y1="${pad.top + plotH}" x2="${nodeX.toFixed(1)}" y2="${y.toFixed(1)}" />
          </g>
        `;
      }).join("");
      const dots = nodes.map((x) => {
        const y = sampleFunction(item.name, x);
        return `<circle class="quadrature-mini-node" cx="${xFor(x)}" cy="${yFor(y)}" r="3.1" />`;
      }).join("");

      card.innerHTML = `
        <div class="quadrature-mini-head">
          <strong class="quadrature-mini-formula">
            <var>f</var><sub>${notation.index}</sub><span>(</span><var>x</var><span>) = ${notation.expression}</span>
          </strong>
          <span class="quadrature-mini-error">
            <var>e</var><sub>${notation.index}</sub><span> = ${item.error.toFixed(4)}</span>
          </span>
        </div>
        <svg class="quadrature-mini-svg" viewBox="0 0 ${width} ${height}" aria-label="${item.name} quadrature view">
          <defs>
            <pattern id="quadratureMiniHatch${notation.index}" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(62)">
              <line x1="0" y1="0" x2="0" y2="8" />
            </pattern>
          </defs>
          <line class="quadrature-paper-axis" x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" />
          <g class="quadrature-mini-areas" style="--mini-hatch: url(#quadratureMiniHatch${notation.index})">
            ${areaCells}
          </g>
          <path class="quadrature-mini-curve" d="${path}" />
          ${dots}
        </svg>
      `;
      integrandsGrid.appendChild(card);
    }
  }

  function updateMetrics(stepIndex, step) {
    metricStep.textContent = `${step.index} / ${data.meta?.total_steps ?? allSteps.length}`;
    metricGen.textContent = `${step.generation}`;
  }

  function phaseFor(localT) {
    if (localT < 0.18) return "hold";
    if (localT < 0.40) return "delete";
    if (localT < 0.68) return "insert";
    return "settle";
  }

  function updatePhaseUI(stepIndex, phase) {
    editorBadge.textContent = stepIndex === 0 ? "run baseline" : `accepted update ${stepIndex} · ${phase}`;
    editorBadge.classList.toggle("is-phase", stepIndex !== 0);
  }

  function renderMiniScore(stepIndex, morph, displayedBest) {
    const width = 460;
    const height = 250;
    const pad = { left: 52, right: 14, top: 24, bottom: 42 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const xAt = (index) => pad.left + plotW * (index / Math.max(1, allSteps.length - 1));
    const yAt = (score) => {
      const norm = (score - scoreMin) / Math.max(1e-9, scoreMax - scoreMin);
      return pad.top + plotH - norm * plotH;
    };

    const linePath = bestByTrace.map((value, index) => `${index === 0 ? "M" : "L"} ${xAt(index).toFixed(1)} ${yAt(value).toFixed(1)}`).join(" ");
    const proposalDots = allSteps.map((step, index) => (
      `<circle class="quadrature-score-proposal" cx="${xAt(index).toFixed(1)}" cy="${yAt(step.score).toFixed(1)}" r="1.7" />`
    )).join("");
    const previousStep = steps[Math.max(0, stepIndex - 1)];
    const currentStep = steps[stepIndex];
    const markerX = mix(xAt(allSteps.findIndex((step) => step.index === previousStep.index)), xAt(allSteps.findIndex((step) => step.index === currentStep.index)), morph);
    const markerY = mix(yAt(previousStep.score), yAt(currentStep.score), morph);
    const acceptedIndex = allSteps.findIndex((step) => step === acceptedStep);
    const acceptedX = xAt(acceptedIndex);
    const acceptedY = yAt(acceptedStep.score);
    const baselineX = xAt(0);
    const baselineY = yAt(baselineStep.score);
    const yTicks = [700, 400, 200];
    const xTicks = [0, 40, allSteps.length - 1];
    const grid = yTicks.map((value) => {
      const y = yAt(value);
      return `
        <line class="quadrature-paper-grid" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + plotW}" y2="${y.toFixed(1)}" />
        <text class="quadrature-axis-tick quadrature-score-y-tick" x="${pad.left - 12}" y="${(y + 3).toFixed(1)}">${value}</text>
      `;
    }).join("");
    const xAxisTicks = xTicks.map((value) => {
      const x = xAt(value);
      return `
        <line class="quadrature-score-x-tick" x1="${x.toFixed(1)}" y1="${pad.top + plotH}" x2="${x.toFixed(1)}" y2="${pad.top + plotH + 5}" />
        <text class="quadrature-axis-tick quadrature-score-x-value" x="${x.toFixed(1)}" y="${height - 14}">${value}</text>
      `;
    }).join("");

    scoreMiniSvg.innerHTML = `
      ${grid}
      <line class="quadrature-paper-axis" x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" />
      <line class="quadrature-paper-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" />
      <text class="quadrature-axis-title quadrature-score-y-label" x="18" y="${pad.top + plotH / 2}" transform="rotate(-90 18 ${pad.top + plotH / 2})">
        <tspan font-style="italic">J</tspan><tspan>(</tspan><tspan font-style="italic">r</tspan><tspan>)</tspan>
      </text>
      ${proposalDots}
      <path class="quadrature-score-best" d="${linePath}" />
      <circle class="quadrature-score-baseline" cx="${baselineX.toFixed(1)}" cy="${baselineY.toFixed(1)}" r="5.4" />
      <circle class="quadrature-score-accepted" cx="${acceptedX.toFixed(1)}" cy="${acceptedY.toFixed(1)}" r="5.8" />
      <circle class="quadrature-score-current" cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="3.8" />
      ${xAxisTicks}
      <text class="quadrature-axis-title quadrature-score-x-label" x="${pad.left + plotW / 2}" y="${height - 1}">
        <tspan>candidate index </tspan><tspan font-style="italic">k</tspan>
      </text>
    `;
    scoreMiniLabel.textContent = `best ${formatObjective(displayedBest)}`;
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
