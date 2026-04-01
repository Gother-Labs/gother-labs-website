(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const VIEWBOX = { width: 920, height: 760 };
  const CELL_U = { x: 34, y: 19 };
  const CELL_V = { x: -34, y: 19 };
  const DEPTH = 22;

  const islands = [
    { id: "01", origin: { x: 166, y: 510 }, cols: 6, rows: 4 },
    { id: "02", origin: { x: 446, y: 214 }, cols: 6, rows: 4 },
    { id: "03", origin: { x: 732, y: 520 }, cols: 6, rows: 4 },
  ];

  const occupied = {
    "01": ["0-1", "1-0", "1-1", "2-1", "3-1", "4-2", "5-1", "2-3"],
    "02": ["0-1", "1-1", "2-0", "2-1", "2-2", "3-1", "4-1", "4-2", "5-1", "1-3"],
    "03": ["0-0", "1-1", "2-0", "2-1", "3-1", "3-2", "4-1", "5-2", "1-3"],
  };

  const WORKER_NODE_SETS = {
    single: ["worker02"],
    trio: ["worker01", "worker02", "worker03"],
  };

  const WORKER_LINE_SETS = {
    single: ["w02"],
    proposal: ["w01proposal", "w02proposal", "w03proposal"],
  };

  const PROPOSAL_NODE_SETS = {
    trio: ["proposal01", "proposal02", "proposal03"],
  };

  const WORKSPACE_NODE_SETS = {
    pair: ["workspace01", "workspace02"],
    single: ["workspace02"],
  };

  const PROCESS_TRACK_SETS = {
    proposalFilter: ["proposalGate01", "proposalGate02", "proposalGate03"],
    materialize: ["materializeGhost", "materialize"],
    judge: ["judgeGhost", "judge"],
  };

  const storyRoot = document.querySelector(".story-shell");
  const svg = document.getElementById("evolther-story-svg");

  if (!storyRoot || !svg) {
    return;
  }

  const state = {
    cellMap: new Map(),
    islandMap: new Map(),
    islandLabelMap: new Map(),
    nodeMap: new Map(),
    trackMap: new Map(),
    ringMap: new Map(),
    sampleLinkMap: new Map(),
    workerLineMap: new Map(),
    seedRayMap: new Map(),
    thresholdMap: new Map(),
    ledgerEntryMap: new Map(),
    points: {},
  };

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function scale(vector, factor) {
    return { x: vector.x * factor, y: vector.y * factor };
  }

  function pointToPercent(point) {
    return {
      left: (point.x / VIEWBOX.width) * 100,
      top: (point.y / VIEWBOX.height) * 100,
    };
  }

  function cellBase(island, col, row) {
    return add(island.origin, add(scale(CELL_U, col), scale(CELL_V, row)));
  }

  function cellPoints(island, col, row) {
    const base = cellBase(island, col, row);
    return [
      base,
      add(base, CELL_U),
      add(add(base, CELL_U), CELL_V),
      add(base, CELL_V),
    ];
  }

  function cellCenter(island, col, row) {
    const base = cellBase(island, col, row);
    return {
      x: base.x,
      y: base.y + (CELL_U.y + CELL_V.y) / 2,
    };
  }

  function planeCorners(island) {
    const topLeft = island.origin;
    const topRight = add(topLeft, scale(CELL_U, island.cols));
    const bottomRight = add(topRight, scale(CELL_V, island.rows));
    const bottomLeft = add(topLeft, scale(CELL_V, island.rows));
    return { topLeft, topRight, bottomRight, bottomLeft };
  }

  function islandBaseAnchor(island) {
    const { bottomLeft, bottomRight } = planeCorners(island);
    return {
      x: (bottomLeft.x + bottomRight.x) / 2,
      y: (bottomLeft.y + bottomRight.y) / 2 + DEPTH,
    };
  }

  function createSvg(tag, attrs = {}, text = "") {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      node.setAttribute(key, String(value));
    });
    if (text) {
      node.textContent = text;
    }
    return node;
  }

  function pointsAttr(points) {
    return points.map((point) => `${point.x},${point.y}`).join(" ");
  }

  function renderIsland(island, layer) {
    const group = createSvg("g", {
      class: "story-island",
      "data-island": island.id,
    });
    const drop = { x: 0, y: DEPTH };
    const { topLeft, topRight, bottomRight, bottomLeft } = planeCorners(island);

    group.append(
      createSvg("polygon", {
        class: "story-island-side",
        points: pointsAttr([topRight, bottomRight, add(bottomRight, drop), add(topRight, drop)]),
      }),
      createSvg("polygon", {
        class: "story-island-side",
        points: pointsAttr([bottomLeft, bottomRight, add(bottomRight, drop), add(bottomLeft, drop)]),
      }),
      createSvg("polygon", {
        class: "story-island-top",
        points: pointsAttr([topLeft, topRight, bottomRight, bottomLeft]),
      })
    );

    for (let row = 0; row < island.rows; row += 1) {
      for (let col = 0; col < island.cols; col += 1) {
        const cellId = `${col}-${row}`;
        const polygon = createSvg("polygon", {
          class: "story-cell",
          points: pointsAttr(cellPoints(island, col, row)),
          "data-cell": cellId,
        });
        if ((occupied[island.id] || []).includes(cellId)) {
          polygon.classList.add("is-occupied");
        }
        state.cellMap.set(`${island.id}|${cellId}`, polygon);
        group.appendChild(polygon);
      }
    }

    const labelCenter = cellCenter(island, 2.5, 1.35);
    const labelGroup = createSvg("g", {
      class: "story-island-label",
      "data-island-label": island.id,
    });
    labelGroup.append(
      createSvg(
        "text",
        {
          x: labelCenter.x,
          y: island.origin.y - 54,
          class: "svg-label",
          "text-anchor": "middle",
        },
        "Island"
      ),
      createSvg(
        "text",
        {
          x: labelCenter.x,
          y: island.origin.y - 32,
          class: "svg-section-label",
          "text-anchor": "middle",
        },
        "LIVE MAP ARCHIVE"
      )
    );
    group.append(labelGroup);
    state.islandLabelMap.set(island.id, labelGroup);

    state.islandMap.set(island.id, group);
    layer.appendChild(group);
  }

  function renderNode(layer, key, x, y, label, sublabel, width, variant = "") {
    const className = ["story-node", `story-node--${key}`, variant].filter(Boolean).join(" ");
    const group = createSvg("g", {
      class: className,
      "data-node": key,
    });

    const glyph = createSvg("g", { class: "story-node-glyph" });

    glyph.appendChild(
      createSvg("circle", {
        cx: x,
        cy: y,
        r: key === "runner" ? 48 : 42,
        class: "story-glyph-halo",
      })
    );

    if (key === "entry") {
      glyph.append(
        createSvg("circle", { cx: x, cy: y, r: 4, class: "story-glyph-dot" })
      );
    } else if (key === "telemetry") {
      glyph.append(
        createSvg("circle", { cx: x, cy: y, r: 18, class: "story-glyph-stroke" }),
        createSvg("circle", { cx: x, cy: y, r: 5, class: "story-glyph-dot" }),
        createSvg("line", { x1: x, y1: y - 30, x2: x, y2: y - 20, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x + 21, y1: y - 21, x2: x + 14, y2: y - 14, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x + 30, y1: y, x2: x + 20, y2: y, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x + 21, y1: y + 21, x2: x + 14, y2: y + 14, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x, y1: y + 30, x2: x, y2: y + 20, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x - 21, y1: y + 21, x2: x - 14, y2: y + 14, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x - 30, y1: y, x2: x - 20, y2: y, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x - 21, y1: y - 21, x2: x - 14, y2: y - 14, class: "story-glyph-stroke" })
      );
    } else if (key === "seed") {
      glyph.append(
        createSvg("path", {
          d: `M ${x} ${y - 18} C ${x + 12} ${y - 16}, ${x + 18} ${y - 2}, ${x + 10} ${y + 12} C ${x + 4} ${y + 22}, ${x - 8} ${y + 24}, ${x - 16} ${y + 12} C ${x - 24} ${y - 2}, ${x - 14} ${y - 16}, ${x} ${y - 18} Z`,
          class: "story-glyph-stroke",
        }),
        createSvg("path", {
          d: `M ${x + 2} ${y - 20} C ${x + 10} ${y - 30}, ${x + 20} ${y - 30}, ${x + 22} ${y - 18}`,
          class: "story-glyph-stroke",
        }),
        createSvg("line", {
          x1: x - 2,
          y1: y - 8,
          x2: x + 2,
          y2: y + 12,
          class: "story-glyph-stroke",
        }),
        createSvg("circle", { cx: x, cy: y - 1, r: 3.5, class: "story-glyph-dot" })
      );
    } else if (key === "loop") {
      glyph.append(
        createSvg("path", {
          d: `M ${x - 18} ${y + 22} A 36 36 0 1 1 ${x + 21} ${y - 20}`,
          class: "story-glyph-stroke story-loop-curve",
        })
      );
    } else if (key === "scheduler") {
      glyph.append(
        createSvg("circle", { cx: x, cy: y, r: 28, class: "story-glyph-stroke story-glyph-soft" }),
        createSvg("circle", { cx: x, cy: y, r: 7, class: "story-glyph-dot" }),
        createSvg("line", { x1: x, y1: y, x2: x - 26, y2: y + 18, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x, y1: y, x2: x + 30, y2: y + 8, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x, y1: y, x2: x + 6, y2: y - 28, class: "story-glyph-stroke" }),
        createSvg("circle", { cx: x - 26, cy: y + 18, r: 3, class: "story-glyph-dot" }),
        createSvg("circle", { cx: x + 30, cy: y + 8, r: 3, class: "story-glyph-dot" }),
        createSvg("circle", { cx: x + 6, cy: y - 28, r: 3, class: "story-glyph-dot" })
      );
    } else if (key.startsWith("worker")) {
      glyph.append(
        createSvg("circle", { cx: x, cy: y, r: 16, class: "story-glyph-stroke" }),
        createSvg("circle", { cx: x, cy: y, r: 3.5, class: "story-glyph-dot" }),
        createSvg("line", { x1: x, y1: y - 22, x2: x, y2: y - 14, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x - 16, y1: y + 12, x2: x - 24, y2: y + 18, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x + 16, y1: y + 12, x2: x + 24, y2: y + 18, class: "story-glyph-stroke" })
      );
    } else if (key.startsWith("proposal")) {
      const isSingleProposalCard = key !== "proposal";
      if (isSingleProposalCard) {
        glyph.append(
          createSvg("rect", {
            x: x - 14,
            y: y - 11,
            width: 40,
            height: 24,
            rx: 4,
            class: "story-glyph-fill",
          }),
          createSvg("rect", {
            x: x - 14,
            y: y - 11,
            width: 40,
            height: 24,
            rx: 4,
            class: "story-glyph-stroke",
          }),
          createSvg("line", {
            x1: x - 2,
            y1: y + 1,
            x2: x + 18,
            y2: y + 1,
            class: "story-glyph-stroke story-glyph-soft",
          }),
          createSvg("line", {
            x1: x - 8,
            y1: y - 5,
            x2: x - 2,
            y2: y - 5,
            class: "story-glyph-stroke",
          }),
          createSvg("line", {
            x1: x - 5,
            y1: y - 8,
            x2: x - 5,
            y2: y - 2,
            class: "story-glyph-stroke",
          }),
          createSvg("line", {
            x1: x + 2,
            y1: y - 5,
            x2: x + 14,
            y2: y - 5,
            class: "story-glyph-stroke",
          }),
          createSvg("line", {
            x1: x - 8,
            y1: y + 7,
            x2: x - 2,
            y2: y + 7,
            class: "story-glyph-stroke story-glyph-soft",
          }),
          createSvg("line", {
            x1: x + 2,
            y1: y + 7,
            x2: x + 18,
            y2: y + 7,
            class: "story-glyph-stroke story-glyph-soft",
          }),
          createSvg("line", {
            x1: x - 11,
            y1: y - 7,
            x2: x - 11,
            y2: y + 9,
            class: "story-glyph-stroke story-glyph-soft",
          })
        );
      } else {
      glyph.append(
        createSvg("rect", {
          x: x + 8,
          y: y - 28,
          width: 42,
          height: 26,
          rx: 3,
          class: "story-glyph-fill",
        }),
        createSvg("rect", {
          x: x + 8,
          y: y - 28,
          width: 42,
          height: 26,
          rx: 3,
          class: "story-glyph-stroke story-glyph-soft",
        }),
        createSvg("rect", {
          x: x - 4,
          y: y - 18,
          width: 42,
          height: 26,
          rx: 3,
          class: "story-glyph-fill",
        }),
        createSvg("rect", {
          x: x - 4,
          y: y - 18,
          width: 42,
          height: 26,
          rx: 3,
          class: "story-glyph-stroke story-glyph-soft",
        }),
        createSvg("rect", {
          x: x - 16,
          y: y - 8,
          width: 42,
          height: 26,
          rx: 3,
          class: "story-glyph-fill",
        }),
        createSvg("rect", {
          x: x - 16,
          y: y - 8,
          width: 42,
          height: 26,
          rx: 3,
          class: "story-glyph-stroke",
        }),
        createSvg("line", {
          x1: x - 10,
          y1: y + 4,
          x2: x - 2,
          y2: y + 4,
          class: "story-glyph-stroke",
        }),
        createSvg("line", {
          x1: x - 6,
          y1: y,
          x2: x - 6,
          y2: y + 8,
          class: "story-glyph-stroke",
        }),
        createSvg("line", {
          x1: x + 6,
          y1: y + 4,
          x2: x + 20,
          y2: y + 4,
          class: "story-glyph-stroke",
        }),
        createSvg("line", {
          x1: x - 10,
          y1: y + 12,
          x2: x - 2,
          y2: y + 12,
          class: "story-glyph-stroke",
        }),
        createSvg("line", {
          x1: x + 6,
          y1: y + 12,
          x2: x + 22,
          y2: y + 12,
          class: "story-glyph-stroke story-glyph-soft",
        })
      );
      }
    } else if (key === "gate" || key.startsWith("gate")) {
      glyph.append(
        createSvg("path", {
          d: `M ${x - 30} ${y - 18} L ${x - 8} ${y} L ${x - 30} ${y + 18} L ${x - 18} ${y} Z`,
          class: "story-glyph-fill",
        }),
        createSvg("path", {
          d: `M ${x + 30} ${y - 18} L ${x + 8} ${y} L ${x + 30} ${y + 18} L ${x + 18} ${y} Z`,
          class: "story-glyph-fill",
        }),
        createSvg("line", { x1: x - 4, y1: y - 22, x2: x - 4, y2: y + 22, class: "story-glyph-stroke story-glyph-soft" }),
        createSvg("line", { x1: x + 4, y1: y - 22, x2: x + 4, y2: y + 22, class: "story-glyph-stroke story-glyph-soft" }),
        createSvg("circle", { cx: x, cy: y, r: 4, class: "story-glyph-dot" })
      );
    } else if (key === "workspace" || key.startsWith("workspace")) {
      glyph.append(
        createSvg("polygon", {
          points: `${x - 28},${y + 6} ${x},${y - 12} ${x + 28},${y + 6} ${x},${y + 24}`,
          class: "story-glyph-fill",
        }),
        createSvg("polygon", {
          points: `${x - 28},${y + 4} ${x},${y - 14} ${x + 28},${y + 4} ${x},${y + 22}`,
          class: "story-glyph-stroke",
        }),
        createSvg("line", { x1: x - 28, y1: y + 4, x2: x - 14, y2: y - 10, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x + 28, y1: y + 4, x2: x + 14, y2: y - 10, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x - 14, y1: y - 10, x2: x + 14, y2: y - 10, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x, y1: y - 14, x2: x, y2: y + 22, class: "story-glyph-stroke story-glyph-soft" })
      );
    } else if (key === "runner") {
      glyph.append(
        createSvg("path", {
          d: `M ${x - 32} ${y + 22} Q ${x} ${y + 34} ${x + 32} ${y + 22}`,
          class: "story-glyph-stroke story-glyph-soft",
        }),
        createSvg("line", { x1: x - 24, y1: y + 18, x2: x - 24, y2: y - 8, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x - 8, y1: y + 18, x2: x - 8, y2: y - 18, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x + 8, y1: y + 18, x2: x + 8, y2: y - 2, class: "story-glyph-stroke" }),
        createSvg("line", { x1: x + 24, y1: y + 18, x2: x + 24, y2: y - 24, class: "story-glyph-stroke" }),
        createSvg("path", {
          d: `M ${x - 30} ${y + 2} Q ${x - 8} ${y - 18} ${x + 4} ${y - 2} T ${x + 30} ${y - 12}`,
          class: "story-glyph-stroke story-glyph-soft",
        })
      );
    }

    group.append(glyph);

    const labelLayout = {
      anchor: "middle",
      labelX: x,
      labelY: y + 52,
      sublabelX: x,
      sublabelY: y + 71,
    };

    if (key.startsWith("proposal")) {
      labelLayout.anchor = "middle";
      labelLayout.labelX = x + 12;
      labelLayout.labelY = y + 42;
      labelLayout.sublabelX = x + 12;
      labelLayout.sublabelY = y + 61;
    }

    if (label) {
      group.appendChild(
        createSvg(
          "text",
          {
            x: labelLayout.labelX,
            y: labelLayout.labelY,
            class: "story-node-label svg-section-label",
            "text-anchor": labelLayout.anchor,
          },
          label.toUpperCase()
        )
      );
    }

    if (sublabel) {
      group.appendChild(
        createSvg(
          "text",
          {
            x: labelLayout.sublabelX,
            y: labelLayout.sublabelY,
            class: "story-node-sublabel",
            "text-anchor": labelLayout.anchor,
          },
          sublabel
        )
      );
    }

    state.nodeMap.set(key, group);
    layer.appendChild(group);
  }

  function renderLedger(layer) {
    const group = createSvg("g", {
      class: "story-ledger",
      "data-node": "ledger",
    });

    group.append(
      createSvg("ellipse", {
        cx: 102,
        cy: 340,
        rx: 86,
        ry: 120,
        class: "story-glyph-halo",
      }),
      createSvg(
        "text",
        {
          x: 42,
          y: 248,
          class: "svg-section-label",
        },
        "HISTORY"
      ),
      createSvg(
        "text",
        {
          x: 42,
          y: 268,
          class: "story-ledger-label",
        },
        "attempt ledger"
      ),
      createSvg("line", {
        x1: 42,
        y1: 282,
        x2: 164,
        y2: 282,
        class: "story-glyph-stroke story-glyph-soft",
      })
    );

    [
      { id: "seed", x: 42, y: 304, width: 116 },
      { id: "attemptA", x: 42, y: 328, width: 108 },
      { id: "attemptB", x: 42, y: 352, width: 94 },
      { id: "attemptC", x: 42, y: 376, width: 82 },
      { id: "attemptD", x: 42, y: 400, width: 118 },
    ].forEach((entry) => {
      const bar = createSvg("path", {
        d: `M ${entry.x} ${entry.y} L ${entry.x + entry.width} ${entry.y} L ${entry.x + entry.width - 10} ${entry.y + 10} L ${entry.x - 10} ${entry.y + 10} Z`,
        class: "story-ledger-entry",
      });
      state.ledgerEntryMap.set(entry.id, bar);
      group.appendChild(bar);
    });

    state.nodeMap.set("ledger", group);
    layer.appendChild(group);
  }

  function thresholdLine(island, type, value) {
    if (type === "col") {
      const start = add(island.origin, scale(CELL_U, value));
      const end = add(start, scale(CELL_V, island.rows));
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }
    const start = add(island.origin, scale(CELL_V, value));
    const end = add(start, scale(CELL_U, island.cols));
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  function renderAtlas() {
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`);

    const defs = createSvg("defs");
    const flowGradient = createSvg("linearGradient", {
      id: "story-flow-gradient",
      x1: "0%",
      y1: "0%",
      x2: "100%",
      y2: "0%",
    });
    flowGradient.append(
      createSvg("stop", { offset: "0%", "stop-color": "#357eff", "stop-opacity": "0" }),
      createSvg("stop", { offset: "18%", "stop-color": "#357eff", "stop-opacity": "0.34" }),
      createSvg("stop", { offset: "50%", "stop-color": "#357eff", "stop-opacity": "0.95" }),
      createSvg("stop", { offset: "82%", "stop-color": "#357eff", "stop-opacity": "0.34" }),
      createSvg("stop", { offset: "100%", "stop-color": "#357eff", "stop-opacity": "0" })
    );
    defs.appendChild(flowGradient);
    const softArrow = createSvg("marker", {
      id: "story-arrow-soft",
      markerWidth: 11,
      markerHeight: 11,
      refX: 9.2,
      refY: 5.5,
      orient: "auto",
      markerUnits: "strokeWidth",
    });
    softArrow.appendChild(
      createSvg("path", {
        d: "M0,0 L11,5.5 L0,11 z",
        fill: "currentColor",
      })
    );
    defs.appendChild(softArrow);
    const loopArrow = createSvg("marker", {
      id: "story-arrow-loop",
      markerWidth: 9,
      markerHeight: 9,
      refX: 7.4,
      refY: 4.5,
      orient: "auto",
      markerUnits: "strokeWidth",
    });
    loopArrow.appendChild(
      createSvg("path", {
        d: "M0,0 L9,4.5 L0,9 z",
        fill: "currentColor",
      })
    );
    defs.appendChild(loopArrow);
    const marker = createSvg("marker", {
      id: "story-arrow",
      markerWidth: 8,
      markerHeight: 8,
      refX: 6.6,
      refY: 4,
      orient: "auto",
      markerUnits: "strokeWidth",
    });
    marker.appendChild(
      createSvg("path", {
        d: "M0,0 L8,4 L0,8 z",
        fill: "currentColor",
      })
    );
    defs.appendChild(marker);
    svg.appendChild(defs);

    const ringLayer = createSvg("g");
    const workerLayer = createSvg("g");
    const trackLayer = createSvg("g");
    const thresholdLayer = createSvg("g");
    const sampleLayer = createSvg("g");
    const islandLayer = createSvg("g");
    const seedLayer = createSvg("g");
    const nodeLayer = createSvg("g");

    islands.forEach((island) => renderIsland(island, islandLayer));

    const island01 = islands[0];
    const island02 = islands[1];
    const island03 = islands[2];

    state.points.entry = { x: 456, y: 186 };
    state.points.telemetry = { x: 286, y: 132 };
    state.points.seed = { x: 482, y: 500 };
    state.points.loop = { x: 456, y: 138 };
    state.points.scheduler = { x: 330, y: 114 };
    state.points.proposal = { x: 736, y: 96 };
    state.points.gate = { x: 744, y: 248 };
    state.points.workspace01 = { x: 660, y: 404 };
    state.points.workspace02 = { x: 816, y: 404 };
    state.points.workspace = state.points.workspace02;
    state.points.runner = { x: 742, y: 548 };
    state.points.ledger = { x: 118, y: 308 };
    state.points.parent = cellCenter(island02, 2, 1);
    state.points.inspirationA = cellCenter(island02, 1, 1);
    state.points.inspirationB = cellCenter(island02, 2, 2);
    state.points.inspirationC = cellCenter(island02, 3, 1);
    state.points.seedIsland01 = cellCenter(island01, 2, 1);
    state.points.seedIsland02 = cellCenter(island02, 2, 1);
    state.points.seedIsland03 = cellCenter(island03, 2, 1);
    state.points.workerAnchor01 = islandBaseAnchor(island01);
    state.points.workerAnchor02 = islandBaseAnchor(island02);
    state.points.workerAnchor03 = islandBaseAnchor(island03);
    state.points.worker01 = { x: 338, y: 492 };
    state.points.worker02 = { x: 480, y: 492 };
    state.points.worker03 = { x: 622, y: 492 };
    state.points.accept = cellCenter(island02, 3, 1);
    state.points.migrateMid = { x: 716, y: 474 };
    state.points.migrateTarget = cellCenter(island03, 4, 1);

    const proposalIn = { x: state.points.proposal.x + 5, y: state.points.proposal.y + 18 };
    const proposalOut = { x: state.points.proposal.x + 34, y: state.points.proposal.y - 3 };
    const gateIn = { x: state.points.gate.x - 18, y: state.points.gate.y + 2 };

    const trackDefs = {
      bootstrap: `M ${state.points.entry.x - 6} ${state.points.entry.y - 4} C ${state.points.entry.x - 72} ${state.points.entry.y - 42}, ${state.points.telemetry.x + 74} ${state.points.telemetry.y + 22}, ${state.points.telemetry.x + 18} ${state.points.telemetry.y + 4}`,
      seedOrigin: `M ${state.points.telemetry.x + 16} ${state.points.telemetry.y + 12} C ${state.points.telemetry.x + 126} ${state.points.telemetry.y + 190}, ${state.points.seed.x - 140} ${state.points.seed.y - 138}, ${state.points.seed.x - 4} ${state.points.seed.y - 34}`,
      seedLedger: `M ${state.points.seed.x - 34} ${state.points.seed.y - 2} C ${state.points.seed.x - 176} ${state.points.seed.y - 12}, ${state.points.ledger.x + 106} ${state.points.ledger.y + 6}, ${state.points.ledger.x + 44} ${state.points.ledger.y + 2}`,
      proposal: `M ${state.points.parent.x} ${state.points.parent.y} C ${state.points.parent.x + 62} ${state.points.parent.y - 92}, ${proposalIn.x - 88} ${proposalIn.y + 66}, ${proposalIn.x} ${proposalIn.y}`,
      gate: `M ${proposalOut.x} ${proposalOut.y} C ${proposalOut.x + 44} ${proposalOut.y + 2}, ${gateIn.x - 50} ${gateIn.y - 14}, ${gateIn.x} ${gateIn.y}`,
      proposalGate01: `M ${state.points.worker01.x + 8} ${state.points.worker01.y - 10} C ${state.points.worker01.x + 26} ${state.points.worker01.y - 118}, ${state.points.gate.x - 154} ${state.points.gate.y + 92}, ${state.points.gate.x - 18} ${state.points.gate.y + 2}`,
      proposalGate02: `M ${state.points.worker02.x + 8} ${state.points.worker02.y - 10} C ${state.points.worker02.x + 20} ${state.points.worker02.y - 106}, ${state.points.gate.x - 84} ${state.points.gate.y + 88}, ${state.points.gate.x - 12} ${state.points.gate.y + 2}`,
      proposalGate03: `M ${state.points.worker03.x + 8} ${state.points.worker03.y - 10} C ${state.points.worker03.x - 10} ${state.points.worker03.y - 118}, ${state.points.gate.x + 66} ${state.points.gate.y + 102}, ${state.points.gate.x - 6} ${state.points.gate.y + 6}`,
      materializeGhost: `M ${state.points.gate.x - 12} ${state.points.gate.y + 20} C ${state.points.gate.x - 56} ${state.points.gate.y + 84}, ${state.points.workspace01.x + 32} ${state.points.workspace01.y - 88}, ${state.points.workspace01.x + 2} ${state.points.workspace01.y - 18}`,
      materialize: `M ${state.points.gate.x + 10} ${state.points.gate.y + 22} C ${state.points.gate.x + 52} ${state.points.gate.y + 86}, ${state.points.workspace02.x - 40} ${state.points.workspace02.y - 88}, ${state.points.workspace02.x} ${state.points.workspace02.y - 18}`,
      judgeGhost: `M ${state.points.workspace01.x + 4} ${state.points.workspace01.y + 28} C ${state.points.workspace01.x + 24} ${state.points.workspace01.y + 88}, ${state.points.runner.x - 108} ${state.points.runner.y - 92}, ${state.points.runner.x - 26} ${state.points.runner.y - 12}`,
      judge: `M ${state.points.workspace02.x} ${state.points.workspace02.y + 28} C ${state.points.workspace02.x - 16} ${state.points.workspace02.y + 92}, ${state.points.runner.x + 42} ${state.points.runner.y - 96}, ${state.points.runner.x + 6} ${state.points.runner.y - 14}`,
      ledger: `M ${state.points.runner.x - 18} ${state.points.runner.y + 10} C ${state.points.runner.x - 166} ${state.points.runner.y + 84}, ${state.points.ledger.x + 156} ${state.points.ledger.y + 78}, ${state.points.ledger.x + 22} ${state.points.ledger.y + 30}`,
      archiveA: `M ${state.points.ledger.x + 50} ${state.points.ledger.y + 38} C ${state.points.ledger.x + 152} ${state.points.ledger.y + 108}, ${state.points.inspirationA.x - 140} ${state.points.inspirationA.y + 60}, ${state.points.inspirationA.x + 8} ${state.points.inspirationA.y + 4}`,
      archiveB: `M ${state.points.ledger.x + 46} ${state.points.ledger.y + 62} C ${state.points.ledger.x + 144} ${state.points.ledger.y + 148}, ${state.points.inspirationB.x - 128} ${state.points.inspirationB.y + 56}, ${state.points.inspirationB.x + 8} ${state.points.inspirationB.y + 4}`,
      archiveC: `M ${state.points.ledger.x + 42} ${state.points.ledger.y + 86} C ${state.points.ledger.x + 136} ${state.points.ledger.y + 188}, ${state.points.inspirationC.x - 122} ${state.points.inspirationC.y + 42}, ${state.points.inspirationC.x + 8} ${state.points.inspirationC.y + 4}`,
      evidence: `M ${state.points.ledger.x + 38} ${state.points.ledger.y - 12} C ${state.points.ledger.x + 102} ${state.points.ledger.y - 98}, ${state.points.telemetry.x - 48} ${state.points.telemetry.y + 44}, ${state.points.telemetry.x - 12} ${state.points.telemetry.y + 10}`,
      migrate: `M ${state.points.accept.x + 10} ${state.points.accept.y - 4} C ${state.points.accept.x + 92} ${state.points.accept.y + 84}, ${state.points.migrateTarget.x - 106} ${state.points.migrateTarget.y - 94}, ${state.points.migrateTarget.x + 8} ${state.points.migrateTarget.y - 4}`,
    };

    Object.entries(trackDefs).forEach(([key, d]) => {
      const path = createSvg("path", {
        class: "story-track",
        d,
        "data-track": key,
      });
      state.trackMap.set(key, path);
      trackLayer.appendChild(path);
    });

    const ringDefs = {
      "01-02": "M 220 474 Q 296 314 404 254",
      "02-03": "M 574 318 Q 668 368 748 482",
      "03-01": "M 668 606 Q 474 676 254 604",
    };

    Object.entries(ringDefs).forEach(([key, d]) => {
      const path = createSvg("path", {
        class: "story-ring",
        d,
      });
      state.ringMap.set(key, path);
      ringLayer.appendChild(path);
    });

    const workerDefs = {
      w01: `M ${state.points.worker01.x} ${state.points.worker01.y - 18} C ${state.points.worker01.x} ${state.points.worker01.y - 64}, ${state.points.workerAnchor01.x - 18} ${state.points.workerAnchor01.y + 58}, ${state.points.workerAnchor01.x} ${state.points.workerAnchor01.y + 6}`,
      w02: `M ${state.points.worker02.x} ${state.points.worker02.y - 18} C ${state.points.worker02.x} ${state.points.worker02.y - 58}, ${state.points.workerAnchor02.x} ${state.points.workerAnchor02.y + 44}, ${state.points.workerAnchor02.x} ${state.points.workerAnchor02.y + 6}`,
      w01proposal: `M ${state.points.worker01.x} ${state.points.worker01.y - 18} C ${state.points.worker01.x} ${state.points.worker01.y - 74}, ${state.points.parent.x - 96} ${state.points.parent.y + 70}, ${state.points.parent.x - 10} ${state.points.parent.y + 4}`,
      w02proposal: `M ${state.points.worker02.x} ${state.points.worker02.y - 18} C ${state.points.worker02.x + 8} ${state.points.worker02.y - 74}, ${state.points.parent.x - 46} ${state.points.parent.y + 62}, ${state.points.parent.x} ${state.points.parent.y + 4}`,
      w03proposal: `M ${state.points.worker03.x} ${state.points.worker03.y - 18} C ${state.points.worker03.x} ${state.points.worker03.y - 74}, ${state.points.parent.x + 96} ${state.points.parent.y + 70}, ${state.points.parent.x + 10} ${state.points.parent.y + 4}`,
      w03: `M ${state.points.worker03.x} ${state.points.worker03.y - 18} C ${state.points.worker03.x} ${state.points.worker03.y - 64}, ${state.points.workerAnchor03.x + 18} ${state.points.workerAnchor03.y + 58}, ${state.points.workerAnchor03.x} ${state.points.workerAnchor03.y + 6}`,
    };

    Object.entries(workerDefs).forEach(([key, d]) => {
      const path = createSvg("path", {
        class: "story-worker-line",
        d,
      });
      state.workerLineMap.set(key, path);
      workerLayer.appendChild(path);
    });

    const seedDefs = {
      s01: `M ${state.points.seed.x - 10} ${state.points.seed.y - 28} C ${state.points.seed.x - 110} ${state.points.seed.y - 98}, ${state.points.seedIsland01.x + 48} ${state.points.seedIsland01.y - 116}, ${state.points.seedIsland01.x + 8} ${state.points.seedIsland01.y - 6}`,
      s02: `M ${state.points.seed.x} ${state.points.seed.y - 30} C ${state.points.seed.x + 8} ${state.points.seed.y - 114}, ${state.points.seedIsland02.x - 6} ${state.points.seedIsland02.y + 76}, ${state.points.seedIsland02.x + 4} ${state.points.seedIsland02.y - 8}`,
      s03: `M ${state.points.seed.x + 10} ${state.points.seed.y - 28} C ${state.points.seed.x + 110} ${state.points.seed.y - 98}, ${state.points.seedIsland03.x - 48} ${state.points.seedIsland03.y - 116}, ${state.points.seedIsland03.x} ${state.points.seedIsland03.y - 6}`,
    };

    Object.entries(seedDefs).forEach(([key, d]) => {
      const path = createSvg("path", {
        class: "story-seed-ray",
        d,
      });
      state.seedRayMap.set(key, path);
      seedLayer.appendChild(path);
    });

    [
      ["col2", thresholdLine(island02, "col", 2)],
      ["col4", thresholdLine(island02, "col", 4)],
      ["row2", thresholdLine(island02, "row", 2)],
    ].forEach(([key, d]) => {
      const path = createSvg("path", {
        class: "story-threshold",
        d,
      });
      state.thresholdMap.set(key, path);
      thresholdLayer.appendChild(path);
    });

    [
      { key: "a", from: state.points.inspirationA, to: state.points.parent },
      { key: "b", from: state.points.inspirationB, to: state.points.parent },
      { key: "c", from: state.points.inspirationC, to: state.points.parent },
    ].forEach(({ key, from, to }) => {
      const path = createSvg("path", {
        class: "story-sample-link",
        d: `M ${from.x} ${from.y} Q ${to.x - 12} ${to.y - 34} ${to.x} ${to.y}`,
      });
      state.sampleLinkMap.set(key, path);
      sampleLayer.appendChild(path);
    });

    renderNode(nodeLayer, "entry", 456, 186, "run", "governed entrypoint", 196);
    renderNode(nodeLayer, "telemetry", 286, 132, "manifest", "config + telemetry", 172);
    renderNode(nodeLayer, "seed", 482, 500, "seed", "baseline", 168);
    renderNode(nodeLayer, "loop", 482, 500, "generation loop", "budget enters search", 192);
    renderNode(nodeLayer, "scheduler", 330, 114, "worker plan", "parallel generation", 174);
    renderNode(nodeLayer, "worker01", state.points.worker01.x, state.points.worker01.y, "", "", 0);
    renderNode(nodeLayer, "worker02", state.points.worker02.x, state.points.worker02.y, "worker", "local operator", 136);
    renderNode(nodeLayer, "worker03", state.points.worker03.x, state.points.worker03.y, "", "", 0);
    renderNode(nodeLayer, "proposal01", state.points.worker01.x, state.points.worker01.y, "", "", 0, "story-node--proposal");
    renderNode(nodeLayer, "proposal02", state.points.worker02.x, state.points.worker02.y, "patch proposal", "EVOLVE blocks only", 174, "story-node--proposal");
    renderNode(nodeLayer, "proposal03", state.points.worker03.x, state.points.worker03.y, "", "", 0, "story-node--proposal");
    renderNode(nodeLayer, "gate", state.points.gate.x, state.points.gate.y, "preflight gate", "syntax + contract", 170, "story-node--gate");
    renderNode(nodeLayer, "workspace01", state.points.workspace01.x, state.points.workspace01.y, "", "", 0);
    renderNode(nodeLayer, "workspace02", state.points.workspace02.x, state.points.workspace02.y, "candidate lab", "minimal workspace", 166);
    renderNode(nodeLayer, "runner", state.points.runner.x, state.points.runner.y, "domain runner", "result.json", 152);
    renderLedger(nodeLayer);

    svg.append(ringLayer, thresholdLayer, sampleLayer, islandLayer, trackLayer, seedLayer, workerLayer, nodeLayer);
  }

  renderAtlas();

  const scenes = [
    {
      id: "run",
      count: "01 / 12",
      title: "Run contract",
      line: "A governed entrypoint.",
      generation: "—",
      island: "none",
      operator: "entry",
      candidate: "none",
      state: "run declared",
      ledger: "not yet opened",
      code: ["run"],
      subcodeLabel: "run()",
      subcode: [
        "run():",
        "  enter governed execution",
        "  prepare the search lifecycle",
        "  do not materialize the system yet",
      ],
      visibleIslands: [],
      activeIslands: [],
      visibleNodes: ["entry"],
      activeNodes: ["entry"],
      visibleTracks: [],
      activeTracks: [],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["01|2-1", "02|2-1", "03|2-1"],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "manifest",
      count: "02 / 12",
      title: "Manifest and telemetry",
      line: "The run writes its identity, resolved configuration, and evidence surface.",
      generation: "000",
      island: "none",
      operator: "bootstrap",
      candidate: "none",
      state: "manifest written",
      ledger: "metadata stream opened",
      code: ["run", "manifest"],
      subcodeLabel: "initialize_manifest_and_telemetry()",
      subcode: [
        "initialize_manifest_and_telemetry():",
        "  write run manifest + resolved config",
        "  seed RNG and telemetry bridge",
        "  open the evidence plane before search",
      ],
      visibleIslands: [],
      activeIslands: [],
      visibleNodes: ["entry", "telemetry", "ledger"],
      activeNodes: ["telemetry", "ledger"],
      visibleTracks: ["bootstrap"],
      activeTracks: ["bootstrap"],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: [],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "seed",
      count: "03 / 12",
      title: "Seed and islands",
      line: "The seed is measured first, then copied into the local starting state of every island.",
      generation: "000",
      island: "01 · 02 · 03",
      operator: "seed",
      candidate: "seed",
      state: "seeded islands",
      ledger: "seed + manifest",
      code: ["run", "manifest", "seed"],
      subcodeLabel: "evaluate_seed_and_seed_islands()",
      subcode: [
        "evaluate_seed_and_seed_islands():",
        "  evaluate the seed program once",
        "  measure the incumbent baseline",
        "  copy that baseline into each island",
      ],
      visibleIslands: ["01", "02", "03"],
      activeIslands: ["01", "02", "03"],
      visibleNodes: ["telemetry", "seed", "ledger"],
      activeNodes: ["seed", "ledger"],
      visibleTracks: ["seedOrigin", "seedLedger"],
      activeTracks: ["seedOrigin", "seedLedger"],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: ["s01", "s02", "s03"],
      activeSeedRays: ["s01", "s02", "s03"],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["01|2-1", "02|2-1", "03|2-1"],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: ["seed", "attemptA", "attemptB", "attemptC", "attemptD"],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: ["seed"],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "loop",
      count: "04 / 12",
      title: "Generation loop",
      line: "The run enters its repeated generation budget.",
      generation: "001",
      island: "01 · 02 · 03",
      operator: "loop",
      candidate: "none",
      state: "budget loop opened",
      ledger: "seeded archives ready",
      code: ["run", "loop"],
      subcodeLabel: "for generation in budget:",
      subcode: [
        "for generation in budget:",
        "  carry the seeded islands forward",
        "  repeat the search lifecycle by generation",
        "  no worker is active yet in this scene",
      ],
      visibleIslands: ["01", "02", "03"],
      activeIslands: [],
      visibleNodes: ["loop"],
      activeNodes: ["loop"],
      visibleTracks: [],
      activeTracks: [],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["01|2-1", "02|2-1", "03|2-1"],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "workers",
      count: "05 / 12",
      title: "Parallel workers",
      line: "A worker is assigned to an island under bounded concurrency.",
      generation: "037",
      island: "01 · 02 · 03",
      operator: "bandit mix",
      candidate: "wave-037",
      state: "parallel generation",
      ledger: "job seeds + semaphores",
      code: ["run", "loop", "schedule"],
      subcodeLabel: "schedule_parallel_workers()",
      subcode: [
        "schedule_parallel_workers():",
        "  assign worker -> island",
        "  choose operator via bandit or restart pressure",
        "  bound LLM and CPU concurrency separately",
      ],
      visibleIslands: ["02"],
      activeIslands: ["02"],
      visibleNodes: WORKER_NODE_SETS.single,
      activeNodes: WORKER_NODE_SETS.single,
      visibleTracks: [],
      activeTracks: [],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: WORKER_LINE_SETS.single,
      activeWorkerLines: WORKER_LINE_SETS.single,
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["02|2-1"],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "sampling",
      count: "06 / 12",
      title: "Parent and inspirations",
      line: "Parent and inspirations are sampled from the live archive.",
      generation: "037",
      island: "02",
      operator: "mutate",
      candidate: "c-024",
      state: "sampling live archive",
      ledger: "materializable occupants only",
      code: ["run", "loop", "schedule", "sample"],
      subcodeLabel: "sample_local_archive()",
      subcode: [
        "sample_local_archive():",
        "  choose parent from island archive",
        "  add nearby and exploratory inspirations",
        "  prefer materializable occupants over dead roots",
      ],
      visibleIslands: ["02"],
      activeIslands: ["02"],
      visibleNodes: WORKER_NODE_SETS.single,
      activeNodes: WORKER_NODE_SETS.single,
      visibleTracks: [],
      activeTracks: [],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: WORKER_LINE_SETS.single,
      activeWorkerLines: WORKER_LINE_SETS.single,
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["02|2-1"],
      parentCells: ["02|2-1"],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "proposal",
      count: "07 / 12",
      title: "Bounded patch proposal",
      line: "The worker turns island context into a bounded proposal.",
      generation: "037",
      island: "02",
      operator: "mutate",
      candidate: "c-024",
      state: "PatchProposal emitted",
      ledger: "bounded edit surface",
      code: ["run", "loop", "sample", "proposal"],
      subcodeLabel: "propose_patchproposal()",
      subcode: [
        "propose_patchproposal(parent, inspirations):",
        "  build prompt from local archive context",
        "  target EVOLVE blocks only",
        "  return structured PatchProposal",
      ],
      visibleIslands: ["02"],
      activeIslands: ["02"],
      visibleNodes: PROPOSAL_NODE_SETS.trio,
      activeNodes: ["proposal02"],
      visibleTracks: [],
      activeTracks: [],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: WORKER_LINE_SETS.proposal,
      activeWorkerLines: WORKER_LINE_SETS.proposal,
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["02|2-1"],
      parentCells: ["02|2-1"],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "preflight",
      count: "08 / 12",
      title: "Preflight and candidate lab",
      line: "The PatchProposal is checked first; only vetted edits materialize as a candidate lab.",
      generation: "037",
      island: "02",
      operator: "mutate",
      candidate: "c-024",
      state: "vetted candidates only",
      ledger: "syntax + contract gate",
      code: ["run", "loop", "proposal", "validate", "materialize"],
      subcodeLabel: "preflight_patchproposal() -> materialize_candidate()",
      subcode: [
        "preflight_patchproposal(proposal):",
        "  reject unsafe or malformed edits",
        "materialize_candidate(vetted):",
        "  turn only vetted edits into candidate labs",
      ],
      visibleIslands: [],
      activeIslands: [],
      visibleNodes: ["proposal02", "gate", "workspace02"],
      activeNodes: ["proposal02", "gate", "workspace02"],
      visibleTracks: ["proposalGate02", "materialize"],
      activeTracks: ["proposalGate02", "materialize"],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: [],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "ledger",
      count: "09 / 12",
      title: "History ledger",
      line: "Every evaluated attempt enters history, whether it survives or not.",
      generation: "037",
      island: "none",
      operator: "mutate",
      candidate: "c-024",
      state: "full attempt history",
      ledger: "history != live archive",
      code: ["run", "loop", "evaluate", "ledger"],
      subcodeLabel: "ledger.append_attempt()",
      subcode: [
        "ledger.append_attempt(candidate, result):",
        "  persist every evaluated attempt",
        "  keep failures for audit and replay context",
        "  do not confuse history with live archive",
      ],
      visibleIslands: [],
      activeIslands: [],
      visibleNodes: ["workspace02", "runner", "ledger"],
      activeNodes: ["runner", "ledger"],
      visibleTracks: ["judge", "ledger"],
      activeTracks: ["ledger"],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["02|2-1"],
      parentCells: ["02|2-1"],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: ["seed", "attemptA", "attemptB", "attemptC", "attemptD"],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: ["seed", "attemptA"],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "archive",
      count: "10 / 12",
      title: "Niche-local acceptance",
      line: "The live archive keeps only the current niche winner, not the full history.",
      generation: "037",
      island: "02",
      operator: "mutate",
      candidate: "c-024",
      state: "niche winner only",
      ledger: "one winner per niche",
      code: ["run", "loop", "ledger", "archive"],
      subcodeLabel: "archive.update_niche()",
      subcode: [
        "archive.update_niche(island, candidate, result):",
        "  map descriptors -> niche coordinates",
        "  adapt thresholds until grid fills, then freeze",
        "  keep only the best occupant of that niche",
      ],
      visibleIslands: ["02"],
      activeIslands: ["02"],
      visibleNodes: ["ledger"],
      activeNodes: ["ledger"],
      visibleTracks: ["archiveA", "archiveB", "archiveC"],
      activeTracks: ["archiveA", "archiveB", "archiveC"],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: ["col2", "col4", "row2"],
      activeThresholds: ["col2", "col4", "row2"],
      seedCells: ["02|2-1"],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: ["02|1-1", "02|2-2", "02|3-1"],
      migrantTargetCells: [],
      visibleLedgerEntries: ["seed", "attemptA", "attemptB", "attemptC"],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: ["seed", "attemptA", "attemptB", "attemptC"],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "migration",
      count: "11 / 12",
      title: "Migration and pressure",
      line: "Islands stay local except for explicit ring migration under the same niche rules.",
      generation: "038",
      island: "02 → 03",
      operator: "elite transfer",
      candidate: "elite-009",
      state: "ring migration",
      ledger: "diversity protected",
      code: ["run", "loop", "archive", "migration"],
      subcodeLabel: "migrate_ring_elite()",
      subcode: [
        "migrate_ring_elite():",
        "  choose one materializable elite per island",
        "  send it through ring topology",
        "  reinsert under destination niche rules",
      ],
      visibleIslands: ["02", "03"],
      activeIslands: ["02", "03"],
      visibleNodes: [],
      activeNodes: [],
      visibleTracks: ["migrate"],
      activeTracks: ["migrate"],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: ["02|2-1", "03|2-1"],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: ["02|1-1", "02|2-2", "02|3-1", "03|1-1", "03|2-2", "03|3-1"],
      migrantTargetCells: ["03|4-1"],
      visibleLedgerEntries: [],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: [],
      markers: { candidate: null, ghost: null, migrant: null },
    },
    {
      id: "evidence",
      count: "12 / 12",
      title: "Evidence layer",
      line: "The run closes as manifest, telemetry, summaries, and replayable artifacts.",
      generation: "040",
      island: "all",
      operator: "summary",
      candidate: "best-candidate.py",
      state: "audit trail closed",
      ledger: "replayable evidence",
      code: ["run", "manifest", "evidence"],
      subcodeLabel: "emit_summary_manifest_and_replay()",
      subcode: [
        "emit_summary_manifest_and_replay():",
        "  persist run manifest and telemetry",
        "  export best candidate artifact",
        "  derive summaries and replay verification",
      ],
      visibleIslands: ["01", "02", "03"],
      activeIslands: ["01", "02", "03"],
      visibleNodes: ["ledger", "telemetry"],
      activeNodes: ["ledger", "telemetry"],
      visibleTracks: ["evidence"],
      activeTracks: ["evidence"],
      visibleRings: [],
      activeRings: [],
      visibleSampleLinks: [],
      activeSampleLinks: [],
      visibleWorkerLines: [],
      activeWorkerLines: [],
      visibleSeedRays: [],
      activeSeedRays: [],
      visibleThresholds: [],
      activeThresholds: [],
      seedCells: [],
      parentCells: [],
      inspirationCells: [],
      acceptedCells: [],
      migrantTargetCells: [],
      visibleLedgerEntries: ["seed", "attemptA", "attemptB", "attemptC", "attemptD"],
      ledgerActive: [],
      ledgerFailed: [],
      ledgerAccepted: ["seed", "attemptA", "attemptB", "attemptC", "attemptD"],
      markers: { candidate: null, ghost: null, migrant: null },
    },
  ];

  const sceneIndex = new Map(scenes.map((scene, index) => [scene.id, index]));
  const sceneArticles = Array.from(storyRoot.querySelectorAll(".story-scene"));
  const codeLines = Array.from(storyRoot.querySelectorAll(".story-code-line"));
  const progressDots = Array.from(storyRoot.querySelectorAll("[data-progress-dot]"));
  const statusNodes = {
    count: storyRoot.querySelector("[data-scene-count]"),
    title: storyRoot.querySelector("[data-scene-title]"),
    line: storyRoot.querySelector("[data-scene-line]"),
    subcodeLabel: storyRoot.querySelector("[data-subcode-label]"),
    subcodeBlock: storyRoot.querySelector("[data-subcode-block]"),
  };
  const markers = {
    candidate: storyRoot.querySelector(".story-marker--candidate"),
    ghost: storyRoot.querySelector(".story-marker--ghost"),
    migrant: storyRoot.querySelector(".story-marker--migrant"),
  };

  function placeMarker(node, pointName) {
    const point = state.points[pointName];
    if (!node || !point) {
      return;
    }
    const pct = pointToPercent(point);
    node.style.left = `${pct.left}%`;
    node.style.top = `${pct.top}%`;
    node.style.opacity = "1";
  }

  function hideMarker(node) {
    if (!node) {
      return;
    }
    node.style.opacity = "0";
  }

  function clearAtlasState() {
    state.islandMap.forEach((group) => group.classList.remove("is-visible", "is-active"));
    state.islandLabelMap.forEach((group, id) => {
      group.classList.remove("is-generic", "is-hidden");
      const title = group.querySelector("text:first-child");
      if (title) {
        title.textContent = "Island";
      }
    });
    state.nodeMap.forEach((group) => group.classList.remove("is-visible", "is-active"));
    state.trackMap.forEach((path) => path.classList.remove("is-visible", "is-active"));
    state.ringMap.forEach((path) => path.classList.remove("is-visible", "is-active"));
    state.sampleLinkMap.forEach((path) => path.classList.remove("is-visible", "is-active"));
    state.workerLineMap.forEach((path) => path.classList.remove("is-visible", "is-active"));
    state.seedRayMap.forEach((path) => path.classList.remove("is-visible", "is-active"));
    state.thresholdMap.forEach((path) => path.classList.remove("is-visible", "is-active"));
    state.ledgerEntryMap.forEach((entry) => {
      entry.closest(".story-ledger")?.classList.remove("is-visible");
    });
    state.ledgerEntryMap.forEach((entry) => entry.classList.remove("is-active", "is-failed", "is-accepted"));
    state.cellMap.forEach((cell) => {
      cell.classList.remove("is-seed", "is-parent", "is-inspiration", "is-accepted", "is-migrant-target");
    });
  }

  function applyScene(sceneId) {
    const index = sceneIndex.get(sceneId) ?? 0;
    const scene = scenes[index];

    storyRoot.setAttribute("data-active-scene", scene.id);

    sceneArticles.forEach((article) => {
      article.classList.toggle("is-active", article.getAttribute("data-scene") === scene.id);
    });

    codeLines.forEach((line) => {
      line.classList.toggle("is-active", scene.code.includes(line.getAttribute("data-code")));
    });

    progressDots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
    });

    if (statusNodes.count) statusNodes.count.textContent = scene.count;
    if (statusNodes.title) statusNodes.title.textContent = scene.title;
    if (statusNodes.line) statusNodes.line.textContent = scene.line;
    if (statusNodes.subcodeLabel) statusNodes.subcodeLabel.textContent = scene.subcodeLabel;
    if (statusNodes.subcodeBlock) statusNodes.subcodeBlock.textContent = scene.subcode.join("\n");

    clearAtlasState();

    scene.visibleIslands.forEach((id) => state.islandMap.get(id)?.classList.add("is-visible"));
    scene.activeIslands.forEach((id) => state.islandMap.get(id)?.classList.add("is-active"));
    if (scene.id === "seed" || scene.id === "loop" || scene.id === "workers" || scene.id === "evidence") {
      state.islandLabelMap.forEach((group, id) => {
        if (id === "02") {
          group.classList.add("is-generic");
          const title = group.querySelector("text:first-child");
          if (title) {
            title.textContent = "Island";
          }
          if (id !== "02") {
            group.classList.add("is-hidden");
          }
        } else {
          group.classList.add("is-hidden");
        }
      });
    }
    if (scene.id === "workers") {
      ["worker01", "worker03"].forEach((id) => {
        state.nodeMap.get(id)?.classList.remove("is-visible", "is-active");
      });
      ["w01", "w03"].forEach((id) => {
        state.workerLineMap.get(id)?.classList.remove("is-visible", "is-active");
      });
    }
    if (scene.id === "migration") {
      state.islandLabelMap.forEach((group, id) => {
        if (id === "02") {
          group.classList.add("is-generic");
          const title = group.querySelector("text:first-child");
          if (title) {
            title.textContent = "Island";
          }
        } else if (id === "03") {
          group.classList.add("is-hidden");
        }
      });
    }
    scene.visibleNodes.forEach((id) => state.nodeMap.get(id)?.classList.add("is-visible"));
    scene.activeNodes.forEach((id) => state.nodeMap.get(id)?.classList.add("is-active"));
    scene.visibleTracks.forEach((id) => state.trackMap.get(id)?.classList.add("is-visible"));
    scene.activeTracks.forEach((id) => state.trackMap.get(id)?.classList.add("is-active"));
    scene.visibleRings.forEach((id) => state.ringMap.get(id)?.classList.add("is-visible"));
    scene.activeRings.forEach((id) => state.ringMap.get(id)?.classList.add("is-active"));
    scene.visibleSampleLinks.forEach((id) => state.sampleLinkMap.get(id)?.classList.add("is-visible"));
    scene.activeSampleLinks.forEach((id) => state.sampleLinkMap.get(id)?.classList.add("is-active"));
    scene.visibleWorkerLines.forEach((id) => state.workerLineMap.get(id)?.classList.add("is-visible"));
    scene.activeWorkerLines.forEach((id) => state.workerLineMap.get(id)?.classList.add("is-active"));
    scene.visibleSeedRays.forEach((id) => state.seedRayMap.get(id)?.classList.add("is-visible"));
    scene.activeSeedRays.forEach((id) => state.seedRayMap.get(id)?.classList.add("is-active"));
    scene.visibleThresholds.forEach((id) => state.thresholdMap.get(id)?.classList.add("is-visible"));
    scene.activeThresholds.forEach((id) => state.thresholdMap.get(id)?.classList.add("is-active"));
    scene.seedCells.forEach((id) => state.cellMap.get(id)?.classList.add("is-seed"));
    scene.parentCells.forEach((id) => state.cellMap.get(id)?.classList.add("is-parent"));
    scene.inspirationCells.forEach((id) => state.cellMap.get(id)?.classList.add("is-inspiration"));
    scene.acceptedCells.forEach((id) => state.cellMap.get(id)?.classList.add("is-accepted"));
    scene.migrantTargetCells.forEach((id) => state.cellMap.get(id)?.classList.add("is-migrant-target"));
    if (scene.visibleLedgerEntries.length) {
      state.nodeMap.get("ledger")?.classList.add("is-visible");
    }
    scene.ledgerActive.forEach((id) => state.ledgerEntryMap.get(id)?.classList.add("is-active"));
    scene.ledgerFailed.forEach((id) => state.ledgerEntryMap.get(id)?.classList.add("is-failed"));
    scene.ledgerAccepted.forEach((id) => state.ledgerEntryMap.get(id)?.classList.add("is-accepted"));

    if (scene.markers.candidate) {
      placeMarker(markers.candidate, scene.markers.candidate);
    } else {
      hideMarker(markers.candidate);
    }

    if (scene.markers.ghost) {
      placeMarker(markers.ghost, scene.markers.ghost);
    } else {
      hideMarker(markers.ghost);
    }

    if (scene.markers.migrant) {
      placeMarker(markers.migrant, scene.markers.migrant);
    } else {
      hideMarker(markers.migrant);
    }
  }

  applyScene(scenes[0].id);

  if (!("IntersectionObserver" in window)) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      if (!visible.length) {
        return;
      }

      const sceneId = visible[0].target.getAttribute("data-scene");
      if (!sceneId) {
        return;
      }

      applyScene(sceneId);
    },
    {
      threshold: [0.3, 0.55, 0.8],
      rootMargin: "-24% 0px -28% 0px",
    }
  );

  sceneArticles.forEach((article) => observer.observe(article));
})();
