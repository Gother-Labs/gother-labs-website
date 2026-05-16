(function () {
  const data = window.RCPSP_SURFACE_DATA;
  if (!data || !Array.isArray(data.steps)) return;

  const steps = data.steps;
  const accepted = steps[steps.length - 1];
  const baseline = steps[0];
  const scoreTrace = data.score_trace || null;
  const scoredCandidates = Array.isArray(scoreTrace?.candidates) ? scoreTrace.candidates : steps;
  const bestByGeneration = Array.isArray(scoreTrace?.best_by_generation) ? scoreTrace.best_by_generation : [];
  const generationEnd = scoreTrace?.generation_end ?? Math.max(...steps.map((step) => step.generation ?? step.index ?? 0), 1);
  const displayScoreCap = scoreTrace?.display_score_cap ?? 16;
  const editorLinePool = [];
  const metricStep = document.getElementById("metric-step");
  const metricGen = document.getElementById("metric-gen");
  const signalGains = document.getElementById("signal-gains");
  const signalSeed = document.getElementById("signal-seed");
  const signalBest = document.getElementById("signal-best");
  const editorBody = document.getElementById("editor-body");
  const editorFocus = document.getElementById("editor-focus");
  const editorBadge = document.getElementById("editor-badge");
  const scoreMiniSvg = document.getElementById("score-mini-svg");
  const scoreMiniLabel = document.getElementById("score-mini-label");
  const dispatchSvg = document.getElementById("dispatch-svg");
  const scheduleSvg = document.getElementById("schedule-svg");

  const fmt = (value, digits = 3) => Number(value).toFixed(digits);
  const pct = (value, digits = 2) => `${fmt(value, digits)}%`;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let lastRenderedFrame = "";
  let lastMetricsStep = -1;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  signalGains.textContent = pct(data.meta.improvement_pct, 2);
  signalSeed.textContent = fmt(data.meta.seed_score, 3);
  signalBest.textContent = fmt(data.meta.best_score, 3);

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

  const baselineReplayLines = [
    "def priority_score(act, state) -> float:",
    "    \"\"\"Baseline deterministic dispatch.\"\"\"",
    "    _ = instance",
    "    succ = float(len(act.successors))",
    "    dur = float(act.duration)",
    "    res = float(act.res_pressure)",
    "    tail = float(act.cp_tail)",
    "    wait = max(0, state.wait_time)",
    "",
    "    return (",
    "        3.0 * tail",
    "        + 1.5 * res",
    "        + 0.7 * succ",
    "        + 0.2 * dur",
    "        + 0.05 * wait",
    "        - 0.001 * float(act.id)",
    "    )",
  ];

  const acceptedReplayLines = [
    "def priority_score(act, state) -> float:",
    "    \"\"\"Accepted RCPSP dispatch score.\"\"\"",
    "    cp = act.cp_tail * 3.0",
    "    unlock = (",
    "        act.succ_work * 0.15",
    "        + act.succ_count * 1.5",
    "    )",
    "    resource = (",
    "        act.bottleneck * 100.0",
    "        + act.res_pressure * 10.0",
    "    )",
    "    wait = max(0, state.wait_time) * 1.5",
    "    remaining = state.remaining_work * 0.05",
    "",
    "    return (",
    "        cp + unlock + resource",
    "        + wait + remaining",
    "        - (0.01 * act.id)",
    "    )",
    "",
    "def select_activity(eligible, instance) -> int:",
    "    key = lambda x: (x.state.start, -x.priority)",
    "    return int(min(eligible, key=key).act.id)",
  ];

  const codeSnapshots = [
    baselineReplayLines,
    [
      "def priority_score(act, state) -> float:",
      "    \"\"\"Prioritize critical-path jobs.\"\"\"",
      "    _ = instance",
      "    tail = float(act.cp_tail)",
      "    res = float(act.res_pressure)",
      "    succ = float(len(act.successors))",
      "",
      "    return (",
      "        3.1 * tail",
      "        + 1.6 * res",
      "        + 0.85 * succ",
      "        - 0.001 * float(act.id)",
      "    )",
    ],
    [
      "def priority_score(act, state) -> float:",
      "    \"\"\"Add wait pressure to keep work moving.\"\"\"",
      "    _ = instance",
      "    tail = float(act.cp_tail)",
      "    res = float(act.res_pressure)",
      "    succ = float(len(act.successors))",
      "    wait = max(0, state.wait_time) * 1.25",
      "",
      "    return (",
      "        3.1 * tail",
      "        + 1.6 * res",
      "        + 0.85 * succ",
      "        + wait",
      "        - 0.001 * float(act.id)",
      "    )",
    ],
    [
      "def priority_score(act, state) -> float:",
      "    \"\"\"Score activities that unlock downstream work.\"\"\"",
      "    cp = act.cp_tail * 3.0",
      "    unlock = (",
      "        act.succ_work * 0.15",
      "        + act.succ_count * 1.5",
      "    )",
      "    resource = act.res_pressure * 10.0",
      "    wait = max(0, state.wait_time) * 1.4",
      "",
      "    return (",
      "        cp + unlock + resource",
      "        + wait",
      "        - (0.01 * act.id)",
      "    )",
    ],
    [
      "def priority_score(act, state) -> float:",
      "    \"\"\"Add bottleneck-heavy resource pressure.\"\"\"",
      "    cp = act.cp_tail * 3.0",
      "    unlock = (",
      "        act.succ_work * 0.15",
      "        + act.succ_count * 1.5",
      "    )",
      "    resource = (",
      "        act.bottleneck * 100.0",
      "        + act.res_pressure * 10.0",
      "    )",
      "    wait = max(0, state.wait_time) * 1.5",
      "",
      "    return (",
      "        cp + unlock + resource + wait",
      "        - (0.01 * act.id)",
      "    )",
    ],
    [
      "def priority_score(act, state) -> float:",
      "    \"\"\"Rank and then place the earliest feasible job.\"\"\"",
      "    cp = act.cp_tail * 3.0",
      "    unlock = act.succ_work * 0.15",
      "    resource = act.bottleneck * 100.0",
      "    wait = max(0, state.wait_time) * 1.5",
      "    remaining = state.remaining_work * 0.05",
      "",
      "    return cp + unlock + resource + wait + remaining",
      "",
      "def select_activity(eligible, instance) -> int:",
      "    key = lambda x: (x.state.start, -x.priority)",
      "    return int(min(eligible, key=key).act.id)",
    ],
    acceptedReplayLines,
  ];
  const codeFocusBlocks = [
    { label: "baseline dispatch", start: 3, end: 16 },
    { label: "critical path", start: 3, end: 11 },
    { label: "wait pressure", start: 6, end: 13 },
    { label: "unlock pressure", start: 3, end: 12 },
    { label: "resource bottleneck", start: 7, end: 15 },
    { label: "start selector", start: 10, end: 12 },
    { label: "accepted rule", start: 2, end: 22 },
  ];
  const editorStages = steps.map((_, index) => {
    const beforeLines = codeSnapshots[Math.max(0, index - 1)] ?? codeSnapshots[0];
    const afterLines = codeSnapshots[index] ?? codeSnapshots[codeSnapshots.length - 1];
    const ops = index === 0
      ? afterLines.map((line, lineIndex) => ({
          tag: "equal",
          text: line,
          before_index: lineIndex,
          after_index: lineIndex,
        }))
      : buildOps(beforeLines, afterLines);
    return { before_lines: beforeLines, after_lines: afterLines, ops };
  });

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function highlightPython(line) {
    const escaped = escapeHtml(line);
    return escaped
      .replace(/^(\s*)(def|return|if|for|in|lambda)\b/g, "$1<span class=\"kw\">$2</span>")
      .replace(/\b(max|min|float|int|len|tuple)\b/g, "<span class=\"fn\">$1</span>")
      .replace(/(\"\"\".*\"\"\")/g, "<span class=\"str\">$1</span>")
      .replace(/(#.*)$/g, "<span class=\"cm\">$1</span>")
      .replace(/\b(\d+(?:\.\d+)?)\b/g, "<span class=\"num\">$1</span>");
  }

  function makeEditorLine(op) {
    const line = document.createElement("div");
    line.className = `rcpsp-editor-line ${op.tag}`;
    line.innerHTML = `
      <span class="ln"></span>
      <span class="pm"></span>
      <span class="code"></span>
    `;
    return line;
  }

  function getEditorLayoutForLineCount(lineCount) {
    const pitch = 24;
    return {
      pitch,
      lineHeight: 24,
      bodyHeight: Math.max(420, 24 + lineCount * pitch),
      fontSize: 12.16,
    };
  }

  function applyEditorLayout(stage, settleT) {
    const previousLayout = getEditorLayoutForLineCount(stage.before_lines.length);
    const currentLayout = getEditorLayoutForLineCount(stage.after_lines.length);
    const layout = {
      pitch: currentLayout.pitch,
      lineHeight: currentLayout.lineHeight,
      bodyHeight: mix(previousLayout.bodyHeight, currentLayout.bodyHeight, settleT),
      fontSize: currentLayout.fontSize,
      previousPitch: previousLayout.pitch,
      currentPitch: currentLayout.pitch,
    };
    editorBody.style.height = `${layout.bodyHeight}px`;
    editorBody.style.setProperty("--editor-font-size", `${layout.fontSize}px`);
    editorBody.style.setProperty("--editor-line-height", `${layout.lineHeight}px`);
    return layout;
  }

  function ensureEditorLinePool(size) {
    while (editorLinePool.length < size) {
      const line = makeEditorLine({ tag: "equal", text: "", before_index: 0, after_index: 0 });
      editorBody.appendChild(line);
      editorLinePool.push(line);
    }
  }

  function syncEditorLine(line, op) {
    const nextClass = `rcpsp-editor-line ${op.tag}`;
    if (line.className !== nextClass) {
      line.className = nextClass;
    }

    const ln = line.querySelector(".ln");
    const pm = line.querySelector(".pm");
    const code = line.querySelector(".code");
    const nextLn = String(op.after_index !== null ? op.after_index + 1 : op.before_index + 1);
    const nextPm = op.tag === "equal" ? "" : op.tag === "delete" ? "-" : "+";

    if (ln.textContent !== nextLn) ln.textContent = nextLn;
    if (pm.textContent !== nextPm) pm.textContent = nextPm;
    if (code.textContent !== op.text) {
      code.textContent = op.text;
    }
  }

  function renderCode(stepIndex, localT) {
    const stage = editorStages[stepIndex];
    const deleteT = ease(clamp((localT - 0.18) / 0.22, 0, 1));
    const insertT = ease(clamp((localT - 0.42) / 0.26, 0, 1));
    const settleT = ease(clamp((localT - 0.42) / 0.16, 0, 1));
    const layout = applyEditorLayout(stage, settleT);
    const ops = stage.ops;

    const changedOnly = ops.filter((op) => op.tag !== "equal");
    if (changedOnly.length) {
      const changedIndices = changedOnly.flatMap((op) => [op.before_index, op.after_index].filter((value) => value !== null));
      const minIdx = Math.min(...changedIndices);
      const maxIdx = Math.max(...changedIndices);
      const focusTop = 12 + minIdx * layout.pitch - 6;
      const focusHeight = (maxIdx - minIdx + 1) * layout.pitch + 10;
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

      const beforeY = op.before_index === null ? null : 12 + op.before_index * layout.pitch;
      const afterY = op.after_index === null ? null : 12 + op.after_index * layout.pitch;
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

  function phaseFor(localT) {
    if (localT < 0.18) return "hold";
    if (localT < 0.40) return "delete";
    if (localT < 0.68) return "insert";
    return "settle";
  }

  function setBlockFocus(stepIndex) {
    const block = codeFocusBlocks[stepIndex] ?? codeFocusBlocks[codeFocusBlocks.length - 1];
    const currentLines = codeSnapshots[stepIndex] ?? codeSnapshots[codeSnapshots.length - 1];
    const pitch = getEditorLayoutForLineCount(currentLines.length).pitch;
    editorBadge.textContent = block.label;
    editorBadge.classList.toggle("is-phase", stepIndex !== 0);
    editorFocus.style.opacity = "1";
    editorFocus.style.top = `${12 + block.start * pitch - 5}px`;
    editorFocus.style.height = `${(block.end - block.start + 1) * pitch + 10}px`;
  }

  function setFocus(stepIndex, localT = 1) {
    const phase = phaseFor(localT);
    editorBadge.textContent = stepIndex === 0 ? "run baseline" : `accepted update ${stepIndex} · ${phase}`;
    editorBadge.classList.toggle("is-phase", stepIndex !== 0);
  }

  function bestAt(stepIndex) {
    return Math.min(...steps.slice(0, stepIndex + 1).map((step) => step.score));
  }

  function renderMiniScore(stepIndex, morph) {
    const width = 460;
    const height = 250;
    const pad = { left: 52, right: 14, top: 52, bottom: 42 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const scoreMin = 12;
    const scoreMax = displayScoreCap;
    const xAtGeneration = (generation) => pad.left + plotW * (generation / Math.max(1, generationEnd));
    const yAt = (score) => {
      const visibleScore = Math.min(Math.max(score, scoreMin), scoreMax);
      return pad.top + plotH - ((visibleScore - scoreMin) / (scoreMax - scoreMin)) * plotH;
    };
    const prev = steps[Math.max(0, stepIndex - 1)];
    const curr = steps[stepIndex];
    const markerX = mix(xAtGeneration(prev.generation), xAtGeneration(curr.generation), morph);
    const markerY = mix(yAt(prev.score), yAt(curr.score), morph);
    const bestPath = (bestByGeneration.length ? bestByGeneration : steps).map((point, index) => {
      const generation = point.generation ?? point.index ?? index;
      return `${index === 0 ? "M" : "L"} ${xAtGeneration(generation).toFixed(1)} ${yAt(point.score).toFixed(1)}`;
    }).join(" ");
    const grid = [scoreMax, 14, 12].map((tick) => {
      const y = yAt(tick);
      return `
        <line class="rcpsp-paper-grid" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${pad.left + plotW}" y2="${y.toFixed(1)}" />
        <text class="rcpsp-axis-tick rcpsp-score-y-tick" x="${pad.left - 12}" y="${(y + 3).toFixed(1)}">${tick === scoreMax ? `${tick}+` : tick}</text>
      `;
    }).join("");
    const dots = scoredCandidates.map((candidate) => (
      `<circle class="rcpsp-score-proposal${candidate.score > scoreMax ? " is-clipped" : ""}" cx="${xAtGeneration(candidate.generation).toFixed(1)}" cy="${yAt(candidate.score).toFixed(1)}" r="1.7" />`
    )).join("");
    const xTicks = [0, 40, 80, generationEnd].map((generation) => (
      `<line class="rcpsp-score-x-tick" x1="${xAtGeneration(generation).toFixed(1)}" y1="${pad.top + plotH}" x2="${xAtGeneration(generation).toFixed(1)}" y2="${pad.top + plotH + 5}" />
       <text class="rcpsp-axis-tick rcpsp-score-x-value" x="${xAtGeneration(generation).toFixed(1)}" y="${height - 14}">${generation}</text>`
    )).join("");
    const legend = `
      <g class="rcpsp-score-legend" transform="translate(${pad.left} 24)">
        <g transform="translate(0 0)"><circle class="rcpsp-score-legend-proposal" cx="0" cy="0" r="2.4" /><text x="12" y="4">scored candidate</text></g>
        <g transform="translate(106 0)"><line class="rcpsp-score-legend-best" x1="0" y1="0" x2="16" y2="0" /><text x="24" y="4">best-so-far objective</text></g>
        <g transform="translate(262 0)"><circle class="rcpsp-score-baseline" cx="0" cy="0" r="3.4" /><text x="14" y="4">baseline</text></g>
        <g transform="translate(330 0)"><circle class="rcpsp-score-accepted" cx="0" cy="0" r="3.8" /><text x="14" y="4">accepted</text></g>
      </g>
    `;

    scoreMiniSvg.innerHTML = `
      ${legend}
      ${grid}
      <line class="rcpsp-paper-axis" x1="${pad.left}" y1="${pad.top + plotH}" x2="${pad.left + plotW}" y2="${pad.top + plotH}" />
      <line class="rcpsp-paper-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" />
      <text class="rcpsp-axis-title rcpsp-score-y-label" x="18" y="${pad.top + plotH / 2}" transform="rotate(-90 18 ${pad.top + plotH / 2})">
        <tspan font-style="italic">J</tspan><tspan>(</tspan><tspan font-style="italic">r</tspan><tspan>)</tspan>
      </text>
      ${dots}
      <path class="rcpsp-score-best" d="${bestPath}" />
      <circle class="rcpsp-score-baseline" cx="${xAtGeneration(baseline.generation).toFixed(1)}" cy="${yAt(baseline.score).toFixed(1)}" r="5.4" />
      <circle class="rcpsp-score-accepted" cx="${xAtGeneration(accepted.generation).toFixed(1)}" cy="${yAt(accepted.score).toFixed(1)}" r="5.8" />
      <circle class="rcpsp-score-current" cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="3.8" />
      ${xTicks}
      <text class="rcpsp-axis-title rcpsp-score-x-label" x="${pad.left + plotW / 2}" y="${height - 1}">
        <tspan>generation </tspan><tspan font-style="italic">k</tspan>
      </text>
    `;
    scoreMiniLabel.textContent = `best ${fmt(bestAt(stepIndex), 3)}`;
  }

  function renderDispatch(stepIndex, morph) {
    const prev = steps[Math.max(0, stepIndex - 1)];
    const curr = steps[stepIndex];
    const score = mix(prev.score, curr.score, morph);
    const progress = clamp((baseline.score - score) / (baseline.score - accepted.score), 0, 1);
    const interp = (a, b) => mix(a, b, progress);
    const example = data.schedule_example;
    if (!example || !Array.isArray(example.jobs) || !Array.isArray(example.resource_load_buckets)) return;

    const labelX = 30;
    const laneLeft = 58;
    const laneRight = 410;
    const executableJobs = example.jobs.filter((job) => !job.is_dummy && job.duration > 0);
    const axisStart = example.time_axis?.start || 0;
    const axisEnd = example.time_axis?.end || Math.max(example.seed_makespan, example.accepted_makespan);
    const timeX = (time) => laneLeft + clamp((time - axisStart) / (axisEnd - axisStart), 0, 1) * (laneRight - laneLeft);
    const currentFinish = interp(example.seed_makespan, example.accepted_makespan);
    const rowEnds = [];
    const bars = [...executableJobs]
      .sort((a, b) => (a.accepted_start - b.accepted_start) || (a.id - b.id))
      .map((job) => {
        const spanStart = Math.min(job.seed_start, job.accepted_start);
        const spanEnd = Math.max(job.seed_finish, job.accepted_finish);
        let row = rowEnds.findIndex((end) => spanStart >= end + 1);
        if (row < 0) {
          row = rowEnds.length;
          rowEnds.push(spanEnd);
        } else {
          rowEnds[row] = spanEnd;
        }
        return { ...job, row };
      });
    const rowHeight = rowEnds.length > 6 ? 13 : 20;
    const ganttTop = 96;
    const laneLines = rowEnds.map((_end, index) => {
      const y = ganttTop + index * rowHeight + rowHeight - 3;
      return `M${laneLeft} ${y}H${laneRight}`;
    }).join("");
    const renderSeedBars = bars.map((bar) => {
      const y = ganttTop + bar.row * rowHeight + 5;
      return `<rect class="rcpsp-gap-seed-fill" x="${timeX(bar.seed_start).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(3, timeX(bar.seed_finish) - timeX(bar.seed_start)).toFixed(1)}" height="7" />`;
    }).join("");
    const renderAcceptedBars = bars.map((bar) => {
      const x = interp(bar.seed_start, bar.accepted_start);
      const y = ganttTop + bar.row * rowHeight + 1;
      const w = Math.max(3, timeX(x + bar.duration) - timeX(x));
      return `
        <rect class="rcpsp-schedule-bar" x="${timeX(x).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="9" />
      `;
    }).join("");
    const ganttBase = ganttTop + rowEnds.length * rowHeight + 18;
    const loadLeft = 76;
    const loadRight = 404;
    const loadTopY = 354;
    const loadBaseY = 466;
    const loadTimeX = (time) => loadLeft + clamp((time - axisStart) / (axisEnd - axisStart), 0, 1) * (loadRight - loadLeft);
    const capacityValue = example.resource_capacity || 1;
    const loadMax = Math.max(capacityValue, ...example.resource_load_buckets.flatMap((bucket) => [bucket.seed, bucket.accepted]));
    const loadCapacityY = loadBaseY - (capacityValue / loadMax) * (loadBaseY - loadTopY);
    const visibleBuckets = example.resource_load_buckets.filter((bucket) => (
      bucket.end > axisStart && bucket.start < axisEnd
    ));
    const loadBar = (bucket, value, className) => {
      const start = Math.max(bucket.start, axisStart);
      const end = Math.min(bucket.end, axisEnd);
      const x = loadTimeX(start) + 4;
      const w = Math.max(4, loadTimeX(end) - loadTimeX(start) - 8);
      const h = Math.max(3, (value / loadMax) * (loadBaseY - loadTopY));
      return `<rect class="${className}" x="${x.toFixed(1)}" y="${(loadBaseY - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" />`;
    };
    const loadBars = visibleBuckets
      .map((bucket) => loadBar(bucket, interp(bucket.seed, bucket.accepted), "rcpsp-schedule-load"))
      .join("");
    const seedLoadBars = visibleBuckets
      .map((bucket) => loadBar(bucket, bucket.seed, "rcpsp-schedule-load-seed"))
      .join("");
    const currentCmaxLabel = progress > 0.04
      ? `<text class="rcpsp-axis-tick" x="${(timeX(currentFinish) - 4).toFixed(1)}" y="${ganttBase + 36}" text-anchor="end">Cmax</text>`
      : "";

    dispatchSvg.innerHTML = `
      <text class="rcpsp-figure-title" x="${labelX}" y="24">Schedule compression</text>
      <text class="rcpsp-axis-tick" x="428" y="24" text-anchor="end">gen ${curr.generation}</text>
      <text class="rcpsp-axis-tick" x="${labelX}" y="47">all executable jobs, rendered as unlabeled bars</text>
      <g class="rcpsp-legend" transform="translate(166 78)">
        <rect class="rcpsp-gap-seed-fill" x="0" y="-8" width="12" height="8" /><text x="18" y="0">seed</text>
        <rect class="rcpsp-schedule-bar" x="70" y="-8" width="12" height="8" /><text x="88" y="0">checkpoint</text>
      </g>
      <path class="rcpsp-schedule-gantt-lane" d="${laneLines}" />
      ${renderSeedBars}
      ${renderAcceptedBars}
      <line class="rcpsp-gap-seed-marker" x1="${timeX(example.seed_makespan).toFixed(1)}" y1="${(ganttTop - 8).toFixed(1)}" x2="${timeX(example.seed_makespan).toFixed(1)}" y2="${(ganttBase - 5).toFixed(1)}" />
      <line class="rcpsp-gap-current-marker" x1="${timeX(currentFinish).toFixed(1)}" y1="${(ganttTop - 12).toFixed(1)}" x2="${timeX(currentFinish).toFixed(1)}" y2="${(ganttBase - 1).toFixed(1)}" />
      ${currentCmaxLabel}
      <path class="rcpsp-paper-axis" d="M${laneLeft} ${ganttBase}H${laneRight}" />
      <text class="rcpsp-axis-tick" x="${laneLeft}" y="${ganttBase + 16}">${fmt(axisStart, 0)}</text>
      <text class="rcpsp-axis-tick" x="${timeX(60).toFixed(1)}" y="${ganttBase + 16}" text-anchor="middle">60</text>
      <text class="rcpsp-axis-tick" x="${laneRight}" y="${ganttBase + 16}" text-anchor="end">120</text>
      <text class="rcpsp-axis-tick" x="${(timeX(example.seed_makespan) + 4).toFixed(1)}" y="${ganttBase + 36}">seed Cmax</text>
      <line class="rcpsp-paper-grid" x1="${labelX}" y1="282" x2="428" y2="282" />
      <text class="rcpsp-gap-row-title" x="${labelX}" y="306">renewable resource load</text>
      <text class="rcpsp-dispatch-label" x="${labelX}" y="326">Full-instance Resource ${((example.resource_index || 0) + 1)} demand; feasible below capacity ${capacityValue}</text>
      <g class="rcpsp-legend" transform="translate(${labelX} 344)">
        <rect class="rcpsp-schedule-load-seed" x="0" y="-8" width="12" height="8" /><text x="18" y="0">seed load</text>
        <rect class="rcpsp-schedule-load" x="82" y="-8" width="12" height="8" /><text x="100" y="0">checkpoint load</text>
        <line class="rcpsp-capacity" x1="216" y1="-4" x2="238" y2="-4" /><text x="246" y="0">capacity</text>
      </g>
      <line class="rcpsp-paper-axis" x1="${loadLeft}" y1="${loadTopY}" x2="${loadLeft}" y2="${loadBaseY}" />
      <line class="rcpsp-paper-axis" x1="${loadLeft}" y1="${loadBaseY}" x2="${loadRight}" y2="${loadBaseY}" />
      <line class="rcpsp-paper-grid" x1="${loadLeft}" y1="${loadCapacityY.toFixed(1)}" x2="${loadRight}" y2="${loadCapacityY.toFixed(1)}" />
      <text class="rcpsp-axis-tick" x="${loadLeft - 8}" y="${loadBaseY + 3}" text-anchor="end">0</text>
      <text class="rcpsp-axis-tick" x="${loadLeft - 8}" y="${loadCapacityY + 3}" text-anchor="end">cap</text>
      <text class="rcpsp-axis-tick" x="${loadLeft}" y="${loadBaseY + 20}" text-anchor="middle">${fmt(axisStart, 0)}</text>
      <text class="rcpsp-axis-tick" x="${(loadLeft + loadRight) / 2}" y="${loadBaseY + 20}" text-anchor="middle">time</text>
      <text class="rcpsp-axis-tick" x="${loadRight}" y="${loadBaseY + 20}" text-anchor="middle">${fmt(axisEnd, 0)}</text>
      <text class="rcpsp-axis-title" x="${loadLeft - 35}" y="${(loadTopY + loadBaseY) / 2}" transform="rotate(-90 ${loadLeft - 35} ${(loadTopY + loadBaseY) / 2})">demand</text>
      <text class="rcpsp-axis-tick" x="${loadRight}" y="${loadCapacityY - 6}" text-anchor="end">capacity line</text>
      <line class="rcpsp-capacity" x1="${loadLeft}" y1="${loadCapacityY.toFixed(1)}" x2="${loadRight}" y2="${loadCapacityY.toFixed(1)}" />
      ${loadBars}
      ${seedLoadBars}
    `;
  }

  function renderSchedule(stepIndex, morph) {
    const prev = steps[Math.max(0, stepIndex - 1)];
    const curr = steps[stepIndex];
    const meanGap = mix(prev.mean_gap_pct, curr.mean_gap_pct, morph);
    const p95Gap = mix(prev.p95_gap_pct, curr.p95_gap_pct, morph);
    const left = 54;
    const right = 386;
    const labelX = 30;
    const valueX = 428;
    const width = right - left;
    const gapMax = 24;
    const xAtGap = (gap) => left + clamp(gap / gapMax, 0, 1) * width;
    const row = (y, title, seedGap, currentGap, acceptedGap) => {
      const seedX = xAtGap(seedGap);
      const currentX = xAtGap(currentGap);
      const acceptedX = xAtGap(acceptedGap);
      const seedReduction = Math.max(0, seedGap - currentGap);
      const deltaLabel = seedReduction >= 0.05
        ? `${fmt(seedReduction, 2)} pp lower than seed`
        : "";
      return `
        <g class="rcpsp-gap-row">
          <text class="rcpsp-gap-row-title" x="${labelX}" y="${y}">${title}</text>
          <text class="rcpsp-gap-value rcpsp-gap-value-current" x="${valueX}" y="${y}" text-anchor="end">${pct(currentGap, 2)}</text>
          <rect class="rcpsp-gap-track" x="${left}" y="${y + 22}" width="${width}" height="10" rx="0" />
          <rect class="rcpsp-gap-current-fill" x="${left}" y="${y + 22}" width="${Math.max(1, currentX - left).toFixed(1)}" height="10" rx="0" />
          <line class="rcpsp-gap-seed-marker" x1="${seedX.toFixed(1)}" y1="${y + 13}" x2="${seedX.toFixed(1)}" y2="${y + 43}" />
          <line class="rcpsp-schedule-final" x1="${acceptedX.toFixed(1)}" y1="${y + 13}" x2="${acceptedX.toFixed(1)}" y2="${y + 43}" />
          <line class="rcpsp-gap-current-marker" x1="${currentX.toFixed(1)}" y1="${y + 9}" x2="${currentX.toFixed(1)}" y2="${y + 47}" />
          <circle class="rcpsp-gap-current-dot" cx="${currentX.toFixed(1)}" cy="${y + 27}" r="4.2" />
          <text class="rcpsp-gap-delta" x="${labelX}" y="${y + 60}">${deltaLabel}</text>
        </g>
      `;
    };
    scheduleSvg.innerHTML = `
      <text class="rcpsp-figure-title" x="${labelX}" y="24">Portfolio gap readout</text>
      <g class="rcpsp-legend" transform="translate(${labelX} 54)">
        <line class="rcpsp-gap-seed-marker" x1="0" y1="-10" x2="0" y2="4" /><text x="10" y="0">seed</text>
        <circle class="rcpsp-gap-current-dot" cx="64" cy="-3" r="4" /><text x="76" y="0">checkpoint</text>
        <line class="rcpsp-schedule-final" x1="176" y1="-10" x2="176" y2="4" /><text x="186" y="0">final accepted</text>
      </g>
      ${row(108, "Mean portfolio gap", baseline.mean_gap_pct, meanGap, accepted.mean_gap_pct)}
      ${row(214, "p95 tail gap", baseline.p95_gap_pct, p95Gap, accepted.p95_gap_pct)}
    `;
  }

  function renderFrame(now) {
    if (document.hidden) {
      requestAnimationFrame(renderFrame);
      return;
    }
    const stepDuration = 5.2;
    const hold = 2.2;
    const total = steps.length * stepDuration + hold;
    const t = (now / 1000) % total;
    const effectiveT = Math.min(t, steps.length * stepDuration - 1e-6);
    const stepIndex = Math.min(steps.length - 1, Math.floor(effectiveT / stepDuration));
    const localT = (effectiveT % stepDuration) / stepDuration;
    const morph = ease(clamp((localT - 0.26) / 0.56, 0, 1));
    const frameKey = `${stepIndex}:${Math.round(localT * 40)}:${Math.round(morph * 24)}`;

    if (frameKey === lastRenderedFrame) {
      requestAnimationFrame(renderFrame);
      return;
    }
    lastRenderedFrame = frameKey;

    if (stepIndex !== lastMetricsStep) {
      metricStep.textContent = `${stepIndex} / ${steps.length - 1}`;
      metricGen.textContent = String(steps[stepIndex].generation);
      lastMetricsStep = stepIndex;
    }
    renderCode(stepIndex, localT);
    setFocus(stepIndex, localT);
    renderMiniScore(stepIndex, morph);
    renderDispatch(stepIndex, morph);
    renderSchedule(stepIndex, morph);
    requestAnimationFrame(renderFrame);
  }

  renderCode(0, 1);
  setFocus(0, 1);
  renderMiniScore(0, 1);
  renderDispatch(0, 1);
  renderSchedule(0, 1);
  if (reduceMotion) {
    metricStep.textContent = `${steps.length - 1} / ${steps.length - 1}`;
    metricGen.textContent = String(accepted.generation);
    renderCode(steps.length - 1, 1);
    setFocus(steps.length - 1, 1);
    renderMiniScore(steps.length - 1, 1);
    renderDispatch(steps.length - 1, 1);
    renderSchedule(steps.length - 1, 1);
  } else {
    requestAnimationFrame(renderFrame);
  }
})();
