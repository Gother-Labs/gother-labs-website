const yearNode = document.querySelector("#year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear().toString();
}

const homePage = document.body.classList.contains("home-page");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

if (homePage && !reducedMotionQuery.matches) {
  initializeThreeBodySystem();
}

function initializeThreeBodySystem() {
  const canvas = document.querySelector(".three-body-canvas");
  const referenceMark = document.querySelector(".home-hero .animated-reference-mark");
  const bodyNodes = Array.from(document.querySelectorAll(".three-body-dot"));

  if (
    !(canvas instanceof HTMLCanvasElement) ||
    !(referenceMark instanceof HTMLElement) ||
    bodyNodes.length !== 3
  ) {
    return;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const wakeDelayMs = 3200;
  const settleDelayMs = 420;
  const activeDurationMs = 200000;
  const collapseDurationMs = 1200;
  const resetDelayMs = 220;
  const integratorStep = 1 / 240;
  const simulationSpeed = 1;
  const bodyColor = "#0a84ff";
  const trailColor = "rgba(10, 132, 255, 0.08)";
  const historyLength = 240;
  const gravityStrength = 2200;
  const softening = 12;
  const target = { width: 0, height: 0, radii: [] };
  let state = null;
  let history = [];
  let deviceScale = 1;
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

  resizeCanvas();
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
      target.radii = collapseSourceState.radii.map((radius) => radius * (1 - easedProgress));
    }

    render(isAwake ? 1 : 0);
    requestAnimationFrame(frame);
  }

  function resizeCanvas() {
    const viewport = getViewportMetrics();

    deviceScale = window.devicePixelRatio || 1;
    canvas.width = Math.round(viewport.width * deviceScale);
    canvas.height = Math.round(viewport.height * deviceScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    canvas.style.left = `${viewport.offsetLeft}px`;
    canvas.style.top = `${viewport.offsetTop}px`;
    context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

    target.width = viewport.width;
    target.height = viewport.height;
  }

  function render(progress) {
    context.clearRect(0, 0, target.width, target.height);

    if (progress <= 0 || !state) {
      return;
    }

    drawTrails(context, history, progress, trailColor);
    syncBodyNodes(bodyNodes, state.positions, target.radii);
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

    const previewState = createStateFromReferenceGlyph(referenceMark);
    referenceState = cloneSystemState(previewState);
    target.radii = previewState.radii.slice();
    syncBodyNodes(bodyNodes, previewState.positions, target.radii);
    render(0);
  }

  function scheduleWakeSequence() {
    wakeTimeoutId = window.setTimeout(() => {
      state = createStateFromReferenceGlyph(referenceMark);
      referenceState = cloneSystemState(state);
      history = state.positions.map((position) => [copyVector(position)]);
      target.radii = state.radii.slice();
      phase = "settling";
      phaseStartTime = performance.now();
      syncBodyNodes(bodyNodes, state.positions, target.radii);
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
    resizeCanvas();

    const nextReferenceState = createStateFromReferenceGlyph(referenceMark);

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

      target.radii = state.radii.slice();
      syncBodyNodes(bodyNodes, state.positions, target.radii);
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
      radii: target.radii.slice(),
    };
    collapseReferenceState = createStateFromReferenceGlyph(referenceMark);
    referenceState = cloneSystemState(collapseReferenceState);

    resetTimeoutId = window.setTimeout(() => {
      resetToReference();
      scheduleWakeSequence();
    }, collapseDurationMs + resetDelayMs);
  }
}

function createStateFromReferenceGlyph(referenceMark) {
  const glyphPoints = rasterizeThereforeGlyph(referenceMark);

  return {
    positions: glyphPoints.map((point) => ({ x: point.x, y: point.y })),
    velocities: glyphPoints.map(() => ({ x: 0, y: 0 })),
    masses: glyphPoints.map(() => 1),
    radii: glyphPoints.map((point) => point.radius),
  };
}

function rasterizeThereforeGlyph(referenceMark) {
  const rect = referenceMark.getBoundingClientRect();
  const viewport = getViewportMetrics();
  const computedStyle = window.getComputedStyle(referenceMark);
  const color = computedStyle.color;
  const fontSize = parseFloat(computedStyle.fontSize);
  const fontFamily = computedStyle.fontFamily;
  const fontWeight = computedStyle.fontWeight;
  const fontStyle = computedStyle.fontStyle;
  const letterSpacing = computedStyle.letterSpacing;
  const offscreen = document.createElement("canvas");
  const width = Math.max(64, Math.ceil(rect.width * 6));
  const height = Math.max(64, Math.ceil(rect.height * 6));
  const padding = Math.ceil(Math.max(width, height) * 0.18);
  const xOffset = rect.width * 0 + 0.27;
  const yOffset = rect.height * -0.107;
  const context = offscreen.getContext("2d");

  if (!context) {
    return fallbackGlyphPoints(rect);
  }

  offscreen.width = width + padding * 2;
  offscreen.height = height + padding * 2;
  context.clearRect(0, 0, offscreen.width, offscreen.height);
  context.fillStyle = color;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = `${fontStyle} ${fontWeight} ${fontSize * 6}px ${fontFamily}`;

  if (context.letterSpacing !== undefined) {
    context.letterSpacing = letterSpacing;
  }

  context.fillText("∴", padding, padding);

  const imageData = context.getImageData(0, 0, offscreen.width, offscreen.height);
  const components = findOpaqueComponents(imageData, offscreen.width, offscreen.height, 12);

  if (components.length !== 3) {
    return fallbackGlyphPoints(rect, color);
  }

  const scaleX = rect.width / width;
  const scaleY = rect.height / height;

  return components
    .sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX)
    .map((component) => ({
      x: viewport.offsetLeft + rect.left + (component.centerX - padding) * scaleX + xOffset,
      y: viewport.offsetTop + rect.top + (component.centerY - padding) * scaleY + yOffset,
      radius: (((component.maxX - component.minX + 1) * scaleX) + ((component.maxY - component.minY + 1) * scaleY)) / 4,
    }));
}

