#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const RESULTS_ROOT = path.resolve(SITE_ROOT, "..", "gother-labs-open-results");
const CATALOG_PATH = path.join(RESULTS_ROOT, "catalog.json");
const OUT_ROOT = path.join(SITE_ROOT, "open-results");

const CSS_VERSION = "open-results-pipeline-v14";
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
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
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
  const match = code.match(/# EVOLVE_START:[\s\S]*?# EVOLVE_END/);
  return (match ? match[0] : code).trim();
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
    left: 52,
    right: 508,
    base: 236,
    amplitude: 136,
  };
  const mapX = (x) => plot.left + x * (plot.right - plot.left);
  const mapY = (y) => plot.base - y * plot.amplitude;
  const axes = `<path class="open-result-primer-grid" d="M${plot.left} 72 V${plot.base} H${plot.right}" />
                <text class="open-result-axis-tick open-result-y-tick" x="${plot.left - 18}" y="${mapY(1) + 4}">1</text>
                <path class="open-result-axis-notch" d="M${plot.left - 6} ${mapY(1)} H${plot.left}" />
                <text class="open-result-axis-tick" x="${plot.left}" y="262">0</text>
                <text class="open-result-axis-tick" x="${plot.right}" y="262">1</text>
                <text class="open-result-axis-label" x="${plot.right + 22}" y="${plot.base + 4}">x</text>`;
  const samples = Array.from({ length: 90 }, (_, index) => {
    const x = index / 89;
    const y = Math.sin(Math.PI * x);
    return [mapX(x), mapY(y)];
  });
  const curvePath = samples.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const areaPath = `${curvePath} L${plot.right} ${plot.base} L${plot.left} ${plot.base} Z`;

  const rectangleCount = 5;
  const rectangleWidth = (plot.right - plot.left) / rectangleCount;
  const roughRectangleData = Array.from({ length: rectangleCount }, (_, index) => {
    const x0 = plot.left + index * rectangleWidth;
    const x1 = x0 + rectangleWidth;
    const normalizedStart = index / rectangleCount;
    const normalizedEnd = (index + 1) / rectangleCount;
    const height = Math.min(Math.sin(Math.PI * normalizedStart), Math.sin(Math.PI * normalizedEnd)) * plot.amplitude;
    const y = plot.base - height;
    const cx = (x0 + x1) / 2;
    return { x0, x1, y, height, cx };
  });
  const roughRectangles = roughRectangleData.map(({ x0, x1, y, height, cx }) => {
    return `<g class="open-result-rough-rect">
                <rect x="${x0.toFixed(1)}" y="${y.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${height.toFixed(1)}" />
                <line x1="${cx.toFixed(1)}" y1="${plot.base}" x2="${cx.toFixed(1)}" y2="${y.toFixed(1)}" />
                <circle cx="${cx.toFixed(1)}" cy="${y.toFixed(1)}" r="4" />
              </g>`;
  }).join("\n");
  const residualRegionPaths = roughRectangleData.map(({ x0, x1, y }) => {
    const regionSamples = Array.from({ length: 22 }, (_, sampleIndex) => {
      const t = sampleIndex / 21;
      const x = x0 + (x1 - x0) * t;
      const normalized = (x - plot.left) / (plot.right - plot.left);
      return [x, mapY(Math.sin(Math.PI * normalized))];
    });
    const curveEdge = regionSamples
      .slice()
      .reverse()
      .map(([x, curveY]) => `L${x.toFixed(1)} ${curveY.toFixed(1)}`)
      .join(" ");
    return `M${x0.toFixed(1)} ${y.toFixed(1)} L${x1.toFixed(1)} ${y.toFixed(1)} ${curveEdge} Z`;
  });
  const residualRegions = residualRegionPaths
    .map((regionPath) => `<path class="open-result-residual-region" d="${regionPath}" />`)
    .join("\n");
  const residualHatchRegions = residualRegionPaths
    .map((regionPath) => `<path class="open-result-residual-hatch" d="${regionPath}" />`)
    .join("\n");

  return {
    "exact-integral": `<figure class="open-result-primer-card open-result-paper-figure">
              <svg class="open-result-primer-svg" viewBox="0 0 560 320" role="img" aria-label="The exact integral represented as the shaded area under sin pi x on the interval from zero to one.">
                <defs>
                  <clipPath id="exactIntegralClip">
                    <path d="${areaPath}" />
                  </clipPath>
                  <pattern id="exactIntegralHatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(62)">
                    <line x1="0" y1="0" x2="0" y2="12" />
                  </pattern>
                </defs>
                <text class="open-result-axis-label open-result-figure-title" x="64" y="54">f(x)=sin(πx)</text>
                ${axes}
                <path class="open-result-primer-area exact-integral-area" d="${areaPath}" />
                <rect class="open-result-integral-hatch" x="${plot.left}" y="72" width="${plot.right - plot.left}" height="${plot.base - 72}" clip-path="url(#exactIntegralClip)" />
                <path class="open-result-primer-curve" d="${curvePath}" />
              </svg>
              <figcaption>Figure 1. Exact integral represented as the area under f(x)=sin(πx) on the unit interval.</figcaption>
            </figure>`,
    "quadrature-rule": `<figure class="open-result-primer-card open-result-paper-figure">
              <svg class="open-result-primer-svg" viewBox="0 0 560 320" role="img" aria-label="A coarse rectangular quadrature rule approximating the area under sin pi x before optimization.">
                <text class="open-result-axis-label open-result-figure-title" x="64" y="54">Lower rectangle rule</text>
                ${axes}
                <g class="open-result-rough-rectangles">
${roughRectangles}
                </g>
                <path class="open-result-primer-curve" d="${curvePath}" />
                <text class="open-result-axis-label" x="330" y="82">rectangle sum</text>
                <text class="open-result-axis-label" x="330" y="102">lower approximation</text>
              </svg>
              <figcaption>Figure 2. A coarse quadrature rule replaces the continuous area with a small set of rectangle areas before any optimization is introduced.</figcaption>
            </figure>`,
    "residual-error": `<figure class="open-result-primer-card open-result-paper-figure">
              <svg class="open-result-primer-svg" viewBox="0 0 560 320" role="img" aria-label="Residual error shown as the area difference between a coarse quadrature rule and the exact integral.">
                <defs>
                  <pattern id="residualRegionHatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(62)">
                    <line x1="0" y1="0" x2="0" y2="12" />
                  </pattern>
                </defs>
                <text class="open-result-axis-label open-result-figure-title" x="64" y="54">Residual region</text>
                ${axes}
                <g class="open-result-rough-rectangles open-result-rough-rectangles-muted">
${roughRectangles}
                </g>
                <g class="open-result-residual-regions">
${residualRegions}
${residualHatchRegions}
                </g>
                <path class="open-result-primer-curve" d="${curvePath}" />
                <text class="open-result-axis-label" x="338" y="82">uncovered area</text>
                <text class="open-result-axis-label" x="338" y="102">curve minus rule</text>
              </svg>
              <figcaption>Figure 3. Residual error visualized as the area left between the coarse quadrature rectangles and the exact surface.</figcaption>
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

  const body = `        <section class="hero compact-hero page-hero open-result-detail-hero">
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
