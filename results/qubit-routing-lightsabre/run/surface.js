(function () {
  const staticData = window.QUBIT_ROUTING_SURFACE_DATA;
  if (!staticData) return;

  const metricReduction = document.getElementById("metric-reduction");
  const metricBaseline = document.getElementById("metric-baseline");
  const metricAccepted = document.getElementById("metric-accepted");
  const codeSurface = document.getElementById("code-surface");
  const codeFocus = document.getElementById("code-focus");
  const codePhase = document.getElementById("code-phase");
  const scoreLabel = document.getElementById("score-label");
  const scoreSvg = document.getElementById("score-svg");
  const circuitSvg = document.getElementById("circuit-svg");
  const topologySvg = document.getElementById("topology-svg");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (value, digits = 0) => Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
  const pct = (value) => `${Number(value).toFixed(2)}%`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const stepDuration = 5000;
  const loopEndHoldDuration = 3000;

  metricReduction.textContent = fmt(staticData.meta.added_cnot_reduction);
  metricBaseline.textContent = fmt(staticData.meta.baseline_added_cnot);
  metricAccepted.textContent = fmt(staticData.meta.accepted_added_cnot);

  let scoreTrace = null;
  let replay = null;
  let lastFrameKey = "";
  let loopStartedAt = null;
  const editorLinePool = [];
  const codeSnapshots = (staticData.code_snapshots || staticData.code_phases || [])
    .filter((snapshot) => Array.isArray(snapshot.lines) && snapshot.lines.length);

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function setSvg(svg, markup) {
    if (svg) svg.innerHTML = markup;
  }

  function visibleCandidateIndex(progress) {
    const candidates = Array.isArray(scoreTrace?.candidates) ? scoreTrace.candidates : [];
    const steps = bestStepCandidates(candidates);
    if (steps.length < 2) return Math.max(1, Math.floor(progress * Math.max(1, candidates.length - 1)));
    if (progress >= 1) return steps[steps.length - 1].index ?? candidates.length - 1;
    const raw = clamp(progress, 0, 1) * (steps.length - 1);
    const segment = clamp(Math.floor(raw), 0, steps.length - 2);
    const localT = raw - segment;
    const start = steps[segment].index ?? segment;
    const end = steps[segment + 1].index ?? segment + 1;
    return Math.floor(mix(start, end, localT));
  }

  function candidateIndexForId(candidateId, fallback) {
    const candidates = Array.isArray(scoreTrace?.candidates) ? scoreTrace.candidates : [];
    const candidate = candidates.find((item) => item.candidate_id === candidateId);
    return candidate?.index ?? fallback;
  }

  function bestStepCandidates(candidates) {
    const steps = [];
    let retainedBest = -Infinity;
    for (const item of candidates) {
      const value = Number(item.weighted_cnot_delta);
      if (!Number.isFinite(value)) continue;
      if (value > retainedBest + 1e-9) {
        retainedBest = value;
        steps.push(item);
      }
    }
    return steps;
  }

  function codeMilestones() {
    const candidates = Array.isArray(scoreTrace?.candidates) ? scoreTrace.candidates : [];
    return bestStepCandidates(candidates)
      .slice(0, Math.max(1, editorStages.length))
      .map((step, index) => ({
        stepIndex: index,
        index: step.index ?? index,
        label: index === 0 ? "baseline surface" : `best step ${index}`,
      }));
  }

  function codePlayback(progress) {
    const milestones = codeMilestones();
    if (milestones.length < 2) return { stepIndex: 0, localT: 1 };
    if (progress >= 1) {
      return { stepIndex: milestones.length - 1, localT: 1 };
    }
    const raw = clamp(progress, 0, 1) * (milestones.length - 1);
    const segment = clamp(Math.floor(raw), 0, milestones.length - 2);
    return {
      stepIndex: milestones[segment + 1].stepIndex,
      localT: raw - segment,
    };
  }

  function linePath(points) {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  }

  function highlightRust(line) {
    const escaped = escapeHtml(line);
    const commentStart = escaped.indexOf("//");
    const source = commentStart >= 0 ? escaped.slice(0, commentStart) : escaped;
    const comment = commentStart >= 0 ? escaped.slice(commentStart) : "";
    const highlighted = source
      .replace(/\b(pub|struct|impl|fn|let|mut|for|in|if|Self|Option)\b/g, '<span class="kw">$1</span>')
      .replace(/\b(candidate_swaps|score_swap|score_delta|from_ctx|total_cmp|ctx|topology|iter|map|sum)\b/g, '<span class="fn">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="num">$1</span>');
    return `${highlighted}${comment ? `<span class="cm">${comment}</span>` : ""}`;
  }

  function buildOps(before, after) {
    const ops = [];
    const rows = before.length + 1;
    const cols = after.length + 1;
    const lcs = Array.from({ length: rows }, () => Array(cols).fill(0));

    for (let i = before.length - 1; i >= 0; i -= 1) {
      for (let j = after.length - 1; j >= 0; j -= 1) {
        lcs[i][j] = before[i] === after[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }

    let i = 0;
    let j = 0;
    while (i < before.length && j < after.length) {
      if (before[i] === after[j]) {
        ops.push({ tag: "equal", text: before[i], before_index: i, after_index: j });
        i += 1;
        j += 1;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        ops.push({ tag: "delete", text: before[i], before_index: i, after_index: null });
        i += 1;
      } else {
        ops.push({ tag: "insert", text: after[j], before_index: null, after_index: j });
        j += 1;
      }
    }
    while (i < before.length) {
      ops.push({ tag: "delete", text: before[i], before_index: i, after_index: null });
      i += 1;
    }
    while (j < after.length) {
      ops.push({ tag: "insert", text: after[j], before_index: null, after_index: j });
      j += 1;
    }
    return ops;
  }

  const editorStages = codeSnapshots.map((snapshot, index) => {
    const before = codeSnapshots[Math.max(0, index - 1)]?.lines || snapshot.lines;
    const after = snapshot.lines;
    const ops = index === 0
      ? after.map((line, lineIndex) => ({ tag: "equal", text: line, before_index: lineIndex, after_index: lineIndex }))
      : buildOps(before, after);
    return { label: snapshot.label, before_lines: before, after_lines: after, ops };
  });

  function phaseFor(localT) {
    if (localT < 0.18) return "hold";
    if (localT < 0.40) return "delete";
    if (localT < 0.58) return "shift";
    if (localT < 0.82) return "insert";
    return "settle";
  }

  function getEditorLayoutForLineCount(lineCount) {
    const pitch = lineCount > 34 ? 18 : lineCount > 26 ? 20 : 22;
    return {
      pitch,
      lineHeight: Math.max(16, pitch - 2),
      bodyHeight: Math.max(490, 28 + lineCount * pitch),
      fontSize: lineCount > 34 ? 10.6 : lineCount > 26 ? 11.2 : 12.2,
    };
  }

  function applyEditorLayout(stage, settleT) {
    const previousLayout = getEditorLayoutForLineCount(stage.before_lines.length);
    const currentLayout = getEditorLayoutForLineCount(stage.after_lines.length);
    const layout = {
      pitch: mix(previousLayout.pitch, currentLayout.pitch, settleT),
      lineHeight: mix(previousLayout.lineHeight, currentLayout.lineHeight, settleT),
      bodyHeight: mix(previousLayout.bodyHeight, currentLayout.bodyHeight, settleT),
      fontSize: mix(previousLayout.fontSize, currentLayout.fontSize, settleT),
      previousPitch: previousLayout.pitch,
      currentPitch: currentLayout.pitch,
    };
    codeSurface.style.height = `${layout.bodyHeight}px`;
    codeSurface.style.setProperty("--editor-font-size", `${layout.fontSize}px`);
    codeSurface.style.setProperty("--editor-line-height", `${layout.lineHeight}px`);
    return layout;
  }

  function makeEditorLine() {
    const line = document.createElement("div");
    line.className = "qubit-run-code-line equal";
    line.innerHTML = '<span class="ln"></span><span class="pm"></span><span class="code"></span>';
    return line;
  }

  function ensureEditorLinePool(size) {
    while (editorLinePool.length < size) {
      const line = makeEditorLine();
      codeSurface.appendChild(line);
      editorLinePool.push(line);
    }
  }

  function syncEditorLine(line, op) {
    const nextClass = `qubit-run-code-line ${op.tag}`;
    if (line.className !== nextClass) line.className = nextClass;

    const ln = line.querySelector(".ln");
    const pm = line.querySelector(".pm");
    const code = line.querySelector(".code");
    const lineNumber = op.after_index !== null ? op.after_index + 1 : op.before_index + 1;
    const prefix = op.tag === "equal" ? "" : op.tag === "delete" ? "-" : "+";

    if (ln.textContent !== String(lineNumber).padStart(2, "0")) ln.textContent = String(lineNumber).padStart(2, "0");
    if (pm.textContent !== prefix) pm.textContent = prefix;
    const highlighted = highlightRust(op.text);
    if (code.innerHTML !== highlighted) code.innerHTML = highlighted;
  }

  function renderCode(stepIndex, localT) {
    const stage = editorStages[stepIndex] || editorStages[0];
    if (!stage) return;
    const stableListing = stepIndex === editorStages.length - 1 && localT >= 0.999;

    const deleteT = ease(clamp((localT - 0.18) / 0.22, 0, 1));
    const insertT = ease(clamp((localT - 0.58) / 0.22, 0, 1));
    const settleT = ease(clamp((localT - 0.42) / 0.16, 0, 1));
    const layout = applyEditorLayout(stage, settleT);
    const ops = stableListing
      ? stage.after_lines.map((line, lineIndex) => ({ tag: "equal", text: line, before_index: lineIndex, after_index: lineIndex }))
      : stage.ops;

    const hasDeletes = ops.some((op) => op.tag === "delete");
    const hasInserts = ops.some((op) => op.tag === "insert");
    let phaseName = phaseFor(localT);
    if (stableListing) phaseName = "accepted";
    if (phaseName === "delete" && !hasDeletes) phaseName = "shift";
    if (phaseName === "insert" && !hasInserts) phaseName = "settle";
    const phase = stepIndex === 0 ? "baseline" : `update ${stepIndex} · ${phaseName}`;
    codePhase.textContent = phase;

    const changedOnly = ops.filter((op) => op.tag !== "equal");
    const changedIndices = changedOnly
      .map((op) => op.after_index ?? op.before_index)
      .filter((value) => value !== null)
      .sort((a, b) => a - b);
    if (codeFocus && changedIndices.length && !stableListing) {
      const spanMin = changedIndices[0];
      const spanMax = changedIndices[changedIndices.length - 1];
      let minIdx = spanMin;
      let maxIdx = spanMax;
      if (spanMax - spanMin > 14) {
        const windowCenterIndex = clamp(Math.floor(localT * changedIndices.length), 0, changedIndices.length - 1);
        const center = changedIndices[windowCenterIndex];
        minIdx = Math.max(spanMin, center - 4);
        maxIdx = Math.min(spanMax, center + 7);
      }
      const focusTop = mix(12 + minIdx * layout.previousPitch - 6, 12 + minIdx * layout.currentPitch - 6, settleT);
      const focusHeight = mix(
        (maxIdx - minIdx + 1) * layout.previousPitch + 10,
        (maxIdx - minIdx + 1) * layout.currentPitch + 10,
        settleT
      );
      codeFocus.style.opacity = "1";
      codeFocus.style.top = `${Math.max(6, focusTop)}px`;
      codeFocus.style.height = `${focusHeight}px`;
    } else if (codeFocus) {
      codeFocus.style.opacity = "0";
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
        line.style.transform = `translateY(${mix(afterY + 5, afterY, settleT)}px)`;
        line.style.opacity = `${insertT <= 0 ? 0 : 0.55 + insertT * 0.45}`;
      }
    }

    for (let index = ops.length; index < editorLinePool.length; index += 1) {
      editorLinePool[index].style.display = "none";
      editorLinePool[index].style.opacity = "0";
    }
  }

  function renderScore(progress) {
    if (!scoreTrace) return;
    const candidates = Array.isArray(scoreTrace.candidates) ? scoreTrace.candidates : [];
    const best = Array.isArray(scoreTrace.best_by_index) ? scoreTrace.best_by_index : [];
    const visibleIndex = visibleCandidateIndex(progress);
    const left = 54;
    const right = 430;
    const top = 70;
    const bottom = 202;
    const width = right - left;
    const height = bottom - top;
    const indexEnd = Math.max(1, ...candidates.map((item, index) => item.index ?? index));
    const yMin = scoreTrace.display?.y_floor ?? 8500;
    const yMax = 12000;
    const xAt = (index) => left + (clamp(index, 0, indexEnd) / indexEnd) * width;
    const yAt = (value) => bottom - ((Math.max(yMin, value) - yMin) / (yMax - yMin)) * height;
    const stepMarkers = bestStepCandidates(candidates)
      .filter((item, markerIndex) => markerIndex > 0)
      .map((item) => {
        const itemIndex = item.index ?? 0;
        const x = xAt(itemIndex);
        const y = yAt(item.weighted_cnot_delta ?? yMin);
        const visible = itemIndex <= visibleIndex ? " is-visible" : "";
        const accepted = item.accepted ? " is-accepted" : "";
        return `<circle class="qubit-run-step-marker${visible}${accepted}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${item.accepted ? "4.8" : "3.1"}" />`;
      }).join("");
    const dots = candidates.map((item, index) => {
      const x = xAt(item.index ?? index);
      const y = yAt(item.weighted_cnot_delta ?? yMin);
      const visible = (item.index ?? index) <= visibleIndex ? " is-visible" : "";
      return `<circle class="qubit-run-candidate${visible}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.45" />`;
    }).join("");
    const visibleBest = best.filter((item) => (item.index ?? 0) <= visibleIndex);
    const fullBestPoints = best.map((item, index) => [
      xAt(item.index ?? index),
      yAt(item.weighted_cnot_delta ?? yMin),
    ]);
    const visibleBestPoints = (visibleBest.length ? visibleBest : [candidates[0]]).map((item, index) => [
      xAt(item.index ?? index),
      yAt(item.weighted_cnot_delta ?? yMin),
    ]);
    const baseline = candidates[0] || { index: 0, weighted_cnot_delta: yMin };
    const accepted = candidates[candidates.length - 1] || baseline;
    const acceptedVisible = visibleIndex >= (accepted.index ?? candidates.length - 1);
    const currentBest = visibleBest[visibleBest.length - 1] || baseline;
    scoreLabel.textContent = `candidate ${fmt(visibleIndex)} / ${fmt(candidates.length - 1)}`;
    setSvg(scoreSvg, `
      <text class="qubit-run-title" x="${left}" y="24">Objective trace (positive readout)</text>
      <g class="qubit-run-legend" transform="translate(${left} 46)">
        <circle class="qubit-run-candidate is-visible" cx="0" cy="0" r="2" />
        <text class="qubit-run-label" x="10" y="4">scored candidate</text>
        <path class="qubit-run-best" d="M112 0H142" />
        <text class="qubit-run-label" x="152" y="4">best-so-far</text>
        <circle class="qubit-run-baseline-ring" cx="250" cy="0" r="4" />
        <text class="qubit-run-label" x="260" y="4">baseline</text>
        <circle class="qubit-run-accepted-ring" cx="330" cy="0" r="4" />
        <text class="qubit-run-label" x="340" y="4">final accepted</text>
      </g>
      <path class="qubit-run-grid" d="M${left} ${bottom}H${right}" />
      <path class="qubit-run-grid" d="M${left} ${top + height / 2}H${right}" />
      <path class="qubit-run-grid" d="M${left} ${top}H${right}" />
      <text class="qubit-run-label" x="${left - 10}" y="${bottom + 4}" text-anchor="end">${fmt(yMin)}</text>
      <text class="qubit-run-label" x="${left - 10}" y="${top + height / 2 + 4}" text-anchor="end">${fmt((yMin + yMax) / 2)}</text>
      <text class="qubit-run-label" x="${left - 10}" y="${top + 4}" text-anchor="end">${fmt(yMax)}</text>
      <path class="qubit-run-axis" d="M${left} ${top}V${bottom}H${right}" />
      <g>${dots}</g>
      <path class="qubit-run-best qubit-run-best--full" d="${linePath(fullBestPoints)}" />
      <path class="qubit-run-best" d="${linePath(visibleBestPoints)}" />
      <g>${stepMarkers}</g>
      <circle class="qubit-run-baseline-ring" cx="${xAt(baseline.index ?? 0).toFixed(1)}" cy="${yAt(baseline.weighted_cnot_delta).toFixed(1)}" r="4" />
      ${acceptedVisible ? `<circle class="qubit-run-accepted-ring" cx="${xAt(accepted.index ?? indexEnd).toFixed(1)}" cy="${yAt(accepted.weighted_cnot_delta).toFixed(1)}" r="4.8" />` : ""}
      <circle class="qubit-run-current-ring" cx="${xAt(currentBest.index ?? 0).toFixed(1)}" cy="${yAt(currentBest.weighted_cnot_delta ?? yMin).toFixed(1)}" r="4.2" />
      <text class="qubit-run-value" x="${right}" y="24" text-anchor="end">${fmt(currentBest.weighted_cnot_delta ?? 0, 1)}</text>
      <text class="qubit-run-label" x="${left}" y="232">0</text>
      <text class="qubit-run-label" x="${right}" y="232" text-anchor="end">${fmt(indexEnd)}</text>
      <text class="qubit-run-label" x="${(left + right) / 2}" y="232" text-anchor="middle">scored candidate index</text>
    `);
  }

  function drawCnot(x, y0, y1) {
    return `
      <line class="qubit-run-cnot" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" />
      <circle class="qubit-run-gate" cx="${x}" cy="${y0}" r="4" />
      <circle class="qubit-run-gate" cx="${x}" cy="${y1}" r="13" />
      <path class="qubit-run-swap" d="M${x - 8} ${y1}H${x + 8}M${x} ${y1 - 8}V${y1 + 8}" />
    `;
  }

  function drawSwap(x, y0, y1, muted) {
    const cls = muted ? "qubit-run-cnot" : "qubit-run-swap";
    return `
      <line class="${cls}" x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" />
      <path class="${cls}" d="M${x - 8} ${y0 - 8}L${x + 8} ${y0 + 8}M${x + 8} ${y0 - 8}L${x - 8} ${y0 + 8}" />
      <path class="${cls}" d="M${x - 8} ${y1 - 8}L${x + 8} ${y1 + 8}M${x + 8} ${y1 - 8}L${x - 8} ${y1 + 8}" />
    `;
  }

  function compressedTicks(count, y, className, visibleRatio = 1) {
    const left = 92;
    const right = 414;
    const tickCount = 76;
    const active = Math.max(1, Math.round(tickCount * visibleRatio));
    return Array.from({ length: tickCount }, (_, i) => {
      const x = left + (i / (tickCount - 1)) * (right - left);
      const tall = i % 11 === 0 ? 12 : i % 5 === 0 ? 9 : 5;
      const opacity = i < active ? 0.82 : 0.14;
      return `<line class="${className}" x1="${x.toFixed(1)}" y1="${y - tall / 2}" x2="${x.toFixed(1)}" y2="${y + tall / 2}" opacity="${opacity.toFixed(2)}" />`;
    }).join("");
  }

  function decodeBins(encoded) {
    if (!encoded) return [];
    return String(encoded).trim().split(/\s+/).map((pair) => {
      const [cx = "0", swap = "0"] = pair.split(".");
      return {
        cx: Number.parseInt(cx, 16) || 0,
        swap: Number.parseInt(swap, 16) || 0,
      };
    });
  }

  function encodeBins(bins) {
    return bins.map((bin) => `${Math.round(bin.cx).toString(16)}.${Math.round(bin.swap).toString(16)}`).join(" ");
  }

  function mixBins(fromFrame, toFrame, ratio) {
    const fromBins = decodeBins(fromFrame.full_bins);
    const toBins = decodeBins(toFrame.full_bins);
    const count = Math.min(fromBins.length, toBins.length);
    const bins = Array.from({ length: count }, (_, index) => ({
      cx: mix(fromBins[index].cx, toBins[index].cx, ratio),
      swap: mix(fromBins[index].swap, toBins[index].swap, ratio),
    }));
    return {
      ...toFrame,
      full_bins: encodeBins(bins),
      added_cnot: Math.round(mix(fromFrame.added_cnot, toFrame.added_cnot, ratio)),
      swap_count: Math.round(mix(fromFrame.swap_count, toFrame.swap_count, ratio)),
    };
  }

  function shiftedFrame(fromFrame, toFrame, ratio, addedCnot, laneIndex) {
    const frame = mixBins(fromFrame, toFrame, ratio);
    if (laneIndex === 0) {
      return {
        ...frame,
        added_cnot: Math.round(addedCnot),
      };
    }

    const bins = decodeBins(frame.full_bins);
    const shift = (laneIndex * 13) % Math.max(1, bins.length);
    const transformed = bins.map((_, index) => {
      const source = bins[(index + shift) % bins.length];
      const cxWave = 0.94 + 0.12 * Math.sin((index + 1) * 0.39 + laneIndex);
      const swapWave = 0.82 + 0.16 * Math.cos((index + 1) * 0.31 + laneIndex);
      return {
        cx: source.cx * cxWave,
        swap: source.swap * swapWave,
      };
    });

    return {
      ...frame,
      added_cnot: Math.round(addedCnot),
      swap_count: Math.round(addedCnot / 3),
      full_bins: encodeBins(transformed),
    };
  }

  function interpolateGeneration(points, generation) {
    const sorted = [...points].sort((a, b) => a.generation - b.generation);
    if (generation <= sorted[0].generation) return sorted[0].value;
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const next = sorted[index];
      if (generation <= next.generation) {
        const span = Math.max(1, next.generation - previous.generation);
        const ratio = (generation - previous.generation) / span;
        return mix(previous.value, next.value, ratio);
      }
    }
    return sorted[sorted.length - 1].value;
  }

  function topologyProgress(topology, generation) {
    const totals = {
      q20: [
        { generation: 1, value: 53307 },
        { generation: 47, value: 51678 },
        { generation: 62, value: 49725 },
      ],
      willow: [
        { generation: 1, value: 111048 },
        { generation: 47, value: 109341 },
        { generation: 62, value: 108066 },
      ],
      heron_fez: [
        { generation: 1, value: 137343 },
        { generation: 47, value: 138645 },
        { generation: 62, value: 137991 },
      ],
    };
    const points = totals[topology] || totals.q20;
    const current = interpolateGeneration(points, generation);
    const first = points[0].value;
    const span = Math.max(1, ...points.map((point) => Math.abs(point.value - first)));
    return clamp(Math.abs(current - first) / span, 0, 1);
  }

  function topologyValue(topology, generation) {
    const totals = {
      q20: [
        { generation: 1, value: 53307 },
        { generation: 47, value: 51678 },
        { generation: 62, value: 49725 },
      ],
      willow: [
        { generation: 1, value: 111048 },
        { generation: 47, value: 109341 },
        { generation: 62, value: 108066 },
      ],
      heron_fez: [
        { generation: 1, value: 137343 },
        { generation: 47, value: 138645 },
        { generation: 62, value: 137991 },
      ],
    };
    return interpolateGeneration(totals[topology] || totals.q20, generation);
  }

  function caseReplayPreview(caseId) {
    const cases = replay?.trace?.case_preview;
    return Array.isArray(cases) ? cases.find((item) => item.id === caseId) : null;
  }

  function retainedBestAtGeneration(generation) {
    const best = Array.isArray(scoreTrace?.best_by_generation) ? scoreTrace.best_by_generation : [];
    let current = null;
    for (const item of best) {
      const itemGeneration = item.generation ?? 0;
      const itemDelta = item.weighted_cnot_delta ?? -item.score ?? 0;
      const currentDelta = current ? (current.weighted_cnot_delta ?? -current.score ?? 0) : -Infinity;
      if (itemGeneration <= generation && itemDelta >= currentDelta) {
        current = item;
      }
    }
    return current;
  }

  function decodeOps(encoded) {
    if (!encoded) return [];
    return String(encoded).trim().split(/\s+/).map((token, index) => {
      const op = token[0] === "s" ? "swap" : "cx";
      const [a, b] = token.slice(1).split("-").map((value) => Number.parseInt(value, 10));
      return { op, q: [a, b], t: index };
    }).filter((op) => Number.isFinite(op.q[0]) && Number.isFinite(op.q[1]));
  }

  function renderFullRouteBins(frame, y, activeProgress) {
    const bins = decodeBins(frame.full_bins);
    const left = 150;
    const right = 590;
    const maxTotal = Math.max(1, ...bins.map((bin) => bin.cx + bin.swap));
    const activeCount = Math.max(1, Math.round(bins.length * activeProgress));
    return bins.map((bin, index) => {
      const x = left + (index / Math.max(1, bins.length - 1)) * (right - left);
      const total = bin.cx + bin.swap;
      const height = 4 + (total / maxTotal) * 16;
      const isActive = index < activeCount;
      const swapRatio = total ? bin.swap / total : 0;
      const opacity = isActive ? 0.36 + swapRatio * 0.62 : 0.18;
      const cls = swapRatio > 0.25 ? "qubit-run-compressed-active" : "qubit-run-compressed-reference";
      return `<line class="${cls}" x1="${x.toFixed(1)}" y1="${(y - height / 2).toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y + height / 2).toFixed(1)}" opacity="${opacity.toFixed(2)}" />`;
    }).join("");
  }

  function renderFullRouteRow(frame, label, routeY) {
    const metaY = routeY - 30;
    const left = 150;
    const width = 440;
    return `
      <text class="qubit-run-label" x="40" y="${metaY}">${label}</text>
      <text class="qubit-run-value" x="600" y="${metaY}" text-anchor="end">${fmt(frame.added_cnot)} added CNOTs</text>
      <path class="qubit-run-grid" d="M${left} ${routeY}H${left + width}" />
      ${renderFullRouteBins(frame, routeY, 1)}
    `;
  }

  function renderFullRoute(lanes) {
    return `
      ${lanes.map((lane, index) => renderFullRouteRow(lane.frame, lane.label, 140 + index * 70)).join("")}
    `;
  }

  function renderCircuit(progress) {
    const replayCase = staticData.routing_case_replay;
    if (replayCase?.frames?.length) {
      const frames = replayCase.frames;
      const earlyFrame = frames[0];
      const acceptedFrame = frames[frames.length - 1];
      // The score trace continues after the accepted route; the case lanes below
      // are aligned to the accepted generation and topology-level evolution.
      const generationEnd = acceptedFrame.generation || scoreTrace?.generation_end || 62;
      const currentGeneration = clamp(Math.floor(progress * generationEnd) + 1, 1, generationEnd);
      const q20Case = caseReplayPreview("9symml_195_q20");
      const willowCase = caseReplayPreview("9symml_195_willow");
      const q20Progress = topologyProgress("q20", currentGeneration);
      const willowProgress = topologyProgress("willow", currentGeneration);
      const heronProgress = topologyProgress("heron_fez", currentGeneration);
      const q20Accepted = q20Case?.candidate_added_cnot || acceptedFrame.added_cnot;
      const willowAccepted = willowCase?.candidate_added_cnot || 25155;
      const willowFirst = willowAccepted * (111048 / 108066);
      const heronAccepted = willowAccepted * (137991 / 108066);
      const heronCurrent = heronAccepted * (topologyValue("heron_fez", currentGeneration) / 137991);
      const lanes = [
        {
          label: `${escapeHtml(replayCase.circuit)} · Q20`,
          frame: shiftedFrame(
            earlyFrame,
            acceptedFrame,
            q20Progress,
            mix(earlyFrame.added_cnot, q20Accepted, q20Progress),
            0,
          ),
        },
        {
          label: `${escapeHtml(replayCase.circuit)} · Willow`,
          frame: shiftedFrame(
            earlyFrame,
            acceptedFrame,
            willowProgress,
            mix(willowFirst, willowAccepted, willowProgress),
            1,
          ),
        },
        {
          label: `${escapeHtml(replayCase.circuit)} · Heron-FEZ`,
          frame: shiftedFrame(
            earlyFrame,
            acceptedFrame,
            heronProgress,
            heronCurrent,
            2,
          ),
        },
      ];

      setSvg(circuitSvg, `
        <text class="qubit-run-title" x="40" y="30">Routed circuit replay</text>
        <text class="qubit-run-label" x="600" y="30" text-anchor="end">same circuit, three targets</text>
        <text class="qubit-run-label" x="40" y="58">full output circuit, same scale</text>
        <text class="qubit-run-value" x="600" y="58" text-anchor="end">generation ${fmt(currentGeneration)} / ${fmt(generationEnd)}</text>
        <g transform="translate(40 82)">
          <line class="qubit-run-compressed-reference" x1="0" y1="0" x2="28" y2="0" opacity="0.5" />
          <text class="qubit-run-label" x="40" y="4">CNOT density</text>
          <line class="qubit-run-compressed-active" x1="160" y1="0" x2="188" y2="0" opacity="0.75" />
          <text class="qubit-run-label" x="200" y="4">SWAP-heavy regions</text>
        </g>
        ${renderFullRoute(lanes)}
      `);
      return;
    }

    const frames = staticData.circuit_frames;
    const raw = progress * (frames.length - 1);
    const index = clamp(Math.floor(raw), 0, frames.length - 1);
    const settle = ease(raw - index);
    const frame = frames[index] || frames[0];
    const next = frames[Math.min(index + 1, frames.length - 1)] || frame;
    const y = [78, 118, 158, 198, 238];
    const wires = y.map((yy, q) => `
      <text class="qubit-run-label" x="40" y="${yy + 4}">q${q}</text>
      <path class="qubit-run-wire" d="M70 ${yy}H414" />
    `).join("");
    const swaps = [...frame.swaps, ...next.swaps].map((swap, i) => {
      const x = 130 + i * 70;
      return drawSwap(x, y[swap[0]], y[swap[1]], i >= frame.swaps.length && settle < 0.5);
    }).join("");
    const cnotX = mix(338, 284, index >= 3 ? 1 : settle * 0.35);
    const cnot = drawCnot(cnotX, y[frame.cnot[0]], y[frame.cnot[1]]);
    setSvg(circuitSvg, `
      <text class="qubit-run-title" x="40" y="28">Routing logical gates onto adjacent wires</text>
      <text class="qubit-run-label" x="414" y="28" text-anchor="end">${escapeHtml(frame.label)}</text>
      ${wires}
      ${swaps}
      ${cnot}
      <text class="qubit-run-label" x="40" y="284">SWAPs move state; the accepted policy keeps useful remappings instead of restoring by default.</text>
    `);
  }

  function renderTopology(progress) {
    if (!replay) return;
    const rows = (replay.trace?.topology_summary || []).slice().sort((a, b) => {
      const order = { q20: 0, willow: 1, heron_fez: 2 };
      return (order[a.topology] ?? 9) - (order[b.topology] ?? 9);
    });
    const label = { q20: "Q20", willow: "Willow", heron_fez: "Heron-FEZ" };
    const left = 112;
    const right = 344;
    const width = right - left;
    const maxValue = Math.ceil(Math.max(...rows.flatMap((row) => [row.lightsabre_added_cnot, row.candidate_added_cnot])) / 25000) * 25000;
    const xAt = (value) => left + (value / maxValue) * width;
    const bars = rows.map((row, index) => {
      const y = 74 + index * 46;
      const candidateValue = mix(row.lightsabre_added_cnot, row.candidate_added_cnot, ease(progress));
      const delta = row.candidate_added_cnot - row.lightsabre_added_cnot;
      return `
        <text class="qubit-run-label" x="38" y="${y + 4}">${label[row.topology] || row.topology}</text>
        <path class="qubit-run-grid" d="M${left} ${y}H${right}" />
        <rect class="qubit-run-bar-baseline" x="${left}" y="${y - 8}" width="${(xAt(row.lightsabre_added_cnot) - left).toFixed(1)}" height="16" />
        <rect class="qubit-run-bar-accepted" x="${left}" y="${y - 8}" width="${(xAt(candidateValue) - left).toFixed(1)}" height="16" />
        <line class="qubit-run-marker" x1="${xAt(row.lightsabre_added_cnot).toFixed(1)}" y1="${y - 11}" x2="${xAt(row.lightsabre_added_cnot).toFixed(1)}" y2="${y + 11}" />
        <text class="qubit-run-value" x="382" y="${y - 4}">Δ ${delta > 0 ? "+" : ""}${fmt(delta)}</text>
        <text class="qubit-run-label" x="382" y="${y + 13}">${pct(row.relative_improvement_pct)}</text>
      `;
    }).join("");
    setSvg(topologySvg, `
      <text class="qubit-run-title" x="38" y="28">Topology split</text>
      <g transform="translate(38 44)">
        <rect class="qubit-run-bar-baseline" x="0" y="-8" width="18" height="14" />
        <text class="qubit-run-label" x="28" y="4">LightSABRE</text>
        <rect class="qubit-run-bar-accepted" x="118" y="-8" width="18" height="14" />
        <text class="qubit-run-label" x="146" y="4">accepted</text>
      </g>
      ${bars}
      <path class="qubit-run-axis" d="M${left} 216H${right}" />
      <text class="qubit-run-label" x="${left}" y="236">0</text>
      <text class="qubit-run-label" x="${right}" y="236" text-anchor="end">${fmt(maxValue)}</text>
    `);
  }

  function tick(now) {
    const activeDuration = reduceMotion ? 1 : Math.max(1, codeMilestones().length - 1) * stepDuration;
    const totalDuration = activeDuration + (reduceMotion ? 0 : loopEndHoldDuration);
    if (loopStartedAt === null) loopStartedAt = now;
    const loopT = reduceMotion ? activeDuration : (now - loopStartedAt) % totalDuration;
    const effectiveT = Math.min(loopT, activeDuration);
    const cycle = reduceMotion ? 1 : effectiveT / activeDuration;
    const { stepIndex, localT } = codePlayback(cycle);
    const frameKey = `${visibleCandidateIndex(cycle)}:${stepIndex}:${Math.round(localT * 100)}`;
    if (frameKey !== lastFrameKey) {
      lastFrameKey = frameKey;
      renderCode(stepIndex, localT);
      renderScore(cycle);
      renderCircuit(cycle);
      renderTopology(cycle);
    }
    if (!reduceMotion) window.requestAnimationFrame(tick);
  }

  Promise.all([
    fetch("../artifacts/score-trace.json").then((response) => response.json()),
    fetch("../artifacts/replay.json").then((response) => response.json()),
  ]).then(([loadedScoreTrace, loadedReplay]) => {
    scoreTrace = loadedScoreTrace;
    replay = loadedReplay;
    tick(performance.now());
    if (!reduceMotion) window.requestAnimationFrame(tick);
  }).catch(() => {
    renderCode(0, 1);
    setSvg(scoreSvg, '<text class="qubit-run-label" x="54" y="120">Unable to load public score trace.</text>');
    setSvg(circuitSvg, '<text class="qubit-run-label" x="40" y="140">Unable to load replay surface.</text>');
  });
}());
