(function () {
  const data = window.CIRCLE_PACKING_SURFACE_DATA;
  if (!data || !Array.isArray(data.steps) || !Array.isArray(data.checkpoints)) return;

  const steps = data.steps;
  const checkpoints = data.checkpoints;
  const meta = data.meta || {};
  const signalGains = document.getElementById("signal-gains");
  const signalSeed = document.getElementById("signal-seed");
  const signalBest = document.getElementById("signal-best");
  const metricStep = document.getElementById("metric-step");
  const metricGen = document.getElementById("metric-gen");
  const editorBody = document.getElementById("editor-body");
  const editorFocus = document.getElementById("editor-focus");
  const editorBadge = document.getElementById("editor-badge");
  const scoreSvg = document.getElementById("score-mini-svg");
  const scoreLabel = document.getElementById("score-mini-label");
  const packingSvg = document.getElementById("packing-svg");
  const contactSvg = document.getElementById("contact-svg");

  const fmt = (value, digits = 3) => Number(value).toFixed(digits);
  const pct = (value, digits = 2) => `${fmt(value, digits)}%`;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastFrameKey = "";
  let lastMetricsStep = -1;
  const editorLinePool = [];
  const editorLayer = document.createElement("div");
  editorLayer.className = "packing-editor-layer";
  if (editorFocus) editorLayer.appendChild(editorFocus);
  editorBody.appendChild(editorLayer);
  const stepPositionByCandidate = new Map(steps.map((step, index) => [step.candidate_id, index]));
  const checkpointFrames = checkpoints
    .map((checkpoint, index) => {
      const progress = stepPositionByCandidate.get(checkpoint.candidate_id) ?? index;
      const sourceStep = steps[progress];
      return {
        ...checkpoint,
        progress,
        generation: sourceStep?.generation ?? checkpoint.generation ?? 0,
      };
    })
    .sort((a, b) => a.progress - b.progress);

  signalGains.textContent = pct(meta.improvement_pct, 2);
  signalSeed.textContent = fmt(meta.seed_sum_radii, 6);
  signalBest.textContent = fmt(meta.accepted_sum_radii, 6);

  const codeSurface = data.code_surface || {};
  const codeSnapshots = Array.isArray(codeSurface.snapshots)
    ? codeSurface.snapshots.filter((snapshot) => Array.isArray(snapshot.lines) && snapshot.lines.length)
    : [];
  if (!codeSnapshots.length) return;
  const maxVisibleChars = Math.max(...codeSnapshots.flatMap((snapshot) => snapshot.lines.map((line) => (line || "").length)));

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
      if (i < before.length && (j >= after.length || (nextAfterInBefore !== -1 && (nextBeforeInAfter === -1 || nextAfterInBefore - i <= nextBeforeInAfter - j)))) {
        ops.push({ tag: "delete", text: before[i], before_index: i, after_index: null });
        i += 1;
        continue;
      }
      if (j < after.length) {
        ops.push({ tag: "insert", text: after[j], before_index: null, after_index: j });
        j += 1;
      }
    }
    return ops;
  }

  const editorStages = checkpointFrames.map((checkpoint, frameIndex) => {
    const snapshotIndex = getCodeSnapshotIndex(checkpoint.progress);
    const previousCheckpoint = checkpointFrames[Math.max(0, frameIndex - 1)];
    const previousSnapshotIndex = frameIndex === 0 ? snapshotIndex : getCodeSnapshotIndex(previousCheckpoint.progress);
    const beforeSnapshot = codeSnapshots[previousSnapshotIndex] ?? codeSnapshots[0];
    const afterSnapshot = codeSnapshots[snapshotIndex] ?? codeSnapshots[codeSnapshots.length - 1];
    const beforeLines = beforeSnapshot.lines;
    const afterLines = afterSnapshot.lines;
    const ops = frameIndex === 0 || snapshotIndex === previousSnapshotIndex
      ? afterLines.map((line, lineIndex) => ({ tag: "equal", text: line, before_index: lineIndex, after_index: lineIndex }))
      : buildOps(beforeLines, afterLines);
    return { before_lines: beforeLines, after_lines: afterLines, ops, snapshot: afterSnapshot, snapshot_index: snapshotIndex };
  });

  function setSvg(svg, markup) {
    if (!svg) return;
    svg.innerHTML = markup;
  }

  function linePath(points) {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter((value) => Number.isFinite(value)).map((value) => Number(value.toFixed(12))))].sort((a, b) => a - b);
  }

  function spacedTickValues(candidates, yAt, minGap = 18) {
    const ordered = candidates
      .filter((item) => Number.isFinite(item?.value))
      .sort((a, b) => (a.priority ?? 10) - (b.priority ?? 10));
    const kept = [];
    ordered.forEach((item) => {
      const y = yAt(item.value);
      if (kept.every((tick) => Math.abs(tick.y - y) >= minGap)) {
        kept.push({ value: Number(item.value.toFixed(12)), y });
      }
    });
    return uniqueSorted(kept.map((tick) => tick.value));
  }

  function getCodeSnapshotIndex(stepIndex) {
    return clamp(Math.round((stepIndex / Math.max(1, steps.length - 1)) * (codeSnapshots.length - 1)), 0, codeSnapshots.length - 1);
  }

  function getEditorLayoutForLineCount(lineCount) {
    const pitch = lineCount > 130 ? 15 : lineCount > 105 ? 16 : lineCount > 80 ? 17 : lineCount > 52 ? 18 : lineCount > 34 ? 20 : 22;
    const lineHeight = Math.max(15, pitch - 2);
    const fullHeight = Math.max(560, 24 + lineCount * pitch);
    const bodyHeight = fullHeight;
    const fontSize = maxVisibleChars > 120 || lineCount > 120
      ? 8.8
      : maxVisibleChars > 96 || lineCount > 90
        ? 9.4
        : lineCount > 60
          ? 10
          : 11.2;
    const codeScale = maxVisibleChars > 150
      ? 0.62
      : maxVisibleChars > 120
        ? 0.72
        : maxVisibleChars > 96
          ? 0.84
          : 1;
    return { pitch, lineHeight, fullHeight, bodyHeight, fontSize, codeScale };
  }

  function applyEditorLayout(stage, settleT) {
    const previousLayout = getEditorLayoutForLineCount(stage.before_lines.length);
    const currentLayout = getEditorLayoutForLineCount(stage.after_lines.length);
    const layout = {
      pitch: mix(previousLayout.pitch, currentLayout.pitch, settleT),
      lineHeight: mix(previousLayout.lineHeight, currentLayout.lineHeight, settleT),
      fullHeight: mix(previousLayout.fullHeight, currentLayout.fullHeight, settleT),
      bodyHeight: mix(previousLayout.bodyHeight, currentLayout.bodyHeight, settleT),
      fontSize: mix(previousLayout.fontSize, currentLayout.fontSize, settleT),
      codeScale: mix(previousLayout.codeScale, currentLayout.codeScale, settleT),
      previousPitch: previousLayout.pitch,
      currentPitch: currentLayout.pitch,
      previousFullHeight: previousLayout.fullHeight,
      currentFullHeight: currentLayout.fullHeight,
    };
    editorBody.style.height = `${layout.bodyHeight}px`;
    editorLayer.style.height = `${layout.bodyHeight}px`;
    editorBody.style.setProperty("--editor-font-size", `${layout.fontSize}px`);
    editorBody.style.setProperty("--editor-line-height", `${layout.lineHeight}px`);
    editorBody.style.setProperty("--editor-code-scale", `${layout.codeScale}`);
    return layout;
  }

  function ensureEditorLinePool(size) {
    while (editorLinePool.length < size) {
      const line = document.createElement("div");
      line.className = "packing-editor-line equal";
      line.innerHTML = '<span class="ln"></span><span class="pm"></span><span class="code"></span>';
      editorLayer.appendChild(line);
      editorLinePool.push(line);
    }
  }

  function syncEditorLine(line, op) {
    const nextClass = `packing-editor-line ${op.tag}`;
    if (line.className !== nextClass) line.className = nextClass;
    const ln = line.querySelector(".ln");
    const pm = line.querySelector(".pm");
    const code = line.querySelector(".code");
    const lineNumber = op.after_index !== null ? op.after_index + 1 : op.before_index + 1;
    const prefix = op.tag === "equal" ? "" : op.tag === "delete" ? "-" : "+";
    if (ln.textContent !== String(lineNumber).padStart(2, "0")) ln.textContent = String(lineNumber).padStart(2, "0");
    if (pm.textContent !== prefix) pm.textContent = prefix;
    if (code.textContent !== op.text) code.textContent = op.text;
  }

  function phaseFor(localT) {
    if (localT < 0.18) return "hold";
    if (localT < 0.40) return "delete";
    if (localT < 0.68) return "insert";
    return "settle";
  }

  function renderEditor(stepIndex, localT) {
    const stage = editorStages[stepIndex] ?? editorStages[editorStages.length - 1];
    const deleteT = ease(clamp((localT - 0.18) / 0.22, 0, 1));
    const insertT = ease(clamp((localT - 0.42) / 0.26, 0, 1));
    const settleT = ease(clamp((localT - 0.42) / 0.16, 0, 1));
    const layout = applyEditorLayout(stage, settleT);
    const ops = stage.ops;

    editorBadge.textContent = stepIndex === 0 ? "run baseline" : `accepted update ${stepIndex} · ${phaseFor(localT)}`;
    editorBadge.classList.toggle("is-phase", stepIndex !== 0);

    const changedOnly = ops.filter((op) => op.tag !== "equal");
    const changedIndices = changedOnly.flatMap((op) => [op.before_index, op.after_index].filter((value) => value !== null));
    if (editorFocus && changedOnly.length) {
      const minIdx = Math.min(...changedIndices);
      const maxIdx = Math.max(...changedIndices);
      const focusTop = mix(12 + minIdx * layout.previousPitch - 6, 12 + minIdx * layout.currentPitch - 6, settleT);
      const focusHeight = mix(
        (maxIdx - minIdx + 1) * layout.previousPitch + 10,
        (maxIdx - minIdx + 1) * layout.currentPitch + 10,
        settleT
      );
      editorFocus.style.opacity = "1";
      editorFocus.style.top = `${Math.max(6, focusTop)}px`;
      editorFocus.style.height = `${focusHeight}px`;
    } else if (editorFocus) {
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
        line.style.transform = `translateY(${mix(afterY + 8, afterY, settleT)}px)`;
        line.style.opacity = `${insertT}`;
      }
    }

    for (let index = ops.length; index < editorLinePool.length; index += 1) {
      editorLinePool[index].style.display = "none";
      editorLinePool[index].style.opacity = "0";
    }
  }

  function renderScore(currentSum, currentGeneration, currentProgress, statusLabel = null) {
    const left = 44;
    const right = 430;
    const top = 34;
    const bottom = 202;
    const minY = Math.min(...steps.map((step) => step.sum_radii));
    const maxY = Math.max(...steps.map((step) => step.sum_radii));
    const progressEnd = Math.max(1, steps.length - 1);
    const xAt = (progress) => left + (progress / progressEnd) * (right - left);
    const radiusSpan = Math.max(0.0001, maxY - minY);
    const scaleStrength = 18;
    const yAt = (value) => {
      const gapRatio = clamp((maxY - value) / radiusSpan, 0, 1);
      const normalized = 1 - (Math.log1p(scaleStrength * gapRatio) / Math.log1p(scaleStrength));
      return bottom - normalized * (bottom - top);
    };
    let best = -Infinity;
    const bestPoints = steps.map((step, index) => {
      best = Math.max(best, step.sum_radii);
      return [xAt(index), yAt(best)];
    });
    const dots = steps.map((step, index) => `<circle class="packing-svg-dot" cx="${xAt(index).toFixed(1)}" cy="${yAt(step.sum_radii).toFixed(1)}" r="1.8" />`).join("");
    const checkpointDots = checkpointFrames.map((checkpoint) => (
      `<circle class="packing-svg-checkpoint" cx="${xAt(checkpoint.progress).toFixed(1)}" cy="${yAt(checkpoint.sum_radii).toFixed(1)}" r="3.3" />`
    )).join("");
    const retainedStep = steps.find((step) => step.sum_radii > 2.3);
    const gridValues = spacedTickValues([
      { value: minY, priority: 0 },
      { value: maxY, priority: 0 },
      { value: retainedStep?.sum_radii, priority: 1 },
      { value: steps[2]?.sum_radii, priority: 2 },
      { value: steps[1]?.sum_radii, priority: 3 },
    ], yAt);
    const tickSteps = [
      steps[0],
      retainedStep,
      steps.find((step) => step.generation >= 60),
      steps.find((step) => step.generation >= 151),
      steps[steps.length - 1],
    ].filter(Boolean);
    const xTicks = uniqueSorted(tickSteps.map((step) => stepPositionByCandidate.get(step.candidate_id)))
      .map((position) => {
        const step = steps[position];
        const x = xAt(position);
        const anchor = position === 0 ? "" : position === progressEnd ? ' text-anchor="end"' : ' text-anchor="middle"';
        return `<text class="packing-svg-text" x="${x.toFixed(1)}" y="220"${anchor}>${step.generation}</text>`;
      }).join("");
    const xGuides = uniqueSorted(tickSteps.slice(1, -1).map((step) => stepPositionByCandidate.get(step.candidate_id)))
      .map((position) => {
        const x = xAt(position);
        return `<path class="packing-svg-guide" d="M${x.toFixed(1)} ${top}V${bottom}" />`;
      }).join("");
    const grid = gridValues.map((value) => {
      const y = yAt(value);
      return `<path class="packing-svg-grid" d="M${left} ${y.toFixed(1)}H${right}" /><text class="packing-svg-text" x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${fmt(value, value < 2 ? 2 : 3)}</text>`;
    }).join("");
    setSvg(scoreSvg, `
      ${grid}
      ${xGuides}
      <path class="packing-svg-axis" d="M${left} ${top}V${bottom}H${right}" />
      ${dots}
      ${checkpointDots}
      <path class="packing-svg-line" d="${linePath(bestPoints)}" />
      <circle class="packing-svg-current" cx="${xAt(currentProgress).toFixed(1)}" cy="${yAt(currentSum).toFixed(1)}" r="5" />
      ${xTicks}
      <text class="packing-svg-text" x="${left}" y="232">global generation</text>
      <text class="packing-svg-value" x="${right}" y="232" text-anchor="end">${statusLabel ?? `Σr = ${fmt(currentSum, 6)}`}</text>
      <text class="packing-svg-text" x="${left}" y="18">Σr gap-scaled, global progress order</text>
    `);
  }

  function diagnostics(packing) {
    const boundaryTol = 1e-7;
    let boundaryContacts = 0;
    let pairContacts = 0;
    let interior = 0;
    packing.centers.forEach(([x, y], index) => {
      const r = packing.radii[index];
      const slacks = [x - r, y - r, 1 - x - r, 1 - y - r];
      const minSlack = Math.min(...slacks);
      if (minSlack > boundaryTol) interior += 1;
      boundaryContacts += slacks.filter((slack) => slack <= boundaryTol).length;
    });
    for (let i = 0; i < packing.radii.length; i += 1) {
      for (let j = i + 1; j < packing.radii.length; j += 1) {
        const dx = packing.centers[i][0] - packing.centers[j][0];
        const dy = packing.centers[i][1] - packing.centers[j][1];
        const slack = Math.hypot(dx, dy) - packing.radii[i] - packing.radii[j];
        if (slack <= boundaryTol) pairContacts += 1;
      }
    }
    return { boundaryContacts, pairContacts, interior };
  }

  function renderPacking(visual) {
    const left = 38;
    const top = 38;
    const size = 384;
    const isTransition = visual.type === "transition";
    const current = visual.current;
    const next = visual.next ?? current;
    const t = visual.transition_t ?? 0;
    const generationLabel = isTransition
      ? `accepted gen ${Math.round(current.generation)} -> ${Math.round(next.generation)}`
      : `validated accepted · gen ${Math.round(current.generation)}`;
    const sumLabel = isTransition
      ? `Σr = ${fmt(visual.current_sum, 6)}`
      : `Σr ${fmt(current.sum_radii, 6)}`;
    const packing = isTransition
      ? {
        centers: current.centers.map(([x, y], index) => {
          const [nextX, nextY] = next.centers[index] ?? [x, y];
          return [mix(x, nextX, t), mix(y, nextY, t)];
        }),
        radii: current.radii.map((radius, index) => mix(radius, next.radii[index] ?? radius, t)),
      }
      : current;
    const diskMarkup = packing.centers.map(([x, y], index) => {
      const radius = packing.radii[index];
      const isLarge = radius > 0.11;
      return `<circle class="packing-circle${isLarge ? " is-large" : ""}${isTransition ? " is-morphing" : " is-current"}" cx="${(left + x * size).toFixed(2)}" cy="${(top + (1 - y) * size).toFixed(2)}" r="${(radius * size).toFixed(2)}" />`;
    }).join("");
    setSvg(packingSvg, `
      <rect class="packing-square" x="${left}" y="${top}" width="${size}" height="${size}" />
      <path class="packing-svg-grid" d="M${left} ${top + size / 2}H${left + size}M${left + size / 2} ${top}V${top + size}" />
      ${diskMarkup}
      <text class="packing-svg-value" x="${left}" y="446">${sumLabel}</text>
      <text class="packing-svg-text" x="${left + size}" y="446" text-anchor="end">${generationLabel}</text>
    `);
  }

  function renderContacts(visual) {
    const isTransition = visual.type === "transition";
    const t = visual.transition_t ?? 0;
    const currentDiag = diagnostics(visual.current);
    const nextDiag = isTransition ? diagnostics(visual.next) : currentDiag;
    const rows = [
      ["boundary contacts", currentDiag.boundaryContacts, nextDiag.boundaryContacts, 26],
      ["pairwise contacts", currentDiag.pairContacts, nextDiag.pairContacts, 70],
      ["interior circles", currentDiag.interior, nextDiag.interior, 26],
    ];
    const markup = rows.map(([label, value, nextValue, max], index) => {
      const y = 48 + index * 54;
      const displayValue = isTransition ? mix(value, nextValue, t) : value;
      const width = clamp((displayValue / max) * 260, 0, 260);
      const seedWidth = clamp((value / max) * 260, 0, 260);
      const nextWidth = clamp((nextValue / max) * 260, 0, 260);
      const valueLabel = String(Math.round(displayValue));
      return `
        <text class="packing-svg-text" x="26" y="${y}">${label}</text>
        <rect class="packing-contact-bar" x="162" y="${y - 12}" width="260" height="14" />
        ${isTransition ? `<rect class="packing-contact-seed" x="162" y="${y - 12}" width="${seedWidth.toFixed(1)}" height="14" />` : ""}
        ${isTransition && value !== nextValue ? `<line class="packing-contact-target" x1="${(162 + nextWidth).toFixed(1)}" y1="${y - 15}" x2="${(162 + nextWidth).toFixed(1)}" y2="${y + 5}" />` : ""}
        <rect class="packing-contact-fill" x="162" y="${y - 12}" width="${width.toFixed(1)}" height="14" />
        <text class="packing-svg-value" x="26" y="${y + 22}">${valueLabel}</text>
      `;
    }).join("");
    const caption = isTransition ? "current contact diagnostics, interpolated during accepted transitions" : "contacts use the public tolerance during replay";
    setSvg(contactSvg, `${markup}<text class="packing-svg-text" x="26" y="210">${caption}</text>`);
  }

  function renderFrame(now = performance.now()) {
    if (document.hidden) {
      requestAnimationFrame(renderFrame);
      return;
    }
    const stepDuration = checkpointFrames.length > 12 ? 2.8 : 5.2;
    const hold = 2.6;
    const total = checkpointFrames.length * stepDuration + hold;
    const t = reduceMotion ? checkpointFrames.length * stepDuration - 1e-6 : (now / 1000) % total;
    const effectiveT = Math.min(t, checkpointFrames.length * stepDuration - 1e-6);
    const index = Math.min(checkpointFrames.length - 1, Math.floor(effectiveT / stepDuration));
    const localRawT = (effectiveT % stepDuration) / stepDuration;
    const checkpoint = checkpointFrames[index];
    const nextCheckpoint = checkpointFrames[Math.min(checkpointFrames.length - 1, index + 1)];
    const transitionStart = checkpointFrames.length > 12 ? 0.24 : 0.42;
    const transitionRawT = nextCheckpoint === checkpoint ? 0 : clamp((localRawT - transitionStart) / (1 - transitionStart), 0, 1);
    const transitionT = ease(transitionRawT);
    const isTransition = transitionT > 0 && nextCheckpoint !== checkpoint;
    const currentProgress = isTransition ? mix(checkpoint.progress, nextCheckpoint.progress, transitionT) : checkpoint.progress;
    const currentSum = isTransition ? mix(checkpoint.sum_radii, nextCheckpoint.sum_radii, transitionT) : checkpoint.sum_radii;
    const currentGeneration = isTransition ? mix(checkpoint.generation, nextCheckpoint.generation, transitionT) : checkpoint.generation;
    const packingVisual = isTransition
      ? { type: "transition", current: checkpoint, next: nextCheckpoint, progress: currentProgress, current_sum: currentSum, current_generation: currentGeneration, transition_t: transitionT }
      : { type: "checkpoint", current: checkpoint, progress: currentProgress, transition_t: 0 };
    const editorStep = isTransition ? Math.min(index + 1, editorStages.length - 1) : index;
    const editorT = isTransition ? transitionRawT : 1;
    const frameKey = `${index}:${Math.round(localRawT * 40)}:${Math.round(transitionT * 60)}:${checkpoint.candidate_id}`;
    if (frameKey !== lastFrameKey) {
      renderEditor(editorStep, editorT);
      renderScore(currentSum, currentGeneration, currentProgress);
      renderPacking(packingVisual);
      renderContacts(packingVisual);
      scoreLabel.textContent = isTransition
        ? `gen ${Math.round(checkpoint.generation)} -> ${Math.round(nextCheckpoint.generation)}`
        : `gen ${Math.round(checkpoint.generation)}`;
      metricStep.textContent = `${Math.round(currentProgress)} / ${steps.length - 1}`;
      metricGen.textContent = String(Math.round(currentGeneration));
      lastMetricsStep = index;
      lastFrameKey = frameKey;
    }
    if (!reduceMotion) requestAnimationFrame(renderFrame);
  }

  renderEditor(0, 1);
  renderScore(steps[0].sum_radii, steps[0].generation, 0);
  const initialPackingVisual = { type: "checkpoint", current: checkpointFrames[0], progress: 0, transition_t: 0 };
  renderPacking(initialPackingVisual);
  renderContacts(initialPackingVisual);
  scoreLabel.textContent = `gen ${steps[0].generation ?? 0}`;
  metricStep.textContent = `0 / ${steps.length - 1}`;
  metricGen.textContent = String(steps[0].generation ?? 0);
  if (reduceMotion) {
    renderFrame();
  } else {
    requestAnimationFrame(renderFrame);
  }
})();
