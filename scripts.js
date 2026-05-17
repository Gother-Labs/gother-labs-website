const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear().toString();
}

const animatedSymbolPage =
  document.body.classList.contains("home-page") ||
  document.body.classList.contains("not-found-page");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

if (animatedSymbolPage && !reducedMotionQuery.matches) {
  initializeThreeBodySystem();
}

initializeEvolutionDemo();

function initializeEvolutionDemo() {
  const demo = document.querySelector("[data-evolution-demo]");

  if (!demo) {
    return;
  }

  const svgNamespace = "http://www.w3.org/2000/svg";
  const island = demo.querySelector("[data-evolution-island]");
  const seedMarker = demo.querySelector("[data-seed-marker]");
  const proposalPath = demo.querySelector("[data-proposal-path]");
  const returnPath = demo.querySelector("[data-return-path]");
  const llmNode = demo.querySelector("[data-llm-node]");
  const generationNode = demo.querySelector("[data-loop-generation]");
  const stepNodes = Array.from(demo.querySelectorAll("[data-step-label]"));

  if (
    !island ||
    !seedMarker ||
    !proposalPath ||
    !returnPath ||
    !llmNode ||
    !generationNode
  ) {
    return;
  }

  const cells = [];
  const cellMap = new Map();
  const islandModel = {
    origin: { x: 322, y: 184 },
    columns: 6,
    rows: 4,
  };
  const cellU = { x: 44, y: 24 };
  const cellV = { x: -44, y: 24 };
  const islandDepth = 28;
  const scenarios = [
    { parent: "2-1", target: "3-1", accepted: true },
    { parent: "3-1", target: "4-1", accepted: true },
    { parent: "4-1", target: "5-2", accepted: false },
    { parent: "4-1", target: "2-2", accepted: true },
    { parent: "2-2", target: "1-2", accepted: true },
    { parent: "1-2", target: "1-3", accepted: true },
  ];
  const seedCellKey = scenarios[0].parent;
  const evaluationPoint = { x: 676, y: 137 };
  const initialHold = 850;
  const cycleDurations = [3000, 3000, 3000, 1850, 1750, 1650];
  const loopDuration = cycleDurations.reduce((total, duration) => total + duration, 0);

  renderEvolutionIsland();

  for (let row = 0; row < islandModel.rows; row += 1) {
    for (let column = 0; column < islandModel.columns; column += 1) {
      const key = `${column}-${row}`;
      const center = cellCenter(column, row);
      const points = cellPoints(column, row);
      const cellNode = document.createElementNS(svgNamespace, "polygon");
      cellNode.setAttribute("points", pointsAttribute(points));
      cellNode.classList.add("evolution-cell");

      island.append(cellNode);

      const cell = {
        key,
        center,
        pathStart: { x: points[1].x + 8, y: points[1].y - 12 },
        node: cellNode,
      };
      cells.push(cell);
      cellMap.set(key, cell);
    }
  }

  let animationFrameId = 0;
  let animationStart = 0;

  if (!reducedMotionQuery.matches) {
    animationFrameId = window.requestAnimationFrame(runEvolutionLoop);
  } else {
    renderEvolutionFrame(initialHold + cycleDurations[2] * 0.72);
  }

  window.addEventListener("pagehide", () => {
    window.cancelAnimationFrame(animationFrameId);
  });

  renderEvolutionFrame(0);

  function runEvolutionLoop(timestamp) {
    if (!animationStart) {
      animationStart = timestamp;
    }

    renderEvolutionFrame(timestamp - animationStart);
    animationFrameId = window.requestAnimationFrame(runEvolutionLoop);
  }

  function renderEvolutionFrame(elapsed) {
    const isInitialEmptyGeneration = elapsed < initialHold;
    const activeElapsed = Math.max(0, elapsed - initialHold);
    const timeline = isInitialEmptyGeneration
      ? { completedCycles: 0, cycleProgress: 0, scenarioIndex: 0 }
      : timelinePosition(activeElapsed);
    const { completedCycles, cycleProgress, scenarioIndex } = timeline;
    const generation = isInitialEmptyGeneration ? 0 : (completedCycles % 999) + 1;
    const scenario = scenarios[scenarioIndex];
    const parentCell = cellMap.get(scenario.parent);
    const targetCell = cellMap.get(scenario.target);

    if (!parentCell || !targetCell) {
      return;
    }

    if (isInitialEmptyGeneration) {
      renderInitialEvolutionFrame();
      return;
    }

    const occupiedCells = occupiedCellsFor(completedCycles);
    const streamProgress = easeInOutSine(clamp((cycleProgress - 0.02) / 0.82, 0, 1));
    const targetPreviewProgress = smoothstep(clamp((cycleProgress - 0.14) / 0.28, 0, 1));
    const replacementProgress = smoothstep(clamp((cycleProgress - 0.68) / 0.22, 0, 1));
    const lineFadeIn = smoothstep(clamp((cycleProgress - 0.02) / 0.18, 0, 1));
    const lineFadeOut = 1 - smoothstep(clamp((cycleProgress - 0.86) / 0.12, 0, 1));
    const lineOpacity = lineFadeIn * lineFadeOut;
    const llmIntensity =
      smoothstep(clamp((cycleProgress - 0.24) / 0.28, 0, 1)) *
      (1 - smoothstep(clamp((cycleProgress - 0.84) / 0.12, 0, 1)));

    for (const cell of cells) {
      cell.node.classList.toggle("is-occupied", occupiedCells.has(cell.key));
      cell.node.classList.remove("is-seed", "is-parent", "is-target", "is-new");
    }

    const seedCell = cellMap.get(seedCellKey);
    if (seedCell) {
      seedCell.node.classList.add("is-seed");
      seedMarker.classList.add("is-active");
      seedMarker.setAttribute("cx", (seedCell.center.x - 13).toString());
      seedMarker.setAttribute("cy", (seedCell.center.y - 7).toString());
    }

    parentCell.node.classList.add("is-parent");

    if (targetPreviewProgress > 0) {
      targetCell.node.classList.add("is-target");
    }

    if (scenario.accepted && replacementProgress > 0.7) {
      targetCell.node.classList.add("is-new");
    }

    const evaluationPath = createEvaluationPath(targetCell.pathStart, evaluationPoint);
    drawRailPath(returnPath, evaluationPath.d, lineOpacity * 0.14);
    drawStreamPath(proposalPath, evaluationPath, streamProgress, lineOpacity * 0.72);
    llmNode.style.opacity = (0.34 + llmIntensity * 0.66).toString();
    llmNode.classList.toggle("is-active", llmIntensity > 0.08);
    llmNode.classList.toggle("is-approved", scenario.accepted && replacementProgress > 0.48);
    llmNode.classList.toggle("is-rejected", !scenario.accepted && replacementProgress > 0.48);

    generationNode.textContent = `GEN ${generation.toString().padStart(3, "0")}`;

    for (const stepNode of stepNodes) {
      stepNode.classList.remove("is-active");
    }
  }

  function renderInitialEvolutionFrame() {
    for (const cell of cells) {
      cell.node.classList.remove("is-occupied", "is-seed", "is-parent", "is-target", "is-new");
    }

    const seedCell = cellMap.get(seedCellKey);
    if (seedCell) {
      seedCell.node.classList.add("is-seed");
      seedMarker.classList.add("is-active");
      seedMarker.setAttribute("cx", (seedCell.center.x - 13).toString());
      seedMarker.setAttribute("cy", (seedCell.center.y - 7).toString());
    }

    proposalPath.setAttribute("d", "");
    returnPath.setAttribute("d", "");
    proposalPath.style.opacity = "0";
    returnPath.style.opacity = "0";
    proposalPath.classList.remove("is-active");
    returnPath.classList.remove("is-active");
    llmNode.style.opacity = "";
    llmNode.classList.remove("is-active", "is-approved", "is-rejected");
    generationNode.textContent = "GEN 000";

    for (const stepNode of stepNodes) {
      stepNode.classList.remove("is-active");
    }
  }

  function renderEvolutionIsland() {
    const corners = planeCorners();
    const drop = { x: 0, y: islandDepth };

    island.append(
      createSvg("polygon", {
        class: "evolution-island-side",
        points: pointsAttribute([
          corners.topRight,
          corners.bottomRight,
          add(corners.bottomRight, drop),
          add(corners.topRight, drop),
        ]),
      }),
      createSvg("polygon", {
        class: "evolution-island-side",
        points: pointsAttribute([
          corners.bottomLeft,
          corners.bottomRight,
          add(corners.bottomRight, drop),
          add(corners.bottomLeft, drop),
        ]),
      }),
      createSvg("polygon", {
        class: "evolution-island-top",
        points: pointsAttribute([
          corners.topLeft,
          corners.topRight,
          corners.bottomRight,
          corners.bottomLeft,
        ]),
      })
    );
  }

  function createSvg(tagName, attributes = {}) {
    const node = document.createElementNS(svgNamespace, tagName);

    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, String(value));
    }

    return node;
  }

  function add(point, vector) {
    return {
      x: point.x + vector.x,
      y: point.y + vector.y,
    };
  }

  function scale(vector, factor) {
    return {
      x: vector.x * factor,
      y: vector.y * factor,
    };
  }

  function cellBase(column, row) {
    return add(islandModel.origin, add(scale(cellU, column), scale(cellV, row)));
  }

  function cellPoints(column, row) {
    const base = cellBase(column, row);

    return [base, add(base, cellU), add(add(base, cellU), cellV), add(base, cellV)];
  }

  function cellCenter(column, row) {
    const base = cellBase(column, row);

    return {
      x: base.x,
      y: base.y + (cellU.y + cellV.y) / 2,
    };
  }

  function planeCorners() {
    const topLeft = islandModel.origin;
    const topRight = add(topLeft, scale(cellU, islandModel.columns));
    const bottomRight = add(topRight, scale(cellV, islandModel.rows));
    const bottomLeft = add(topLeft, scale(cellV, islandModel.rows));

    return { topLeft, topRight, bottomRight, bottomLeft };
  }

  function pointsAttribute(points) {
    return points.map((point) => `${point.x},${point.y}`).join(" ");
  }

  function occupiedCellsFor(completedCycles) {
    const occupiedCells = new Set();
    const completedScenarioCount = Math.min(completedCycles, scenarios.length);

    for (let index = 0; index < completedScenarioCount; index += 1) {
      const scenario = scenarios[index];

      if (scenario.accepted) {
        occupiedCells.add(scenario.target);
      }
    }

    return occupiedCells;
  }

  function timelinePosition(activeElapsed) {
    const completedLoops = Math.floor(activeElapsed / loopDuration);
    let elapsedInLoop = activeElapsed % loopDuration;
    let scenarioIndex = 0;

    for (let index = 0; index < cycleDurations.length; index += 1) {
      const duration = cycleDurations[index];

      if (elapsedInLoop < duration) {
        scenarioIndex = index;
        break;
      }

      elapsedInLoop -= duration;
    }

    return {
      completedCycles: completedLoops * scenarios.length + scenarioIndex,
      cycleProgress: elapsedInLoop / cycleDurations[scenarioIndex],
      scenarioIndex,
    };
  }

  function drawStreamPath(pathNode, curve, progress, opacity) {
    const boundedProgress = clamp(progress, 0, 1);
    const boundedOpacity = clamp(opacity, 0, 1);
    pathNode.classList.toggle("is-active", boundedOpacity > 0.01);
    pathNode.style.opacity = boundedOpacity.toString();

    if (boundedProgress <= 0.04 || boundedOpacity <= 0.01) {
      pathNode.setAttribute("d", "");
      return;
    }

    const travelProgress = easeInOutSine((boundedProgress - 0.04) / 0.96);
    const segmentLength = 0.34;
    const visibleStart = 0.22;
    const headProgress = Math.min(1, travelProgress);
    const tailProgress = Math.max(visibleStart, headProgress - segmentLength);

    if (headProgress - tailProgress < 0.018) {
      pathNode.setAttribute("d", "");
      return;
    }

    const points = sampleCubicSegment(curve, tailProgress, headProgress, 12);
    pathNode.setAttribute("d", pointsToPath(points));
  }

  function drawRailPath(pathNode, pathData, opacity) {
    const boundedOpacity = clamp(opacity, 0, 1);
    pathNode.setAttribute("d", pathData);
    pathNode.classList.toggle("is-active", boundedOpacity > 0.01);
    pathNode.style.opacity = boundedOpacity.toString();

    if (boundedOpacity <= 0.01) {
      pathNode.style.strokeDasharray = "1";
      pathNode.style.strokeDashoffset = "1";
      return;
    }

    const pathLength = pathNode.getTotalLength();
    pathNode.style.strokeDasharray = pathLength.toString();
    pathNode.style.strokeDashoffset = "0";
  }

  function createEvaluationPath(startPoint, endpoint) {
    const start = startPoint;
    const end = { x: endpoint.x - 16, y: endpoint.y + 2 };
    const deltaX = end.x - start.x;
    const lift = Math.max(70, Math.min(126, Math.abs(deltaX) * 0.34));
    const controlA = {
      x: start.x + deltaX * 0.18,
      y: start.y - lift,
    };
    const controlB = {
      x: end.x - deltaX * 0.28,
      y: end.y + 8,
    };

    return {
      start,
      controlA,
      controlB,
      end,
      d: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`,
    };
  }

  function sampleCubicSegment(curve, startProgress, endProgress, steps) {
    const points = [];

    for (let index = 0; index <= steps; index += 1) {
      const localProgress = index / steps;
      const progress = startProgress + (endProgress - startProgress) * localProgress;
      points.push(pointOnCubic(curve, progress));
    }

    return points;
  }

  function pointOnCubic(curve, progress) {
    const t = clamp(progress, 0, 1);
    const inverse = 1 - t;
    const startWeight = inverse * inverse * inverse;
    const controlAWeight = 3 * inverse * inverse * t;
    const controlBWeight = 3 * inverse * t * t;
    const endWeight = t * t * t;

    return {
      x:
        curve.start.x * startWeight +
        curve.controlA.x * controlAWeight +
        curve.controlB.x * controlBWeight +
        curve.end.x * endWeight,
      y:
        curve.start.y * startWeight +
        curve.controlA.y * controlAWeight +
        curve.controlB.y * controlBWeight +
        curve.end.y * endWeight,
    };
  }

  function pointsToPath(points) {
    if (!points.length) {
      return "";
    }

    const [firstPoint, ...remainingPoints] = points;
    const commands = remainingPoints.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);

    return `M ${firstPoint.x.toFixed(2)} ${firstPoint.y.toFixed(2)} ${commands.join(" ")}`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function smoothstep(value) {
    const clampedValue = clamp(value, 0, 1);

    return clampedValue * clampedValue * (3 - 2 * clampedValue);
  }

  function easeInOutSine(value) {
    const clampedValue = clamp(value, 0, 1);

    return -(Math.cos(Math.PI * clampedValue) - 1) / 2;
  }
}

function initializeThreeBodySystem() {
  const symbolScope = document.querySelector(".animated-symbol-scope");
  const referenceGeometry = symbolScope?.querySelector(".animated-reference-geometry");
  const bodyNodes = Array.from(
    symbolScope?.querySelectorAll(".live-geometry-dot") || []
  );
  const trailNodes = Array.from(
    symbolScope?.querySelectorAll(".live-trail") || []
  );

  if (
    !(referenceGeometry instanceof SVGElement) ||
    bodyNodes.length !== 3 ||
    trailNodes.length !== 3
  ) {
    return;
  }

  const wakeDelayMs = 3200;
  const settleDelayMs = 420;
  const activeDurationMs = 200000;
  const collapseDurationMs = 1200;
  const resetDelayMs = 220;
  const integratorStep = 1 / 240;
  const simulationSpeed = 1;
  const historyLength = 240;
  const gravityStrength = 2200;
  const softening = 12;
  let state = null;
  let history = [];
  let accumulator = 0;
  let lastFrameTime = performance.now();
  let isAwake = false;
  let gravityActive = false;
  let phase = "idle";
  let phaseStartTime = performance.now();
  let collapseSourceState = null;
  let collapseReferenceState = null;
  let referenceState = null;
  let wakeTimeoutId = 0;
  let gravityTimeoutId = 0;
  let collapseTimeoutId = 0;
  let resetTimeoutId = 0;

  resetToReference();
  scheduleWakeSequence();

  window.addEventListener("resize", handleViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleViewportChange);
  }
  requestAnimationFrame(frame);

  function frame(now) {
    const elapsedSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;

    if (phase === "idle" || phase === "settling") {
      const pinnedReferenceState = createStateFromReferenceGlyph(referenceGeometry);
      referenceState = cloneSystemState(pinnedReferenceState);

      if (!state || phase === "idle") {
        state = {
          positions: pinnedReferenceState.positions.map(copyVector),
          velocities: pinnedReferenceState.positions.map(() => ({ x: 0, y: 0 })),
          masses: pinnedReferenceState.positions.map(() => 1),
          radii: pinnedReferenceState.radii.slice(),
        };
      } else {
        state.positions = pinnedReferenceState.positions.map(copyVector);
        state.radii = pinnedReferenceState.radii.slice();
      }
    }

    if (isAwake && gravityActive && phase === "gravity") {
      accumulator += elapsedSeconds * simulationSpeed;

      while (accumulator >= integratorStep) {
        stepThreeBodyState(state, integratorStep, gravityStrength, softening);
        recordHistory(history, state.positions, historyLength);
        accumulator -= integratorStep;
      }
    }

    if (phase === "collapsing" && collapseSourceState && collapseReferenceState) {
      const progress = Math.min((now - phaseStartTime) / collapseDurationMs, 1);
      const easedProgress = easeInOutCubic(progress);

      state.positions = collapseSourceState.positions.map((position, index) => ({
        x: position.x + (collapseReferenceState.positions[index].x - position.x) * easedProgress,
        y: position.y + (collapseReferenceState.positions[index].y - position.y) * easedProgress,
      }));
      state.radii = collapseSourceState.radii.map((radius) => radius * (1 - easedProgress));
    }

    render(isAwake ? 1 : 0);
    requestAnimationFrame(frame);
  }

  function render(progress) {
    if (progress <= 0 || !state) {
      return;
    }

    drawTrails(trailNodes, history);
    syncBodyNodes(bodyNodes, state.positions, state.radii);
  }

  function resetToReference() {
    window.clearTimeout(wakeTimeoutId);
    window.clearTimeout(gravityTimeoutId);
    window.clearTimeout(collapseTimeoutId);
    window.clearTimeout(resetTimeoutId);
    document.body.classList.remove("logo-awake", "gravity-live");
    state = null;
    history = [];
    accumulator = 0;
    isAwake = false;
    gravityActive = false;
    phase = "idle";
    collapseSourceState = null;
    collapseReferenceState = null;
    referenceState = null;

    const previewState = createStateFromReferenceGlyph(referenceGeometry);
    referenceState = cloneSystemState(previewState);
    syncBodyNodes(bodyNodes, previewState.positions, previewState.radii);
    drawTrails(trailNodes, []);
    render(0);
  }

  function scheduleWakeSequence() {
    wakeTimeoutId = window.setTimeout(() => {
      if (!state) {
        state = createStateFromReferenceGlyph(referenceGeometry);
      }
      referenceState = cloneSystemState(state);
      history = state.positions.map((position) => [copyVector(position)]);
      phase = "settling";
      phaseStartTime = performance.now();
      syncBodyNodes(bodyNodes, state.positions, state.radii);
      isAwake = true;
      render(1);
      requestAnimationFrame(() => {
        document.body.classList.add("logo-awake");
      });
      gravityTimeoutId = window.setTimeout(() => {
        applyWakePerturbation(state);
        gravityActive = true;
        phase = "gravity";
        phaseStartTime = performance.now();
        document.body.classList.add("gravity-live");
        collapseTimeoutId = window.setTimeout(() => {
          beginCollapse();
        }, activeDurationMs);
      }, settleDelayMs);
    }, wakeDelayMs);
  }

  function handleViewportChange() {
    const nextReferenceState = createStateFromReferenceGlyph(referenceGeometry);

    if (!isAwake) {
      resetToReference();
      scheduleWakeSequence();
      return;
    }

    if (state) {
      if (referenceState) {
        const transform = createReferenceTransform(referenceState, nextReferenceState);
        applyTransformToState(state, transform);
        applyTransformToHistory(history, transform);

        if (collapseSourceState) {
          applyTransformToState(collapseSourceState, transform);
        }

        if (collapseReferenceState) {
          collapseReferenceState = cloneSystemState(nextReferenceState);
        }

        referenceState = cloneSystemState(nextReferenceState);
      } else {
        referenceState = cloneSystemState(nextReferenceState);
      }

      syncBodyNodes(bodyNodes, state.positions, state.radii);
    }
  }

  function beginCollapse() {
    if (!state || phase !== "gravity") {
      return;
    }

    gravityActive = false;
    accumulator = 0;
    phase = "collapsing";
    phaseStartTime = performance.now();
    collapseSourceState = {
      positions: state.positions.map(copyVector),
      radii: state.radii.slice(),
    };
    collapseReferenceState = createStateFromReferenceGlyph(referenceGeometry);
    referenceState = cloneSystemState(collapseReferenceState);

    resetTimeoutId = window.setTimeout(() => {
      resetToReference();
      scheduleWakeSequence();
    }, collapseDurationMs + resetDelayMs);
  }
}

function createStateFromReferenceGlyph(referenceGeometry) {
  const glyphPoints = geometryPointsFromReferenceMark(referenceGeometry);
  return {
    positions: glyphPoints.map((point) => ({ x: point.x, y: point.y })),
    velocities: glyphPoints.map(() => ({ x: 0, y: 0 })),
    masses: glyphPoints.map(() => 1),
    radii: glyphPoints.map((point) => point.radius),
  };
}

function geometryPointsFromReferenceMark(referenceGeometry) {
  const circles = Array.from(referenceGeometry.querySelectorAll(".source-geometry-dot"));
  const viewBox = referenceGeometry.viewBox.baseVal;

  if (circles.length !== 3 || !viewBox || !viewBox.width || !viewBox.height) {
    return null;
  }

  const rawPoints = circles
    .map((circle) => {
      const cx = parseFloat(circle.getAttribute("cx") || "0");
      const cy = parseFloat(circle.getAttribute("cy") || "0");
      const r = parseFloat(circle.getAttribute("r") || "0");

      return {
        x: cx,
        y: cy,
        radius: r,
      };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  return rawPoints;
}

function stepThreeBodyState(state, dt, gravityStrength, softening) {
  const initialAccelerations = computeAccelerations(state.positions, state.masses, gravityStrength, softening);
  const nextPositions = state.positions.map((position, index) => ({
    x: position.x + state.velocities[index].x * dt + 0.5 * initialAccelerations[index].x * dt * dt,
    y: position.y + state.velocities[index].y * dt + 0.5 * initialAccelerations[index].y * dt * dt,
  }));
  const nextAccelerations = computeAccelerations(nextPositions, state.masses, gravityStrength, softening);

  state.positions = nextPositions;
  state.velocities = state.velocities.map((velocity, index) => ({
    x: velocity.x + 0.5 * (initialAccelerations[index].x + nextAccelerations[index].x) * dt,
    y: velocity.y + 0.5 * (initialAccelerations[index].y + nextAccelerations[index].y) * dt,
  }));
}

function applyWakePerturbation(state) {
  if (!state || state.velocities.length !== 3) {
    return;
  }

  const perturbation = [
    { x: 1.8, y: -1.2 },
    { x: -1.1, y: 0.7 },
    { x: -0.7, y: 0.5 },
  ];

  state.velocities = state.velocities.map((velocity, index) => ({
    x: velocity.x + perturbation[index].x,
    y: velocity.y + perturbation[index].y,
  }));
}

function computeAccelerations(positions, masses, gravityStrength, softening) {
  return positions.map((position, index) => {
    const acceleration = { x: 0, y: 0 };

    positions.forEach((otherPosition, otherIndex) => {
      if (index === otherIndex) {
        return;
      }

      const deltaX = otherPosition.x - position.x;
      const deltaY = otherPosition.y - position.y;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY + softening * softening;
      const distance = Math.sqrt(distanceSquared);
      const factor = (gravityStrength * masses[otherIndex]) / (distanceSquared * distance);

      acceleration.x += deltaX * factor;
      acceleration.y += deltaY * factor;
    });

    return acceleration;
  });
}

function recordHistory(history, positions, maxLength) {
  history.forEach((trail, index) => {
    trail.push(copyVector(positions[index]));

    if (trail.length > maxLength) {
      trail.shift();
    }
  });
}

function drawTrails(trailNodes, history) {
  trailNodes.forEach((trailNode, index) => {
    const trail = history[index];

    if (!trail || trail.length < 2) {
      trailNode.setAttribute("d", "");
      return;
    }

    const commands = trail.map((point, pointIndex) =>
      `${pointIndex === 0 ? "M" : "L"} ${point.x.toFixed(3)} ${point.y.toFixed(3)}`
    );

    trailNode.setAttribute("d", commands.join(" "));
  });
}

function syncBodyNodes(bodyNodes, positions, radii) {
  bodyNodes.forEach((node, index) => {
    const position = positions[index];
    const radius = radii[index] || radii[0] || 0;
    node.setAttribute("cx", position.x.toFixed(3));
    node.setAttribute("cy", position.y.toFixed(3));
    node.setAttribute("r", radius.toFixed(3));
  });
}

function easeInOutCubic(value) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function copyVector(vector) {
  return { x: vector.x, y: vector.y };
}

function cloneSystemState(systemState) {
  return {
    positions: systemState.positions.map(copyVector),
    radii: systemState.radii.slice(),
  };
}

function createReferenceTransform(previousReferenceState, nextReferenceState) {
  const previousCenter = getCentroid(previousReferenceState.positions);
  const nextCenter = getCentroid(nextReferenceState.positions);
  const previousRadius = getReferenceRadius(previousReferenceState.positions, previousCenter);
  const nextRadius = getReferenceRadius(nextReferenceState.positions, nextCenter);
  const scale = previousRadius > 0 ? nextRadius / previousRadius : 1;

  return {
    fromCenter: previousCenter,
    toCenter: nextCenter,
    scale,
  };
}

function applyTransformToState(systemState, transform) {
  systemState.positions = systemState.positions.map((position) =>
    transformPoint(position, transform)
  );

  if (systemState.radii) {
    systemState.radii = systemState.radii.map((radius) => radius * transform.scale);
  }
}

function applyTransformToHistory(history, transform) {
  history.forEach((trail, index) => {
    history[index] = trail.map((point) => transformPoint(point, transform));
  });
}

function transformPoint(point, transform) {
  return {
    x:
      transform.toCenter.x +
      (point.x - transform.fromCenter.x) * transform.scale,
    y:
      transform.toCenter.y +
      (point.y - transform.fromCenter.y) * transform.scale,
  };
}

function getCentroid(points) {
  const totals = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: totals.x / points.length,
    y: totals.y / points.length,
  };
}

function getReferenceRadius(points, center) {
  const distances = points.map((point) =>
    Math.hypot(point.x - center.x, point.y - center.y)
  );

  return Math.max(...distances, 0);
}