function findOpaqueComponents(imageData, width, height, alphaThreshold) {
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const alpha = imageData.data[index * 4 + 3];

      if (visited[index] || alpha < alphaThreshold) {
        continue;
      }

      const queue = [index];
      visited[index] = 1;
      let count = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (queue.length > 0) {
        const current = queue.pop();
        const currentX = current % width;
        const currentY = Math.floor(current / width);

        count += 1;
        sumX += currentX;
        sumY += currentY;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);

        const neighbors = [
          current - 1,
          current + 1,
          current - width,
          current + width,
        ];

        neighbors.forEach((neighbor) => {
          if (neighbor < 0 || neighbor >= width * height || visited[neighbor]) {
            return;
          }

          const neighborX = neighbor % width;
          const neighborY = Math.floor(neighbor / width);

          if (Math.abs(neighborX - currentX) + Math.abs(neighborY - currentY) !== 1) {
            return;
          }

          const neighborAlpha = imageData.data[neighbor * 4 + 3];

          if (neighborAlpha < alphaThreshold) {
            return;
          }

          visited[neighbor] = 1;
          queue.push(neighbor);
        });
      }

      components.push({
        centerX: sumX / count,
        centerY: sumY / count,
        minX,
        maxX,
        minY,
        maxY,
      });
    }
  }

  return components;
}

function fallbackGlyphPoints(rect) {
  const width = rect.width;
  const height = rect.height;
  const radius = Math.min(width, height) * 0.11;

  return [
    {
      x: rect.left + width * 0.50,
      y: rect.top + height * 0.16,
      radius,
    },
    {
      x: rect.left + width * 0.18,
      y: rect.top + height * 0.72,
      radius,
    },
    {
      x: rect.left + width * 0.82,
      y: rect.top + height * 0.72,
      radius,
    },
  ];
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

function drawTrails(context, history, progress, color) {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.lineWidth = 1.2;
  context.globalAlpha = 0.32 * progress;

  history.forEach((trail) => {
    if (trail.length < 2) {
      return;
    }

    context.beginPath();

    trail.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });

    context.stroke();
  });

  context.restore();
}

function syncBodyNodes(bodyNodes, positions, radii) {
  bodyNodes.forEach((node, index) => {
    const position = positions[index];
    const radius = radii[index] || radii[0] || 0;
    const diameter = radius * 2;

    node.style.width = `${diameter}px`;
    node.style.height = `${diameter}px`;
    node.style.transform = `translate3d(${position.x - radius}px, ${position.y - radius}px, 0)`;
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

function getViewportMetrics() {
  if (window.visualViewport) {
    return {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      offsetLeft: window.visualViewport.offsetLeft,
      offsetTop: window.visualViewport.offsetTop,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
  };
}
