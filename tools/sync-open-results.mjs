#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const RESULTS_ROOT = path.resolve(SITE_ROOT, "..", "gother-labs-open-results");
const CATALOG_PATH = path.join(RESULTS_ROOT, "catalog.json");
const OUT_ROOT = path.join(SITE_ROOT, "open-results");

const CSS_VERSION = "site-gutters-v1";
const SITE_URL = "https://www.gotherlabs.com";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value) {
  if (typeof value !== "number") return escapeHtml(value);
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  }).format(value);
}

function formatMetric(value, { maximumFractionDigits = 3, minimumFractionDigits = 0 } = {}) {
  if (typeof value !== "number") return escapeHtml(value);
  return new Intl.NumberFormat("en", {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);
}

function formatPercent(value) {
  return `${formatMetric(value, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}%`;
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|#|\.{1,2}\/|\/)[^)\s]+)\)/g, (_match, label, href) => {
      const safeLabel = label;
      return href.startsWith("#") || href.startsWith("/") || href.startsWith("./") || href.startsWith("../")
        ? `<a href="${href}">${safeLabel}</a>`
        : `<a href="${href}" target="_blank" rel="noreferrer">${safeLabel}</a>`;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function markdownToHtml(markdown, inserts = {}) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let paragraph = [];
  let code = [];
  let formula = [];
  let inCode = false;
  let inFormula = false;
  let equationIndex = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    chunks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushCode = () => {
    if (!code.length) return;
    chunks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
  };

  const flushFormula = () => {
    if (!formula.length) return;
    equationIndex += 1;
    chunks.push(`<div class="formula-block" id="eq-${equationIndex}">
  <div class="formula-math">\\[
${escapeHtml(formula.join("\n"))}
\\]</div>
  <span class="equation-number">(${equationIndex})</span>
</div>`);
    formula = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
      }
      continue;
    }

    if (line.trim() === "$$") {
      if (inFormula) {
        flushFormula();
        inFormula = false;
      } else {
        flushParagraph();
        inFormula = true;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (inFormula) {
      formula.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const visual = line.trim().match(/^\{\{visual:([a-z0-9-]+)\}\}$/);
    if (visual) {
      flushParagraph();
      if (inserts[visual[1]]) {
        chunks.push(inserts[visual[1]]);
      }
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 1, 4);
      chunks.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushCode();
  flushFormula();
  return chunks.join("\n");
}

function articleWithoutTitle(markdown) {
  return markdown.replace(/\r\n/g, "\n").replace(/^#\s+.+\n+/, "");
}

function nav(prefix) {
  return `<header class="site-header">
        <nav class="site-nav" aria-label="Primary">
          <a class="brand nav-brand" href="${prefix}" aria-label="Göther Labs home">
            <img src="${prefix}assets/gother-mark.svg" alt="" class="brand-image">
          </a>
          <a href="${prefix}company/">Company</a>
          <a href="${prefix}domains/">Domains</a>
          <a href="${prefix}open-results/">Open Results</a>
          <a href="${prefix}contact/">Contact</a>
        </nav>
      </header>`;
}

function mathHead() {
  return `    <script>
      window.MathJax = {
        tex: {
          inlineMath: [["\\\\(", "\\\\)"]],
          displayMath: [["\\\\[", "\\\\]"]]
        },
        options: {
          enableMenu: false
        },
        chtml: {
          matchFontHeight: false
        }
      };
    </script>
    <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
`;
}

function htmlShell({ title, description, canonicalPath, cssPrefix, body, enableMath = false }) {
  const canonical = `${SITE_URL}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${SITE_URL}/assets/og-image.png">
    <link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="icon" href="${cssPrefix}assets/gother-mark.svg" type="image/svg+xml">
    <link rel="stylesheet" href="${cssPrefix}styles.css?v=${CSS_VERSION}">
${enableMath ? mathHead() : ""}
  </head>
  <body>
    <a class="skip-link" href="#site-main">Skip to content</a>
    <div class="page-shell site-shell">
      ${nav(cssPrefix)}

      <main class="site-main" id="site-main">
${body}
      </main>

      <footer class="site-footer">
        <p>© <span id="year">2026</span> Göther Labs</p>
      </footer>
    </div>

    <script src="${cssPrefix}scripts.js"></script>
  </body>
</html>
`;
}

function resultCard(result) {
  const labels = result.website?.display_labels ?? {};
  return `<article class="open-result-card">
            <a class="open-result-link" href="./${result.slug}/" aria-label="Read ${escapeHtml(result.title)}">
              <div class="open-result-meta">
                <p class="eyebrow">${escapeHtml(result.website.card_label)}</p>
              </div>
              <h2>${escapeHtml(result.title)}</h2>
              <p>${escapeHtml(result.website.card_summary || result.summary)}</p>
              <div class="open-result-measure">
                <span>${escapeHtml(labels.seed || "Seed objective")}</span>
                <strong>${formatNumber(result.metrics.seed)}</strong>
                <span>${escapeHtml(labels.best || "Best objective")}</span>
                <strong>${formatNumber(result.metrics.best)}</strong>
              </div>
            </a>
          </article>`;
}

async function writeIndex(results) {
  const cards = results.map(resultCard).join("\n\n");
  const body = `        <section class="hero compact-hero page-hero">
          <h1 class="page-title">Open results for evaluated technical improvement.</h1>
          <p class="intro open-results-hero-intro">
            Public technical results where the problem, evaluation contract, and accepted improvement can be inspected together.
          </p>
        </section>

        <section class="open-results-index" aria-label="Open results library">
${cards}
        </section>`;

  await fs.writeFile(
    path.join(OUT_ROOT, "index.html"),
    htmlShell({
      title: "Open Results | Göther Labs",
      description:
        "Open technical results from Göther Labs: evaluated runs, reproducible surfaces, and governed optimization evidence.",
      canonicalPath: "/open-results/",
      cssPrefix: "../",
      body,
    }),
    "utf8",
  );
}

async function copyIfExists(sourceRoot, outputRoot, relativeFile) {
  const source = path.join(sourceRoot, relativeFile);
  const target = path.join(outputRoot, relativeFile);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

function extractCandidateCode(code) {
  const match = code.match(/# EVOLVE_START:[^\n]*\n?([\s\S]*?)\n?# EVOLVE_END/);
  const candidateCode = match ? match[1] : code;
  return candidateCode
    .split("\n")
    .filter((line) => !/^# EVOLVE_(START|END)/.test(line.trim()))
    .join("\n")
    .trim();
}

function bestEvolutionStep(evolution) {
  const steps = Array.isArray(evolution?.steps) ? evolution.steps : [];
  return steps.reduce((best, step) => {
    if (typeof step.score !== "number") return best;
    if (!best || step.score < best.score) return step;
    return best;
  }, null);
}

function resultSnapshot(full, evolution) {
  const steps = Array.isArray(evolution?.steps) ? evolution.steps : [];
  const bestStep = bestEvolutionStep(evolution);
  const seedStep = steps[0];
  const finalRule = bestStep?.rule;
  const errors = bestStep?.integrand_error ?? {};
  const maxError = Math.max(...Object.values(errors).filter((value) => typeof value === "number"));
  const hasMaxError = Number.isFinite(maxError);
  const seedErrors = seedStep?.integrand_error ?? {};
  const seedMaxError = Math.max(...Object.values(seedErrors).filter((value) => typeof value === "number"));
  const hasSeedMaxError = Number.isFinite(seedMaxError) && seedMaxError > 0;
  const maxErrorReduction = hasMaxError && hasSeedMaxError ? ((seedMaxError - maxError) / seedMaxError) * 100 : null;

  const primary = hasMaxError
    ? {
        label: "Max representative residual error",
        value: formatMetric(maxError, { maximumFractionDigits: 5, minimumFractionDigits: 0 }),
        note: "Measured on the public analytic integrand readout.",
      }
    : typeof full.metrics?.oracle_capture_ratio === "number"
      ? {
          label: "Oracle capture ratio",
          value: formatPercent(full.metrics.oracle_capture_ratio * 100),
          note: "Share of oracle value captured under the frozen dispatch scenarios.",
        }
      : {
          label: "Objective reduction",
          value: formatPercent(full.metrics.improvement_pct),
          note: "Improvement under the frozen acceptance contract.",
        };

  const cards = [];
  if (finalRule?.nodes?.length) {
    cards.push(["Accepted rule", `${finalRule.nodes.length} nodes`]);
  }
  if (typeof maxErrorReduction === "number") {
    cards.push(["Max error reduction", formatPercent(maxErrorReduction)]);
  }
  if (typeof full.metrics?.improvement_pct === "number") {
    cards.push(["Objective reduction", formatPercent(full.metrics.improvement_pct)]);
  }
  if (typeof full.metrics?.regret_mean_eur === "number") {
    cards.push(["Mean regret", `€${formatMetric(full.metrics.regret_mean_eur, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`]);
  }
  if (cards.length < 4 && typeof full.metrics?.best === "number") {
    cards.push(["Acceptance objective", formatNumber(full.metrics.best)]);
  }

  return `<section class="open-result-snapshot" aria-label="Result summary">
            <div class="open-result-snapshot-primary">
              <span>${escapeHtml(primary.label)}</span>
              <strong>${primary.value}</strong>
              <p>${escapeHtml(primary.note)}</p>
            </div>
            <div class="open-result-snapshot-cards">
${cards
  .slice(0, 4)
  .map(
    ([label, value]) => `              <div>
                <span>${escapeHtml(label)}</span>
                <strong>${value}</strong>
              </div>`,
  )
  .join("\n")}
            </div>
          </section>`;
}

function quadratureProblemVisuals() {
  const plot = {
    left: 72,
    right: 510,
    top: 74,
    base: 238,
    amplitude: 140,
  };
  const mapX = (x) => plot.left + x * (plot.right - plot.left);
  const mapY = (y) => plot.base - y * plot.amplitude;
  const conceptFunction = (x) => {
    const envelope = Math.sin(Math.PI * x);
    return 0.86 * envelope * (0.86 + 0.14 * x) + 0.05 * x * (1 - x);
  };
  const plotClipRect = `<rect x="${plot.left}" y="${plot.top - 2}" width="${plot.right - plot.left}" height="${plot.base - plot.top + 2}" />`;
  const axes = `<path class="open-result-primer-grid" d="M${plot.left} ${plot.top} V${plot.base} H${plot.right}" />
                <path class="open-result-objective-grid" d="M${plot.left} ${mapY(1).toFixed(1)} H${plot.right}" />
                <text class="open-result-axis-tick open-result-y-tick" x="${plot.left - 16}" y="${mapY(1) + 4}">1</text>
                <path class="open-result-axis-notch" d="M${plot.left - 6} ${mapY(1)} H${plot.left}" />
                <text class="open-result-axis-tick" x="${plot.left}" y="${plot.base + 22}">0</text>
                <text class="open-result-axis-tick" x="${plot.right}" y="${plot.base + 22}">1</text>
                <text class="open-result-axis-label open-result-x-axis-title" x="${(plot.left + plot.right) / 2}" y="${plot.base + 48}">x</text>
                <text class="open-result-axis-label open-result-objective-y-title" x="34" y="${plot.top + (plot.base - plot.top) / 2}" transform="rotate(-90 34 ${plot.top + (plot.base - plot.top) / 2})">g(x)</text>`;
  const samples = Array.from({ length: 90 }, (_, index) => {
    const x = index / 89;
    const y = conceptFunction(x);
    return [mapX(x), mapY(y)];
  });
  const curvePath = samples.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `${curvePath} L${plot.right} ${plot.base} L${plot.left} ${plot.base} Z`;

  const conceptWeights = [0.14, 0.21, 0.30, 0.21, 0.14];
  const conceptCells = [];
  let cursor = 0;
  for (const weight of conceptWeights) {
    const x0 = cursor;
    const x1 = cursor + weight;
    conceptCells.push({ x0, x1, node: (x0 + x1) / 2, weight });
    cursor = x1;
  }
  const quadratureCells = conceptCells.map(({ x0, x1, node, weight }, index) => {
    const value = conceptFunction(node);
    const left = mapX(x0);
    const right = mapX(x1);
    const x = mapX(node);
    const y = mapY(value);
    return `<g class="open-result-concept-sample ${index === 2 ? "is-accepted" : ""}">
              <rect x="${left.toFixed(1)}" y="${y.toFixed(1)}" width="${(right - left).toFixed(1)}" height="${(plot.base - y).toFixed(1)}" />
              <line x1="${x.toFixed(1)}" y1="${plot.base}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />
              <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.2" />
            </g>`;
  });
  const residualRegionPaths = conceptCells.map(({ x0, x1, node }) => {
    const estimateY = mapY(conceptFunction(node));
    const cellLeft = mapX(x0);
    const cellRight = mapX(x1);
    const regionSamples = Array.from({ length: 24 }, (_, sampleIndex) => {
      const t = sampleIndex / 23;
      const x = x0 + (x1 - x0) * t;
      return [mapX(x), mapY(conceptFunction(x))];
    });
    const meanCurveY = regionSamples.reduce((sum, [, y]) => sum + y, 0) / regionSamples.length;
    const residualClass = meanCurveY < estimateY ? "open-result-residual-positive" : "open-result-residual-negative";
    const curveEdge = regionSamples
      .slice()
      .reverse()
      .map(([x, curveY]) => `L${x.toFixed(1)} ${curveY.toFixed(1)}`)
      .join(" ");
    const pathData = `M${cellLeft.toFixed(1)} ${estimateY.toFixed(1)} L${cellRight.toFixed(1)} ${estimateY.toFixed(1)} ${curveEdge} Z`;
    return { pathData, residualClass };
  });
  const residualRegions = residualRegionPaths
    .map(({ pathData, residualClass }) => `<path class="open-result-residual-region ${residualClass}" d="${pathData}" />`)
    .join("\n");
  const residualHatches = residualRegionPaths
    .map(({ pathData }) => `<path class="open-result-residual-hatch" d="${pathData}" />`)
    .join("\n");

  return {
    "exact-integral": `<figure class="open-result-primer-card open-result-paper-figure" id="fig-1">
              <svg class="open-result-primer-svg open-result-paper-chart-svg" viewBox="0 0 560 306" role="img" aria-label="Conceptual exact integral for an arbitrary function g on the unit interval.">
                <defs>
                  <clipPath id="conceptExactPlotClip">
                    ${plotClipRect}
                  </clipPath>
                  <clipPath id="conceptExactIntegralClip">
                    <path d="${areaPath}" />
                  </clipPath>
                  <pattern id="conceptExactIntegralHatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(62)">
                    <line x1="0" y1="0" x2="0" y2="12" />
                  </pattern>
                </defs>
                <text class="open-result-axis-label open-result-figure-title" x="${plot.left}" y="34">Conceptual integral of an arbitrary g(x)</text>
                ${axes}
                <g clip-path="url(#conceptExactPlotClip)">
                  <path class="open-result-primer-area exact-integral-area" d="${areaPath}" />
                  <rect class="open-result-integral-hatch" x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.base - plot.top}" clip-path="url(#conceptExactIntegralClip)" />
                  <path class="open-result-primer-curve" d="${curvePath}" />
                </g>
              </svg>
              <figcaption>Figure 1. Conceptual setup for the exact integral. The shaded surface denotes \\(I[g]\\) for an arbitrary function \\(g\\), separate from the public integrand suite used by the evaluation contract.</figcaption>
            </figure>`,
    "quadrature-rule": `<figure class="open-result-primer-card open-result-paper-figure" id="fig-2">
              <svg class="open-result-primer-svg open-result-paper-chart-svg" viewBox="0 0 560 306" role="img" aria-label="Conceptual quadrature rule showing weighted point evaluations of an arbitrary function.">
                <defs>
                  <clipPath id="conceptQuadraturePlotClip">
                    ${plotClipRect}
                  </clipPath>
                  <pattern id="conceptQuadratureHatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(62)">
                    <line x1="0" y1="0" x2="0" y2="12" />
                  </pattern>
                </defs>
                <text class="open-result-axis-label open-result-figure-title" x="${plot.left}" y="34">Weighted point evaluations</text>
                ${axes}
                <g clip-path="url(#conceptQuadraturePlotClip)">
                  <g class="open-result-concept-samples">
${quadratureCells.join("\n")}
                  </g>
                  <g class="open-result-concept-samples open-result-concept-sample-hatches">
${quadratureCells.join("\n")}
                  </g>
                  <path class="open-result-primer-curve muted-curve dashed-curve" d="${curvePath}" />
                </g>
              </svg>
              <figcaption>Figure 2. Quadrature replaces the continuous integral with weighted point evaluations. The blue cells are the estimate \\(Q_r[g]\\): each cell width represents \\(w_i\\), each height is \\(g(x_i)\\), and each area is one contribution \\(w_i g(x_i)\\).</figcaption>
            </figure>`,
    "residual-error": `<figure class="open-result-primer-card open-result-paper-figure" id="fig-3">
              <svg class="open-result-primer-svg open-result-paper-chart-svg" viewBox="0 0 560 306" role="img" aria-label="Conceptual residual between the exact integral and weighted quadrature estimate.">
                <defs>
                  <clipPath id="conceptResidualPlotClip">
                    ${plotClipRect}
                  </clipPath>
                  <pattern id="conceptResidualHatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(62)">
                    <line x1="0" y1="0" x2="0" y2="12" />
                  </pattern>
                </defs>
                <text class="open-result-axis-label open-result-figure-title" x="${plot.left}" y="34">Residual between I[g] and Q<tspan baseline-shift="sub" font-size="9">r</tspan><tspan dx="4">[g]</tspan></text>
                ${axes}
                <g clip-path="url(#conceptResidualPlotClip)">
                  <g class="open-result-concept-samples open-result-concept-samples-muted">
${quadratureCells.join("\n")}
                  </g>
                  <g class="open-result-residual-regions">
${residualRegions}
                  </g>
                  <g class="open-result-residual-hatches">
${residualHatches}
                  </g>
                  <path class="open-result-primer-curve" d="${curvePath}" />
                </g>
              </svg>
              <figcaption>Figure 3. Conceptual residual diagnostic. Local over- and under-estimation can coexist; the reported scalar residual is the absolute net difference between the quadrature estimate and the exact integral.</figcaption>
            </figure>`,
  };
}

function metricTable(rows) {
  if (!rows.length) return "";
  return `<div class="open-result-table-wrap">
          <table class="open-result-table">
            <tbody>
${rows
  .map(
    ([label, value]) => `              <tr>
                <th>${escapeHtml(label)}</th>
                <td>${value}</td>
              </tr>`,
  )
  .join("\n")}
            </tbody>
          </table>
        </div>`;
}

function paperTable({ caption, headers, rows, className = "" }) {
  const figureClass = ["open-result-paper-table", className].filter(Boolean).join(" ");
  const captionId = caption?.match(/^Table\s+(\d+)/)?.[1];
  const idAttribute = captionId ? ` id="table-${captionId}"` : "";
  return `<figure class="${figureClass}"${idAttribute}>
          <div class="open-result-table-wrap">
            <table class="open-result-table">
              <thead>
                <tr>
${headers.map((header) => `                  <th>${escapeHtml(header)}</th>`).join("\n")}
                </tr>
              </thead>
              <tbody>
${rows
  .map(
    (row) => `                <tr>
${row.map((cell) => `                  <td>${cell}</td>`).join("\n")}
                </tr>`,
  )
  .join("\n")}
              </tbody>
            </table>
          </div>
          ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>`;
}

function integrandMathLabel(name) {
  const labels = {
    sin_pi: "\\(\\sin(\\pi x)\\)",
    sqrt: "\\(\\sqrt{x}\\)",
    log1p: "\\(\\log(1+x)\\)",
  };
  return labels[name] ?? escapeHtml(name);
}

function integrandSvgLabel(name) {
  const labels = {
    sin_pi: "sin(&#960;x)",
    sqrt: "&#8730;x",
    log1p: "log(1+x)",
  };
  return labels[name] ?? escapeHtml(name);
}

function integrandFunction(name) {
  const functions = {
    sin_pi: (x) => Math.sin(Math.PI * x),
    sqrt: (x) => Math.sqrt(x),
    log1p: (x) => Math.log1p(x),
  };
  return functions[name] ?? ((x) => x);
}

function integrandExactValue(name) {
  const values = {
    sin_pi: 2 / Math.PI,
    sqrt: 2 / 3,
    log1p: 2 * Math.log(2) - 1,
  };
  return values[name];
}

function integrandExactMath(name) {
  const exact = {
    sin_pi: "\\(2/\\pi\\)",
    sqrt: "\\(2/3\\)",
    log1p: "\\(2\\log 2 - 1\\)",
  };
  return exact[name] ?? "";
}

function svgPolyline(points) {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

function ruleDistributionFigure({ rule, figureNumber, title, subtitle, markerClass, markerLabel, caption, ariaLabel, yMax = 1, yTicks = [0, 0.5, 1] }) {
  if (!rule?.nodes?.length || !rule?.weights?.length) return "";
  const panel = {
    left: 82,
    right: 512,
    height: 112,
    width: 430,
  };
  const subtitleMarkup = subtitle
    ? `<text class="open-result-axis-label open-result-panel-subtitle" x="${panel.left}" y="54">${subtitle}</text>`
    : "";
  const mapX = (node) => panel.left + node * panel.width;
  const mapY = (top, weight) => top + panel.height - (weight / yMax) * panel.height;
  const top = 74;
  const yTickMarkup = yTicks
    .map((tick) => {
      const y = mapY(top, tick);
      const label = Number.isInteger(tick) ? String(tick) : tick.toFixed(2).replace(/0$/, "");
      return `<g>
                <path class="open-result-objective-grid" d="M${panel.left} ${y.toFixed(1)} H${panel.right}" />
                <text class="open-result-axis-tick open-result-objective-y-label" x="${panel.left - 14}" y="${(y + 4).toFixed(1)}">${label}</text>
              </g>`;
    }).join("\n");
  const marks = rule.nodes
    .map((node, index) => {
      const weight = rule.weights?.[index] ?? 0;
      const x = mapX(node);
      const y = mapY(top, weight);
      const visibleRadius = weight > 0.000001 ? 4.4 : 3.1;
      return `<g class="${markerClass}">
                <line x1="${x.toFixed(1)}" y1="${(top + panel.height).toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />
                <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${visibleRadius.toFixed(1)}" />
              </g>`;
    }).join("\n");
  return `<figure class="open-result-primer-card open-result-paper-figure open-result-single-rule-figure" id="fig-${figureNumber}">
          <svg class="open-result-primer-svg open-result-accepted-rule-svg open-result-paper-chart-svg" viewBox="0 0 560 280" role="img" aria-label="${escapeHtml(ariaLabel)}">
            <text class="open-result-axis-label open-result-objective-y-title" x="34" y="${top + panel.height / 2}" transform="rotate(-90 34 ${top + panel.height / 2})">normalized weight w<tspan baseline-shift="sub" font-size="8">i</tspan></text>
            <g class="open-result-objective-legend open-result-single-rule-legend" transform="translate(${panel.right - 92} 34)">
              <g transform="translate(0 0)">
                <circle class="${markerClass === "open-result-baseline-node" ? "open-result-legend-baseline-dot" : "open-result-legend-accepted-dot"}" cx="0" cy="0" r="3.8" />
                <text x="16" y="4">${markerLabel}</text>
              </g>
            </g>
            <g class="open-result-rule-panel">
              <text class="open-result-axis-label open-result-figure-title" x="${panel.left}" y="36">${title}</text>
${subtitleMarkup}
              ${yTickMarkup}
              <path class="open-result-rule-paper-axis" d="M${panel.left} ${top} V${top + panel.height} H${panel.right}" />
              <text class="open-result-axis-tick" x="${panel.left}" y="${top + panel.height + 18}">0</text>
              <text class="open-result-axis-tick" x="${panel.left + panel.width / 2}" y="${top + panel.height + 18}">0.5</text>
              <text class="open-result-axis-tick" x="${panel.right}" y="${top + panel.height + 18}">1</text>
            </g>
            ${marks}
            <text class="open-result-axis-label open-result-x-axis-title" x="${panel.left + panel.width / 2}" y="260">node position x<tspan baseline-shift="sub" font-size="8">i</tspan></text>
          </svg>
          <figcaption>Figure ${figureNumber}. ${caption}</figcaption>
        </figure>`;
}

function baselineRulePaperFigure(evolution) {
  const baselineStep = Array.isArray(evolution?.steps) ? evolution.steps[0] : null;
  return ruleDistributionFigure({
    rule: baselineStep?.rule,
    figureNumber: 4,
    title: "Run baseline",
    subtitle: "",
    markerClass: "open-result-baseline-node",
    markerLabel: "run baseline",
    ariaLabel: "Run baseline quadrature rule shown as node position and normalized weight.",
    caption: "Run baseline \\(r_0\\). This fixed rule anchors the residual and objective improvements reported later.",
  });
}

function acceptedRulePaperFigure(evolution) {
  const bestStep = bestEvolutionStep(evolution);
  return ruleDistributionFigure({
    rule: bestStep?.rule,
    figureNumber: 5,
    title: "Accepted rule",
    subtitle: "",
    markerClass: "open-result-accepted-node",
    markerLabel: "accepted",
    ariaLabel: "Accepted five node quadrature rule shown as node position and normalized weight.",
    caption: "Accepted five-node rule in node-position and normalized-weight coordinates. The near-uniform weights and inward node placement define the candidate evaluated below.",
    yMax: 0.25,
    yTicks: [0, 0.1, 0.2, 0.25],
  });
}

function objectiveSummaryTable(full) {
  return paperTable({
    caption: "Table 2. Reported objective comparison under the frozen acceptance contract; lower values are better.",
    headers: ["Metric", "Run baseline", "Accepted", "Change"],
    rows: [
      [
        "Acceptance objective \\(J(r)\\)",
        formatMetric(full.metrics.seed, { maximumFractionDigits: 6, minimumFractionDigits: 6 }),
        formatMetric(full.metrics.best, { maximumFractionDigits: 6, minimumFractionDigits: 6 }),
        `-${formatMetric(full.metrics.improvement, { maximumFractionDigits: 6, minimumFractionDigits: 6 })}`,
      ],
      [
        "Relative objective change",
        "reference",
        formatPercent(full.metrics.improvement_pct),
        `${formatPercent(full.metrics.improvement_pct)} reduction`,
      ],
    ],
  });
}

function contractReproducibilityTable(evolution) {
  const steps = Array.isArray(evolution?.steps) ? evolution.steps : [];
  const baselineErrors = steps[0]?.integrand_error ?? {};
  const names = ["sin_pi", "sqrt", "log1p"].filter((name) => baselineErrors[name] !== undefined);
  return paperTable({
    className: "open-result-contract-table",
    caption: "Table 1. Evaluation contract surface. Each row defines one public residual component and the residual of the fixed run baseline.",
    headers: ["Component", "Integrand", "Analytic reference", "Baseline residual"],
    rows: names.map((name, index) => [
      `${index + 1}`,
      integrandMathLabel(name),
      integrandExactMath(name),
      formatMetric(baselineErrors[name], { maximumFractionDigits: 6, minimumFractionDigits: 6 }),
    ]),
  });
}

function residualErrorTable(evolution) {
  const steps = Array.isArray(evolution?.steps) ? evolution.steps : [];
  const seedErrors = steps[0]?.integrand_error ?? {};
  const acceptedErrors = bestEvolutionStep(evolution)?.integrand_error ?? {};
  const names = Array.from(new Set([...Object.keys(seedErrors), ...Object.keys(acceptedErrors)]));
  return paperTable({
    caption: "Table 3. Representative residual errors.",
    headers: ["Integrand", "Baseline residual", "Accepted residual", "Reduction"],
    rows: names.map((name) => {
      const seed = seedErrors[name];
      const accepted = acceptedErrors[name];
      const reduction = typeof seed === "number" && typeof accepted === "number" && seed > 0
        ? formatPercent(((seed - accepted) / seed) * 100)
        : "n/a";
      return [
        integrandMathLabel(name),
        formatMetric(seed, { maximumFractionDigits: 6, minimumFractionDigits: 6 }),
        formatMetric(accepted, { maximumFractionDigits: 6, minimumFractionDigits: 6 }),
        reduction,
      ];
    }),
  });
}

function residualLocationFigure(evolution) {
  const bestStep = bestEvolutionStep(evolution);
  const baselineStep = Array.isArray(evolution?.steps) ? evolution.steps[0] : null;
  const rule = bestStep?.rule;
  const baselineRule = baselineStep?.rule;
  const errors = bestStep?.integrand_error ?? {};
  const baselineErrors = baselineStep?.integrand_error ?? {};
  if (!rule?.nodes?.length || !rule?.weights?.length || !baselineRule?.nodes?.length || !Object.keys(errors).length) return "";

  const left = 72;
  const right = 382;
  const width = right - left;
  const panelTop = 88;
  const panelHeight = 116;
  const amplitude = 68;
  const names = Object.keys(errors);
  const intervals = rule.nodes.map((node, index) => {
    const previous = index === 0 ? 0 : (rule.nodes[index - 1] + node) / 2;
    const next = index === rule.nodes.length - 1 ? 1 : (node + rule.nodes[index + 1]) / 2;
    return [Math.max(0, previous), Math.min(1, next)];
  });
  const baselineActiveIndex = baselineRule.weights.findIndex((weight) => weight > 0.000001);
  const baselineNode = baselineRule.nodes[baselineActiveIndex >= 0 ? baselineActiveIndex : 0] ?? 0.5;

  const panels = names.map((name, panelIndex) => {
    const fn = integrandFunction(name);
    const top = panelTop + panelIndex * panelHeight;
    const base = top + 82;
    const maxY = Math.max(0.0001, ...Array.from({ length: 80 }, (_, index) => fn(index / 79)));
    const mapX = (x) => left + x * width;
    const mapY = (value) => base - (value / maxY) * amplitude;
    const curve = svgPolyline(Array.from({ length: 90 }, (_, index) => {
      const x = index / 89;
      return [mapX(x), mapY(fn(x))];
    }));
    const cells = intervals.map(([x0, x1], index) => {
      const node = rule.nodes[index];
      const value = fn(node);
      const y = mapY(value);
      const cellX = mapX(x0);
      const cellWidth = mapX(x1) - cellX;
      const regionSamples = Array.from({ length: 18 }, (_, sampleIndex) => {
        const t = sampleIndex / 17;
        const x = x0 + (x1 - x0) * t;
        return [mapX(x), mapY(fn(x))];
      });
      const highEdge = regionSamples
        .slice()
        .reverse()
        .map(([x, curveY]) => `L${x.toFixed(1)} ${curveY.toFixed(1)}`)
        .join(" ");
      const residualRegion = `M${cellX.toFixed(1)} ${y.toFixed(1)} L${(cellX + cellWidth).toFixed(1)} ${y.toFixed(1)} ${highEdge} Z`;
      return `<g class="open-result-residual-cell">
                <rect x="${cellX.toFixed(1)}" y="${y.toFixed(1)}" width="${cellWidth.toFixed(1)}" height="${(base - y).toFixed(1)}" />
                <path class="open-result-residual-cell-gap-fill" d="${residualRegion}" />
                <path class="open-result-residual-cell-gap" d="${residualRegion}" />
                <circle cx="${mapX(node).toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" />
              </g>`;
    }).join("\n");
    const baselineY = mapY(fn(baselineNode));
    return `<g transform="translate(0 0)">
              <text class="open-result-axis-label open-result-figure-title" x="${left}" y="${top}">${integrandSvgLabel(name)}</text>
              <text class="open-result-axis-label open-result-residual-value" x="414" y="${top + 24}">run baseline e<tspan baseline-shift="sub" font-size="8">j</tspan></text>
              <text class="open-result-axis-label open-result-residual-number open-result-residual-number-baseline" x="414" y="${top + 43}">${formatMetric(baselineErrors[name], { maximumFractionDigits: 6, minimumFractionDigits: 6 })}</text>
              <text class="open-result-axis-label open-result-residual-value" x="414" y="${top + 68}">accepted e<tspan baseline-shift="sub" font-size="8">j</tspan></text>
              <text class="open-result-axis-label open-result-residual-number" x="414" y="${top + 87}">${formatMetric(errors[name], { maximumFractionDigits: 6, minimumFractionDigits: 6 })}</text>
              <path class="open-result-primer-grid" d="M${left} ${top + 12} V${base} H${right}" />
              <text class="open-result-axis-tick" x="${left}" y="${base + 18}">0</text>
              <text class="open-result-axis-tick" x="${right}" y="${base + 18}">1</text>
              <text class="open-result-axis-label open-result-x-axis-title" x="${left + width / 2}" y="${base + 34}">x<tspan baseline-shift="sub" font-size="8">i</tspan></text>
              ${cells}
              <g class="open-result-residual-baseline-marker">
                <line x1="${mapX(baselineNode).toFixed(1)}" y1="${base}" x2="${mapX(baselineNode).toFixed(1)}" y2="${baselineY.toFixed(1)}" />
                <circle cx="${mapX(baselineNode).toFixed(1)}" cy="${baselineY.toFixed(1)}" r="3.6" />
              </g>
              <path class="open-result-primer-curve" d="${curve}" />
            </g>`;
  }).join("\n");

  return `<figure class="open-result-primer-card open-result-paper-figure" id="fig-7">
          <svg class="open-result-primer-svg open-result-residual-location-svg open-result-paper-chart-svg" viewBox="0 0 560 456" role="img" aria-label="Residual location diagnostics for the run baseline and accepted rule on each public integrand.">
            <defs>
              <pattern id="acceptedResidualHatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(62)">
                <line x1="0" y1="0" x2="0" y2="10" />
              </pattern>
            </defs>
            <text class="open-result-axis-label open-result-figure-title" x="${left}" y="34">Residual location diagnostic</text>
            <g class="open-result-objective-legend" transform="translate(${left} 48)">
              <g transform="translate(0 0)">
                <circle class="open-result-legend-baseline-dot" cx="0" cy="0" r="3.4" />
                <text x="16" y="4">run baseline sample</text>
              </g>
              <g transform="translate(142 0)">
                <circle class="open-result-legend-accepted-dot" cx="0" cy="0" r="3.8" />
                <text x="16" y="4">accepted samples</text>
              </g>
              <g transform="translate(282 0)">
                <line class="open-result-objective-legend-best" x1="0" y1="0" x2="18" y2="0" />
                <text x="26" y="4">integrand curve</text>
              </g>
            </g>
            ${panels}
          </svg>
          <figcaption>Figure 7. Residual location diagnostic by public integrand. The white curve is the analytic function, gray marks the run baseline sample, blue marks the accepted samples, and the hatched regions show where the accepted contribution cells depart locally from the curve; each panel uses its own vertical scale.</figcaption>
        </figure>`;
}

function objectiveCurveFigure(evolution) {
  const steps = Array.isArray(evolution?.steps) ? evolution.steps : [];
  const scored = steps.filter((step) => typeof step.score === "number");
  if (!scored.length) return "";

  const left = 82;
  const right = 512;
  const top = 74;
  const bottom = 260;
  const width = right - left;
  const height = bottom - top;
  const maxScore = Math.ceil(Math.max(...scored.map((step) => step.score)) / 100) * 100;
  const minScore = 0;
  const lastIndex = Math.max(...scored.map((step) => step.index ?? 0), 1);
  const mapX = (index) => left + (index / lastIndex) * width;
  const mapY = (score) => bottom - ((score - minScore) / (maxScore - minScore)) * height;
  let best = Infinity;
  const bestPoints = scored.map((step) => {
    best = Math.min(best, step.score);
    return [mapX(step.index ?? 0), mapY(best)];
  });
  const bestStep = bestEvolutionStep(evolution);
  const baselineStep = scored[0];
  const baselineX = mapX(baselineStep?.index ?? 0);
  const baselineY = mapY(baselineStep?.score ?? scored[0]?.score ?? maxScore);
  const acceptedX = mapX(bestStep?.index ?? 0);
  const acceptedY = mapY(bestStep?.score ?? best);
  const xTicks = [0, 20, 40, 60, lastIndex]
    .map((value) => {
      const x = mapX(value);
      return `<g>
                <path class="open-result-objective-x-tick" d="M${x.toFixed(1)} ${bottom} V${(bottom + 5).toFixed(1)}" />
                <text class="open-result-axis-tick" x="${x.toFixed(1)}" y="${bottom + 22}">${value}</text>
              </g>`;
    }).join("\n");
  const proposalDots = scored.map((step) => {
    const x = mapX(step.index ?? 0);
    const y = mapY(step.score);
    return `<circle class="open-result-objective-proposal" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.1" />`;
  }).join("\n");
  const grid = [0, 200, 400, 600, maxScore]
    .filter((value, index, values) => value <= maxScore && values.indexOf(value) === index)
    .map((value) => {
      const y = mapY(value);
      return `<g>
                <path class="open-result-objective-grid" d="M${left} ${y.toFixed(1)} H${right}" />
                <text class="open-result-axis-tick open-result-objective-y-label" x="${left - 18}" y="${(y + 4).toFixed(1)}">${value}</text>
              </g>`;
    }).join("\n");

  return `<figure class="open-result-primer-card open-result-paper-figure open-result-objective-figure" id="fig-6">
          <svg class="open-result-primer-svg open-result-objective-svg" viewBox="0 0 560 328" role="img" aria-label="Best so far objective curve across the curated public trace.">
            <text class="open-result-axis-label open-result-figure-title" x="${left}" y="34">Best-so-far acceptance objective (lower is better)</text>
            <g class="open-result-objective-legend" transform="translate(${left} 48)">
              <g transform="translate(0 0)">
                <circle class="open-result-objective-legend-proposal" cx="0" cy="0" r="2.4" />
                <text x="12" y="4">scored candidate</text>
              </g>
              <g transform="translate(118 0)">
                <line class="open-result-objective-legend-best" x1="0" y1="0" x2="16" y2="0" />
                <text x="24" y="4">best-so-far objective</text>
              </g>
              <g transform="translate(286 0)">
                <circle class="open-result-legend-baseline-dot" cx="0" cy="0" r="3.4" />
                <text x="16" y="4">baseline</text>
              </g>
              <g transform="translate(374 0)">
                <circle class="open-result-legend-accepted-dot" cx="0" cy="0" r="3.8" />
                <text x="16" y="4">accepted</text>
              </g>
            </g>
            ${grid}
            <path class="open-result-rule-paper-axis" d="M${left} ${top} V${bottom} H${right}" />
            ${xTicks}
            <text class="open-result-axis-label open-result-x-axis-title" x="${left + width / 2}" y="306">candidate index</text>
            <text class="open-result-axis-label open-result-objective-y-title" x="34" y="${top + height / 2}" transform="rotate(-90 34 ${top + height / 2})">J(r)</text>
            <g>${proposalDots}</g>
            <path class="open-result-objective-best" d="${svgPolyline(bestPoints)}" />
            <g class="open-result-objective-baseline">
              <circle cx="${baselineX.toFixed(1)}" cy="${baselineY.toFixed(1)}" r="4.2" />
            </g>
            <g class="open-result-objective-accepted">
              <circle cx="${acceptedX.toFixed(1)}" cy="${acceptedY.toFixed(1)}" r="4.8" />
            </g>
          </svg>
          <figcaption>Figure 6. Objective trace in paper form. Faint points are scored candidates; the solid step curve is the best-so-far acceptance objective retained under the frozen contract. The baseline and accepted markers show the reported comparison.</figcaption>
        </figure>`;
}

function paperAssetFigure({ src, caption, number }) {
  return `<figure class="open-result-paper-asset" id="fig-${number}">
          <img src="./${escapeHtml(src)}" alt="">
          <figcaption>Figure ${number}. ${escapeHtml(caption)}</figcaption>
        </figure>`;
}

function implementationCodeFigure(candidateCode) {
  return `<figure class="open-result-paper-code" id="listing-1">
          <pre><code>${escapeHtml(extractCandidateCode(candidateCode))}</code></pre>
          <figcaption>Listing 1. Accepted candidate implementation.</figcaption>
        </figure>`;
}

function quadratureWhitepaperInserts(full, evolution, candidateCode) {
  return {
    ...quadratureProblemVisuals(),
    "baseline-rule-figure": baselineRulePaperFigure(evolution),
    "accepted-rule-figure": acceptedRulePaperFigure(evolution),
    "objective-summary-table": objectiveSummaryTable(full),
    "contract-table": contractReproducibilityTable(evolution),
    "residual-error-table": residualErrorTable(evolution),
    "residual-location-figure": residualLocationFigure(evolution),
    "objective-curve": objectiveCurveFigure(evolution),
    "implementation-code": implementationCodeFigure(candidateCode),
  };
}

function acceptedRuleVisual(full, evolution) {
  const bestStep = bestEvolutionStep(evolution);
  const rule = bestStep?.rule;
  if (!rule?.nodes?.length || !rule?.weights?.length) return "";

  const maxWeight = Math.max(...rule.weights.filter((value) => typeof value === "number"));
  const leftGap = rule.nodes[0];
  const rightGap = 1 - rule.nodes[rule.nodes.length - 1];

  const nodes = rule.nodes
    .map((node, index) => {
      const weight = rule.weights[index] ?? 0;
      const x = Math.min(100, Math.max(0, node * 100));
      const bar = maxWeight > 0 ? Math.max(1.2, (weight / maxWeight) * 5.8) : 1.2;
      return `<div class="open-result-node" style="--x: ${x.toFixed(3)}%; --bar: ${bar.toFixed(3)}rem;">
              <span class="open-result-node-pin" aria-hidden="true"></span>
              <span class="open-result-node-label">${formatMetric(node, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</span>
              <span class="open-result-node-weight">${formatMetric(weight, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</span>
            </div>`;
    })
    .join("\n");

  return `<section class="open-result-rule-visual" aria-label="Accepted quadrature rule visual">
          <div class="open-result-rule-copy">
            <p class="eyebrow">Accepted rule</p>
            <h2>Accepted five-node rule.</h2>
            <p>The final candidate is not a black-box policy. It is a compact rule on the unit interval, with two nodes pulled in from the endpoints, a midpoint node, symmetric interior support, and near-uniform weights.</p>
          </div>
          <div class="open-result-rule-panel">
            <div class="open-result-rule-axis" aria-hidden="true">
              <span class="open-result-axis-end open-result-axis-start">0</span>
              <span class="open-result-axis-line"></span>
              <span class="open-result-axis-end open-result-axis-finish">1</span>
${nodes}
            </div>
            <div class="open-result-rule-summary">
              <div>
                <span>Left endpoint gap</span>
                <strong>${formatMetric(leftGap, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</strong>
              </div>
              <div>
                <span>Center node</span>
                <strong>${formatMetric(rule.nodes[Math.floor(rule.nodes.length / 2)], { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</strong>
              </div>
              <div>
                <span>Right endpoint gap</span>
                <strong>${formatMetric(rightGap, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</strong>
              </div>
            </div>
          </div>
        </section>`;
}

function resultEvidence(full, evolution) {
  const labels = full.website?.display_labels ?? {};
  const steps = Array.isArray(evolution?.steps) ? evolution.steps : [];
  const bestStep = bestEvolutionStep(evolution);
  const finalRule = bestStep?.rule;
  const scoreNote = full.website?.score_note;
  const seedStep = steps[0];
  const errors = bestStep?.integrand_error ?? {};
  const maxError = Math.max(...Object.values(errors).filter((value) => typeof value === "number"));
  const seedErrors = seedStep?.integrand_error ?? {};
  const seedMaxError = Math.max(...Object.values(seedErrors).filter((value) => typeof value === "number"));
  const maxErrorReduction = Number.isFinite(maxError) && Number.isFinite(seedMaxError) && seedMaxError > 0
    ? ((seedMaxError - maxError) / seedMaxError) * 100
    : null;

  const stats = Number.isFinite(maxError)
    ? [
        ["Max residual error", formatMetric(maxError, { maximumFractionDigits: 5, minimumFractionDigits: 0 })],
        ["Max error reduction", typeof maxErrorReduction === "number" ? formatPercent(maxErrorReduction) : "n/a"],
        ["Objective reduction", formatPercent(full.metrics.improvement_pct)],
        ["Accepted rule", finalRule?.nodes?.length ? `${finalRule.nodes.length} nodes` : "n/a"],
      ]
    : [
        ...(typeof full.metrics?.oracle_capture_ratio === "number"
          ? [["Oracle capture ratio", formatPercent(full.metrics.oracle_capture_ratio * 100)]]
          : []),
        ...(typeof full.metrics?.regret_mean_eur === "number"
          ? [["Mean regret", `€${formatMetric(full.metrics.regret_mean_eur, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`]]
          : []),
        [labels.improvement || "Improvement", formatNumber(full.metrics.improvement)],
        ["Objective reduction", formatPercent(full.metrics.improvement_pct)],
      ];

  const ruleTable = finalRule?.nodes?.length
    ? `<div class="open-result-table-wrap">
          <table class="open-result-table">
            <thead>
              <tr>
                <th>Node</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
${finalRule.nodes
  .map(
    (node, index) => `              <tr>
                <td>${formatNumber(node)}</td>
                <td>${formatNumber(finalRule.weights?.[index])}</td>
              </tr>`,
  )
  .join("\n")}
            </tbody>
          </table>
        </div>`
    : "";

  const errorRows = Object.entries(errors)
    .map(
      ([name, value]) => `              <tr>
                <td>${escapeHtml(name)}</td>
                <td>${formatNumber(value)}</td>
              </tr>`,
    )
    .join("\n");

  const errorTable = errorRows
    ? `<div class="open-result-table-wrap">
          <table class="open-result-table">
            <thead>
              <tr>
                <th>Integrand</th>
                <th>Residual error</th>
              </tr>
            </thead>
            <tbody>
${errorRows}
            </tbody>
          </table>
        </div>`
    : "";

  const storageRows = [
    typeof full.metrics?.oracle_capture_ratio === "number"
      ? ["Oracle capture ratio", formatPercent(full.metrics.oracle_capture_ratio * 100)]
      : null,
    typeof full.metrics?.regret_mean_eur === "number"
      ? ["Mean regret", `€${formatMetric(full.metrics.regret_mean_eur, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`]
      : null,
    full.artifacts?.dispatch_trace
      ? ["Dispatch trace", `<a href="./${escapeHtml(full.artifacts.dispatch_trace)}">Open JSON artifact</a>`]
      : null,
  ].filter(Boolean);

  const panels = [
    ruleTable
      ? `<div>
              <h3>Accepted rule</h3>
              ${ruleTable}
            </div>`
      : "",
    errorTable
      ? `<div>
              <h3>Representative errors</h3>
              ${errorTable}
            </div>`
      : "",
    !ruleTable && storageRows.length
      ? `<div>
              <h3>Dispatch readout</h3>
              ${metricTable(storageRows)}
            </div>`
      : "",
  ].filter(Boolean);

  return `<section class="open-result-evidence" aria-label="Result evidence">
          <div class="open-result-evidence-heading">
            <p class="eyebrow">Evidence</p>
            <h2>Acceptance score and observable behavior.</h2>
            ${scoreNote ? `<p>${escapeHtml(scoreNote)}</p>` : ""}
          </div>
          <div class="open-result-metric-grid">
${stats
  .map(
    ([label, value]) => `            <div class="open-result-metric-card">
              <span>${escapeHtml(label)}</span>
              <strong>${value}</strong>
            </div>`,
  )
  .join("\n")}
          </div>
          ${
            panels.length
              ? `<div class="open-result-data-grid open-result-data-grid-${panels.length}">
${panels.join("\n")}
          </div>`
              : ""
          }
        </section>`;
}

async function writeDetail(result) {
  const resultRoot = path.join(RESULTS_ROOT, "results", result.slug);
  const outputRoot = path.join(OUT_ROOT, result.slug);
  await fs.mkdir(outputRoot, { recursive: true });

  const full = JSON.parse(await fs.readFile(path.join(resultRoot, "result.json"), "utf8"));
  const article = await fs.readFile(path.join(resultRoot, "article.md"), "utf8");
  const evolution = JSON.parse(
    await fs.readFile(path.join(resultRoot, full.artifacts.evolution_trace), "utf8"),
  );
  const candidateCode = await fs.readFile(path.join(resultRoot, full.artifacts.candidate_code), "utf8");
  const plots = full.artifacts?.plots ?? [];
  for (const file of [
    full.artifacts?.candidate_code,
    full.artifacts?.evolution_trace,
    full.artifacts?.metrics,
    full.artifacts?.provenance,
    full.evaluation_contract?.artifact,
    ...plots,
  ].filter(Boolean)) {
    await copyIfExists(resultRoot, outputRoot, file);
  }

  const figures = plots
    .map(
      (plot) => `<figure class="open-result-figure">
            <img src="./${escapeHtml(plot)}" alt="">
            ${
              full.website?.figure_captions?.[plot]
                ? `<figcaption>${escapeHtml(full.website.figure_captions[plot])}</figcaption>`
                : ""
            }
          </figure>`,
    )
    .join("\n");

  const isQuadratureWhitepaper = full.slug === "quadrature-rule-optimization";
  const body = isQuadratureWhitepaper
    ? `        <section class="hero compact-hero page-hero open-result-detail-hero">
          <p class="eyebrow">${escapeHtml(full.domain)}</p>
          <h1 class="page-title">${escapeHtml(full.title)}</h1>
          <p class="intro open-results-hero-intro">${escapeHtml(full.summary)}</p>
        </section>

        <section class="open-result-detail open-result-whitepaper-shell">
          <article class="open-result-article open-result-whitepaper">
${markdownToHtml(articleWithoutTitle(article), quadratureWhitepaperInserts(full, evolution, candidateCode))}
          </article>
        </section>`
    : `        <section class="hero compact-hero page-hero open-result-detail-hero">
          <p class="eyebrow">${escapeHtml(full.domain)}</p>
          <h1 class="page-title">${escapeHtml(full.title)}</h1>
          <p class="intro open-results-hero-intro">${escapeHtml(full.summary)}</p>
        </section>

        <section class="open-result-detail">
          <article class="open-result-article">
${markdownToHtml(articleWithoutTitle(article), quadratureProblemVisuals(full, evolution))}
          </article>
        </section>

        ${acceptedRuleVisual(full, evolution)}

        ${resultSnapshot(full, evolution)}

        <section class="open-result-assets" aria-label="Public result figures">
${figures}
        </section>

        ${resultEvidence(full, evolution)}

        <section class="open-result-code" aria-label="Accepted candidate code">
          <div class="open-result-code-heading">
            <p class="eyebrow">Accepted implementation</p>
            <h2>Replayable candidate code.</h2>
          </div>
          <pre><code>${escapeHtml(extractCandidateCode(candidateCode))}</code></pre>
        </section>`;

  await fs.writeFile(
    path.join(outputRoot, "index.html"),
    htmlShell({
      title: `${full.title} | Open Results | Göther Labs`,
      description: full.summary,
      canonicalPath: `/open-results/${full.slug}/`,
      cssPrefix: "../../",
      body,
      enableMath: /\$\$|\\\(|\\\[/.test(article),
    }),
    "utf8",
  );
}

async function writeSitemap(results) {
  const urls = [
    "/",
    "/company/",
    "/domains/",
    "/open-results/",
    ...results.map((result) => `/open-results/${result.slug}/`),
    "/contact/",
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>\n    <loc>${SITE_URL}${url}</loc>\n  </url>`).join("\n")}
</urlset>
`;
  await fs.writeFile(path.join(SITE_ROOT, "sitemap.xml"), xml, "utf8");
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, "utf8"));
  const results = catalog.results
    .filter((result) => result.status === "published")
    .sort((a, b) => (a.website?.order ?? 999) - (b.website?.order ?? 999));

  await fs.mkdir(OUT_ROOT, { recursive: true });
  await writeIndex(results);
  for (const result of results) {
    await writeDetail(result);
  }
  await writeSitemap(results);
  console.log(`Synced ${results.length} open result(s) from ${path.relative(SITE_ROOT, RESULTS_ROOT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
