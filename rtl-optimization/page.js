(() => {
  const stage = document.querySelector("[data-rtl-chip-evolution]");
  const canvas = stage?.querySelector("[data-rtl-chip-canvas]");
  const phaseLabel = stage?.querySelector("[data-rtl-chip-phase]");
  const context = canvas?.getContext("2d");

  if (!stage || !canvas || !phaseLabel || !context) {
    return;
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const removed = new Set([2, 5, 7, 10, 13, 16, 20]);
  const modules = Array.from({ length: 24 }, (_, index) => ({
    index,
    column: index % 6,
    row: Math.floor(index / 6),
    retainedIndex: -1,
  }));

  let retainedIndex = 0;
  for (const module of modules) {
    if (!removed.has(module.index)) {
      module.retainedIndex = retainedIndex;
      retainedIndex += 1;
    }
  }

  const state = {
    width: 0,
    height: 0,
    ratio: 1,
    visible: false,
    frameId: 0,
    startTime: 0,
    lastTime: 0,
    colors: {},
  };

  const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
  const smooth = (value) => {
    const bounded = clamp(value);
    return bounded * bounded * (3 - 2 * bounded);
  };
  const mix = (start, end, amount) => start + (end - start) * amount;

  function readColors() {
    const styles = getComputedStyle(stage);
    state.colors = {
      background: styles.getPropertyValue("--bg").trim(),
      text: styles.getPropertyValue("--text").trim(),
      muted: styles.getPropertyValue("--muted").trim(),
      accent: styles.getPropertyValue("--accent").trim(),
      line: styles.getPropertyValue("--line-strong").trim(),
    };
  }

  function resize() {
    const bounds = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    state.width = Math.max(1, bounds.width);
    state.height = Math.max(1, bounds.height);
    state.ratio = ratio;
    canvas.width = Math.round(state.width * ratio);
    canvas.height = Math.round(state.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    readColors();
    draw(reducedMotion.matches ? 7.4 : state.lastTime || 0);
  }

  function frameFor(progress) {
    const width = state.width;
    const height = state.height;
    const baseline = {
      x: width * 0.17,
      y: height * 0.21,
      width: width * 0.66,
      height: height * 0.58,
    };
    const candidate = {
      x: width * 0.235,
      y: height * 0.275,
      width: width * 0.53,
      height: height * 0.45,
    };

    return {
      x: mix(baseline.x, candidate.x, progress),
      y: mix(baseline.y, candidate.y, progress),
      width: mix(baseline.width, candidate.width, progress),
      height: mix(baseline.height, candidate.height, progress),
    };
  }

  function moduleGeometry(module, progress) {
    const baselineFrame = frameFor(0);
    const candidateFrame = frameFor(1);
    const baselineGap = Math.max(5, state.width * 0.006);
    const baselineWidth = (baselineFrame.width - baselineGap * 7) / 6;
    const baselineHeight = (baselineFrame.height - baselineGap * 5) / 4;
    const baselineX = baselineFrame.x + baselineGap + module.column * (baselineWidth + baselineGap);
    const baselineY = baselineFrame.y + baselineGap + module.row * (baselineHeight + baselineGap);

    if (module.retainedIndex < 0) {
      const centerX = baselineX + baselineWidth / 2;
      const centerY = baselineY + baselineHeight / 2;
      const directionX = centerX < state.width / 2 ? -1 : 1;
      const directionY = centerY < state.height / 2 ? -1 : 1;
      return {
        x: baselineX + directionX * progress * state.width * 0.035,
        y: baselineY + directionY * progress * state.height * 0.035,
        width: baselineWidth * mix(1, 0.62, progress),
        height: baselineHeight * mix(1, 0.62, progress),
        opacity: 1 - smooth(progress),
        removed: true,
      };
    }

    const candidateGap = Math.max(6, state.width * 0.007);
    const candidateWidth = (candidateFrame.width - candidateGap * 6) / 5;
    const candidateHeight = (candidateFrame.height - candidateGap * 5) / 4;
    const candidateColumn = module.retainedIndex % 5;
    const candidateRow = Math.floor(module.retainedIndex / 5);
    const candidateX = candidateFrame.x + candidateGap + candidateColumn * (candidateWidth + candidateGap);
    const candidateY = candidateFrame.y + candidateGap + candidateRow * (candidateHeight + candidateGap);

    return {
      x: mix(baselineX, candidateX, progress),
      y: mix(baselineY, candidateY, progress),
      width: mix(baselineWidth, candidateWidth, progress),
      height: mix(baselineHeight, candidateHeight, progress),
      opacity: 1,
      removed: false,
    };
  }

  function drawBoundary(globalOpacity) {
    const width = state.width;
    const height = state.height;
    const insetX = width * 0.055;
    const insetY = height * 0.135;

    context.save();
    context.globalAlpha = 0.5 * globalOpacity;
    context.strokeStyle = state.colors.line;
    context.lineWidth = 1;
    context.setLineDash([2, 8]);
    context.strokeRect(insetX, insetY, width - insetX * 2, height - insetY * 2);
    context.setLineDash([]);

    const ports = 6;
    for (let index = 0; index < ports; index += 1) {
      const y = insetY + ((index + 1) / (ports + 1)) * (height - insetY * 2);
      context.fillStyle = index === 2 || index === 3 ? state.colors.accent : state.colors.muted;
      context.fillRect(insetX - 3, y - 2, 6, 4);
      context.fillRect(width - insetX - 3, y - 2, 6, 4);
    }
    context.restore();
  }

  function drawFrame(frame, progress, globalOpacity) {
    context.save();
    context.globalAlpha = globalOpacity;
    context.strokeStyle = state.colors.text;
    context.lineWidth = 1;
    context.strokeRect(frame.x, frame.y, frame.width, frame.height);

    const pinCount = 18;
    const pinSize = Math.max(3, state.width * 0.0025);
    for (let index = 0; index < pinCount; index += 1) {
      const x = frame.x + ((index + 0.5) / pinCount) * frame.width;
      context.globalAlpha = (0.3 + progress * 0.35) * globalOpacity;
      context.fillStyle = state.colors.muted;
      context.fillRect(x - pinSize / 2, frame.y - pinSize * 1.5, pinSize, pinSize);
      context.fillRect(x - pinSize / 2, frame.y + frame.height + pinSize * 0.5, pinSize, pinSize);
    }
    context.restore();
  }

  function drawTrace(fromX, fromY, toX, toY, opacity, accent = false) {
    const bendX = mix(fromX, toX, 0.5);
    context.save();
    context.globalAlpha = opacity;
    context.strokeStyle = accent ? state.colors.accent : state.colors.muted;
    context.lineWidth = accent ? 1.25 : 0.75;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(bendX, fromY);
    context.lineTo(bendX, toY);
    context.lineTo(toX, toY);
    context.stroke();
    context.restore();
  }

  function drawTraces(geometry, progress, verify, globalOpacity) {
    const retained = modules.filter((module) => module.retainedIndex >= 0);
    const anchors = [0, 3, 6, 10, 13, 16];
    const boundaryX = state.width * 0.055;
    const boundaryRight = state.width - boundaryX;
    const boundaryY = state.height * 0.135;
    const boundaryHeight = state.height - boundaryY * 2;

    anchors.forEach((retainedPosition, index) => {
      const module = retained[retainedPosition];
      const item = geometry[module.index];
      const portY = boundaryY + ((index + 1) / (anchors.length + 1)) * boundaryHeight;
      const moduleY = item.y + item.height / 2;
      drawTrace(boundaryX, portY, item.x, moduleY, (0.28 + verify * 0.35) * globalOpacity, index === 2);
      drawTrace(item.x + item.width, moduleY, boundaryRight, portY, (0.28 + verify * 0.35) * globalOpacity, index === 3);
    });

    for (let index = 0; index < retained.length - 1; index += 1) {
      const current = geometry[retained[index].index];
      const next = geometry[retained[index + 1].index];
      drawTrace(
        current.x + current.width,
        current.y + current.height / 2,
        next.x,
        next.y + next.height / 2,
        (0.14 + progress * 0.18) * globalOpacity,
        progress > 0.75 && index % 5 === 2,
      );
    }
  }

  function drawModules(geometry, progress, globalOpacity) {
    for (const module of modules) {
      const item = geometry[module.index];
      if (item.opacity <= 0.01) {
        continue;
      }

      context.save();
      context.globalAlpha = item.opacity * globalOpacity;
      context.strokeStyle = item.removed ? state.colors.muted : state.colors.text;
      context.fillStyle = state.colors.background;
      context.lineWidth = item.removed ? 0.75 : 1;
      context.fillRect(item.x, item.y, item.width, item.height);
      context.strokeRect(item.x, item.y, item.width, item.height);

      const innerLines = module.index % 3 === 0 ? 3 : 2;
      context.globalAlpha = item.opacity * (0.22 + progress * 0.2) * globalOpacity;
      context.strokeStyle = item.removed ? state.colors.muted : state.colors.accent;
      for (let line = 1; line <= innerLines; line += 1) {
        const y = item.y + (line / (innerLines + 1)) * item.height;
        context.beginPath();
        context.moveTo(item.x + item.width * 0.18, y);
        context.lineTo(item.x + item.width * (0.55 + ((module.index + line) % 3) * 0.1), y);
        context.stroke();
      }
      context.restore();

      if (item.removed && progress > 0.08 && progress < 0.92) {
        const particleProgress = smooth(progress);
        context.save();
        context.globalAlpha = (1 - particleProgress) * 0.65 * globalOpacity;
        context.fillStyle = state.colors.accent;
        for (let particle = 0; particle < 5; particle += 1) {
          const direction = particle % 2 === 0 ? -1 : 1;
          const offsetX = direction * particleProgress * (12 + particle * 5);
          const offsetY = (particle - 2) * 5 * particleProgress;
          context.fillRect(
            item.x + item.width / 2 + offsetX,
            item.y + item.height / 2 + offsetY,
            2,
            2,
          );
        }
        context.restore();
      }
    }
  }

  function drawScan(scan, globalOpacity) {
    if (scan <= 0 || scan >= 1) {
      return;
    }

    const x = mix(state.width * 0.08, state.width * 0.92, scan);
    context.save();
    context.globalAlpha = Math.sin(scan * Math.PI) * 0.8 * globalOpacity;
    context.strokeStyle = state.colors.accent;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, state.height * 0.13);
    context.lineTo(x, state.height * 0.87);
    context.stroke();
    context.shadowColor = state.colors.accent;
    context.shadowBlur = 12;
    context.fillStyle = state.colors.accent;
    context.fillRect(x - 1.5, state.height * 0.49, 3, 3);
    context.restore();
  }

  function drawSignals(geometry, verify, elapsed, globalOpacity) {
    if (verify <= 0) {
      return;
    }

    const retained = modules.filter((module) => module.retainedIndex >= 0);
    context.save();
    context.fillStyle = state.colors.accent;
    context.shadowColor = state.colors.accent;
    context.shadowBlur = 10;
    context.globalAlpha = verify * globalOpacity;
    for (let index = 0; index < 5; index += 1) {
      const module = geometry[retained[(index * 3 + 2) % retained.length].index];
      const angle = elapsed * 1.8 + index * 1.4;
      const x = module.x + module.width * (0.5 + Math.cos(angle) * 0.28);
      const y = module.y + module.height * (0.5 + Math.sin(angle) * 0.28);
      context.beginPath();
      context.arc(x, y, 2.2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function draw(elapsed) {
    state.lastTime = elapsed;
    const cycle = 10.5;
    const time = ((elapsed % cycle) + cycle) % cycle;
    let progress = 0;
    let scan = 0;
    let verify = 0;
    let globalOpacity = 1;
    let phase = "Map structure";

    if (time < 1.6) {
      phase = "Map structure";
    } else if (time < 3.2) {
      phase = "Trace dependencies";
      scan = smooth((time - 1.6) / 1.6);
    } else if (time < 6.4) {
      phase = "Reshape implementation";
      progress = smooth((time - 3.2) / 3.2);
      scan = smooth((time - 3.2) / 3.2);
    } else if (time < 9.3) {
      phase = "Contract verified";
      progress = 1;
      verify = smooth((time - 6.4) / 0.8);
    } else if (time < 9.9) {
      phase = "Contract verified";
      progress = 1;
      verify = 1;
      globalOpacity = 1 - smooth((time - 9.3) / 0.6);
    } else {
      phase = "Map structure";
      globalOpacity = smooth((time - 9.9) / 0.6);
    }

    phaseLabel.textContent = phase;
    context.clearRect(0, 0, state.width, state.height);

    const frame = frameFor(progress);
    const geometry = modules.map((module) => moduleGeometry(module, progress));
    drawBoundary(globalOpacity);
    drawTraces(geometry, progress, verify, globalOpacity);
    drawFrame(frame, progress, globalOpacity);
    drawModules(geometry, progress, globalOpacity);
    drawScan(scan, globalOpacity);
    drawSignals(geometry, verify, elapsed, globalOpacity);
  }

  function animate(timestamp) {
    if (!state.visible || reducedMotion.matches || document.hidden) {
      state.frameId = 0;
      return;
    }

    if (!state.startTime) {
      state.startTime = timestamp;
    }
    draw((timestamp - state.startTime) / 1000);
    state.frameId = requestAnimationFrame(animate);
  }

  function start() {
    if (state.frameId || reducedMotion.matches || !state.visible || document.hidden) {
      return;
    }
    state.frameId = requestAnimationFrame(animate);
  }

  function stop() {
    if (state.frameId) {
      cancelAnimationFrame(state.frameId);
      state.frameId = 0;
    }
  }

  function drawReducedMotion() {
    phaseLabel.textContent = "Contract verified";
    draw(7.4);
  }

  const visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      state.visible = entry.isIntersecting;
      if (state.visible) {
        start();
      } else {
        stop();
      }
    },
    { rootMargin: "15% 0px", threshold: 0.05 },
  );

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  visibilityObserver.observe(stage);

  reducedMotion.addEventListener("change", () => {
    state.startTime = 0;
    if (reducedMotion.matches) {
      stop();
      drawReducedMotion();
    } else {
      start();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  resize();
  if (reducedMotion.matches) {
    drawReducedMotion();
  }
})();
