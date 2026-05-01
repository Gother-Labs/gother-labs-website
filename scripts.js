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
