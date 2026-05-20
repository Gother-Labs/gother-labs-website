#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeCopiedRunShell,
  sharedFaviconTag,
  sharedFontPreloadTag,
  sharedFooter,
  sharedNav,
  sharedScriptTag,
  sharedStylesheetTag,
} from "./site-shell.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const RESULTS_ROOT = path.resolve(SITE_ROOT, "..", "gother-labs-results");
const CATALOG_PATH = path.join(RESULTS_ROOT, "catalog.json");
const OUT_ROOT = path.join(SITE_ROOT, "results");

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

async function alignCopiedRunShell(outputRoot) {
  // Run surfaces are copied from the results repo, so normalize their shared site shell here.
  const runIndexPath = path.join(outputRoot, "run", "index.html");
  let html;

  try {
    html = await fs.readFile(runIndexPath, "utf8");
  } catch {
    return;
  }

  const runPrefix = "../../../";
  const aligned = normalizeCopiedRunShell(html, runPrefix);

  if (aligned !== html) {
    await fs.writeFile(runIndexPath, aligned, "utf8");
  }
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

function htmlShell({ title, description, canonicalPath, cssPrefix, body, enableMath = false, bodyClass = "" }) {
  const canonical = `${SITE_URL}${canonicalPath}`;
  const bodyClassAttribute = bodyClass ? ` class="${escapeHtml(bodyClass)}"` : "";
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
    ${sharedFontPreloadTag()}
    ${sharedFaviconTag(cssPrefix)}
    ${sharedStylesheetTag(cssPrefix)}
${enableMath ? mathHead() : ""}
  </head>
  <body${bodyClassAttribute}>
    <a class="skip-link" href="#site-main">Skip to content</a>
    <div class="page-shell site-shell">
      ${sharedNav(cssPrefix)}

      <main class="site-main" id="site-main">
${body}
      </main>

      ${sharedFooter()}
    </div>

    ${sharedScriptTag(cssPrefix)}
  </body>
</html>
`;
}

function resultCardMeasureItems(result) {
  if (Array.isArray(result.website?.card_metrics) && result.website.card_metrics.length > 0) {
    return result.website.card_metrics.slice(0, 2).map((metric) => [
      metric.label,
      metric.value,
    ]);
  }

  const labels = result.website?.display_labels ?? {};
  return [
    [labels.seed || "Seed objective", formatNumber(result.metrics.seed)],
    [labels.best || "Best objective", formatNumber(result.metrics.best)],
  ];
}

function resultCardVisual(result) {
  if (result.website?.card_visual === "rcpsp") {
    return `<svg class="result-card-visual result-card-visual--rcpsp" viewBox="0 0 560 360" aria-hidden="true" focusable="false">
                <g class="result-card-rcpsp">
                  <g class="schedule">
                    <path class="lane" d="M52 92 H508 M52 128 H508 M52 164 H508 M52 200 H508 M52 236 H508" />
                    <path class="axis" d="M52 258 H508" />
                    <g class="seed-bars">
                      <rect x="76" y="81" width="32" height="11" />
                      <rect x="86" y="117" width="58" height="11" />
                      <rect x="122" y="153" width="72" height="11" />
                      <rect x="164" y="189" width="44" height="11" />
                      <rect x="170" y="225" width="64" height="11" />
                      <rect x="252" y="81" width="54" height="11" />
                      <rect x="284" y="117" width="86" height="11" />
                      <rect x="334" y="153" width="78" height="11" />
                      <rect x="392" y="189" width="54" height="11" />
                      <rect x="430" y="225" width="44" height="11" />
                    </g>
                    <g class="accepted-bars">
                      <rect x="48" y="75" width="42" height="12" />
                      <rect x="74" y="111" width="74" height="12" />
                      <rect x="104" y="147" width="86" height="12" />
                      <rect x="148" y="183" width="58" height="12" />
                      <rect x="156" y="219" width="82" height="12" />
                      <rect x="228" y="75" width="72" height="12" />
                      <rect x="254" y="111" width="108" height="12" />
                      <rect x="304" y="147" width="96" height="12" />
                      <rect x="356" y="183" width="70" height="12" />
                      <rect x="388" y="219" width="56" height="12" />
                    </g>
                    <line class="cmax accepted" x1="418" y1="64" x2="418" y2="258" />
                    <line class="cmax seed" x1="502" y1="64" x2="502" y2="258" />
                  </g>
                  <g class="load" transform="translate(52 292)">
                    <path class="capacity" d="M0 16 H456" />
                    <rect class="seed" x="0" y="20" width="34" height="28" />
                    <rect class="accepted" x="0" y="8" width="34" height="40" />
                    <rect class="seed" x="46" y="24" width="34" height="24" />
                    <rect class="accepted" x="46" y="8" width="34" height="40" />
                    <rect class="seed" x="92" y="8" width="34" height="40" />
                    <rect class="accepted" x="92" y="2" width="34" height="46" />
                    <rect class="seed" x="138" y="12" width="34" height="36" />
                    <rect class="accepted" x="138" y="18" width="34" height="30" />
                    <rect class="seed" x="184" y="10" width="34" height="38" />
                    <rect class="accepted" x="184" y="8" width="34" height="40" />
                    <rect class="seed" x="230" y="10" width="34" height="38" />
                    <rect class="accepted" x="230" y="8" width="34" height="40" />
                    <rect class="seed" x="276" y="12" width="34" height="36" />
                    <rect class="accepted" x="276" y="16" width="34" height="32" />
                    <rect class="seed" x="322" y="12" width="34" height="36" />
                    <rect class="accepted" x="322" y="16" width="34" height="32" />
                    <rect class="seed" x="368" y="16" width="34" height="32" />
                    <rect class="accepted" x="368" y="22" width="34" height="26" />
                  </g>
                </g>
              </svg>`;
  }

  if (result.website?.card_visual !== "quadrature") return "";

  return `<svg class="result-card-visual" viewBox="0 0 560 360" aria-hidden="true" focusable="false">
                <defs>
                  <clipPath id="quadrature-card-area">
                    <path d="M44 286 L44 230 C95 166 154 109 226 82 C310 50 409 72 516 148 L516 286 Z" />
                  </clipPath>
                  <pattern id="quadrature-card-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(58)">
                    <line x1="0" y1="0" x2="0" y2="18" />
                  </pattern>
                </defs>
                <g class="result-card-chart">
                  <line x1="44" y1="286" x2="516" y2="286" />
                  <line x1="44" y1="286" x2="44" y2="48" />
                  <line x1="44" y1="92" x2="516" y2="92" class="grid" />
                  <path class="area" d="M44 286 L44 230 C95 166 154 109 226 82 C310 50 409 72 516 148 L516 286 Z" />
                  <rect class="hatch" x="44" y="48" width="472" height="238" clip-path="url(#quadrature-card-area)" />
                  <path class="curve" d="M44 230 C95 166 154 109 226 82 C310 50 409 72 516 148" />
                  <g class="nodes">
                    <line x1="92" y1="286" x2="92" y2="176" />
                    <line x1="188" y1="286" x2="188" y2="98" />
                    <line x1="280" y1="286" x2="280" y2="64" />
                    <line x1="374" y1="286" x2="374" y2="82" />
                    <line x1="468" y1="286" x2="468" y2="124" />
                    <circle cx="92" cy="176" r="9" />
                    <circle cx="188" cy="98" r="9" />
                    <circle cx="280" cy="64" r="9" />
                    <circle cx="374" cy="82" r="9" />
                    <circle cx="468" cy="124" r="9" />
                  </g>
                </g>
              </svg>`;
}

function resultCard(result) {
  const measures = resultCardMeasureItems(result);
  const visualClass = result.website?.card_visual ? ` result-card--${escapeHtml(result.website.card_visual)}` : "";
  const visual = resultCardVisual(result);
  const visualMarkup = visual ? `              ${visual}\n` : "";
  return `<article class="result-card${visualClass}">
            <a class="result-link" href="./${result.slug}/" aria-label="Read ${escapeHtml(result.title)}">
${visualMarkup}              <div class="result-meta">
                <p class="eyebrow">${escapeHtml(result.website.card_label)}</p>
              </div>
              <h2>${escapeHtml(result.title)}</h2>
              <p>${escapeHtml(result.website.card_summary || result.summary)}</p>
              <div class="result-measure">
                ${measures.map(([label, value]) => `<span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>`).join("\n                ")}
              </div>
            </a>
          </article>`;
}

async function writeIndex(results) {
  const cards = results.map(resultCard).join("\n\n");
  const body = `        <section class="hero compact-hero page-hero">
          <h1 class="page-title">Results for evaluated technical improvement.</h1>
          <p class="intro results-hero-intro">
            Public technical results where the problem, evaluation contract, and accepted improvement can be inspected together.
          </p>
        </section>

        <section class="results-index" aria-label="Results library">
${cards}
        </section>`;

  await fs.writeFile(
    path.join(OUT_ROOT, "index.html"),
    htmlShell({
      title: "Results | Göther Labs",
      description:
        "Public technical results from Göther Labs: evaluated runs, reproducible surfaces, and governed optimization evidence.",
      canonicalPath: "/results/",
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

async function copyDirectoryIfExists(source, target) {
  try {
    const stat = await fs.stat(source);
    if (!stat.isDirectory()) return;
  } catch {
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true });
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

  return `<section class="result-snapshot" aria-label="Result summary">
            <div class="result-snapshot-primary">
              <span>${escapeHtml(primary.label)}</span>
              <strong>${primary.value}</strong>
              <p>${escapeHtml(primary.note)}</p>
            </div>
            <div class="result-snapshot-cards">
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
  const axes = `<path class="result-primer-grid" d="M${plot.left} ${plot.top} V${plot.base} H${plot.right}" />
                <path class="result-objective-grid" d="M${plot.left} ${mapY(1).toFixed(1)} H${plot.right}" />
                <text class="result-axis-tick result-y-tick" x="${plot.left - 16}" y="${mapY(1) + 4}">1</text>
                <path class="result-axis-notch" d="M${plot.left - 6} ${mapY(1)} H${plot.left}" />
                <text class="result-axis-tick" x="${plot.left}" y="${plot.base + 22}">0</text>
                <text class="result-axis-tick" x="${plot.right}" y="${plot.base + 22}">1</text>
                <text class="result-axis-label result-x-axis-title" x="${(plot.left + plot.right) / 2}" y="${plot.base + 48}">x</text>
                <text class="result-axis-label result-objective-y-title" x="34" y="${plot.top + (plot.base - plot.top) / 2}" transform="rotate(-90 34 ${plot.top + (plot.base - plot.top) / 2})">g(x)</text>`;
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
    return `<g class="result-concept-sample ${index === 2 ? "is-accepted" : ""}">
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
    const residualClass = meanCurveY < estimateY ? "result-residual-positive" : "result-residual-negative";
    const curveEdge = regionSamples
      .slice()
      .reverse()
      .map(([x, curveY]) => `L${x.toFixed(1)} ${curveY.toFixed(1)}`)
      .join(" ");
    const pathData = `M${cellLeft.toFixed(1)} ${estimateY.toFixed(1)} L${cellRight.toFixed(1)} ${estimateY.toFixed(1)} ${curveEdge} Z`;
    return { pathData, residualClass };
  });
  const residualRegions = residualRegionPaths
    .map(({ pathData, residualClass }) => `<path class="result-residual-region ${residualClass}" d="${pathData}" />`)
    .join("\n");
  const residualHatches = residualRegionPaths
    .map(({ pathData }) => `<path class="result-residual-hatch" d="${pathData}" />`)
    .join("\n");

  return {
    "exact-integral": `<figure class="result-primer-card result-paper-figure" id="fig-1">
              <svg class="result-primer-svg result-paper-chart-svg" viewBox="0 0 560 306" role="img" aria-label="Conceptual exact integral for an arbitrary function g on the unit interval.">
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
                <text class="result-axis-label result-figure-title" x="${plot.left}" y="34">Conceptual integral of an arbitrary g(x)</text>
                ${axes}
                <g clip-path="url(#conceptExactPlotClip)">
                  <path class="result-primer-area exact-integral-area" d="${areaPath}" />
                  <rect class="result-integral-hatch" x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.base - plot.top}" clip-path="url(#conceptExactIntegralClip)" />
                  <path class="result-primer-curve" d="${curvePath}" />
                </g>
              </svg>
              <figcaption>Figure 1. Conceptual setup for the exact integral. The shaded surface denotes \\(I[g]\\) for an arbitrary function \\(g\\), separate from the public integrand suite used by the evaluation contract.</figcaption>
            </figure>`,
    "quadrature-rule": `<figure class="result-primer-card result-paper-figure" id="fig-2">
              <svg class="result-primer-svg result-paper-chart-svg" viewBox="0 0 560 306" role="img" aria-label="Conceptual quadrature rule showing weighted point evaluations of an arbitrary function.">
                <defs>
                  <clipPath id="conceptQuadraturePlotClip">
                    ${plotClipRect}
                  </clipPath>
                  <pattern id="conceptQuadratureHatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(62)">
                    <line x1="0" y1="0" x2="0" y2="12" />
                  </pattern>
                </defs>
                <text class="result-axis-label result-figure-title" x="${plot.left}" y="34">Weighted point evaluations</text>
                ${axes}
                <g clip-path="url(#conceptQuadraturePlotClip)">
                  <g class="result-concept-samples">
${quadratureCells.join("\n")}
                  </g>
                  <g class="result-concept-samples result-concept-sample-hatches">
${quadratureCells.join("\n")}
                  </g>
                  <path class="result-primer-curve muted-curve dashed-curve" d="${curvePath}" />
                </g>
              </svg>
              <figcaption>Figure 2. Quadrature replaces the continuous integral with weighted point evaluations. The blue cells are the estimate \\(Q_r[g]\\): each cell width represents \\(w_i\\), each height is \\(g(x_i)\\), and each area is one contribution \\(w_i g(x_i)\\).</figcaption>
            </figure>`,
    "residual-error": `<figure class="result-primer-card result-paper-figure" id="fig-3">
              <svg class="result-primer-svg result-paper-chart-svg" viewBox="0 0 560 306" role="img" aria-label="Conceptual residual between the exact integral and weighted quadrature estimate.">
                <defs>
                  <clipPath id="conceptResidualPlotClip">
                    ${plotClipRect}
                  </clipPath>
                  <pattern id="conceptResidualHatch" patternUnits="userSpaceOnUse" width="12" height="12" patternTransform="rotate(62)">
                    <line x1="0" y1="0" x2="0" y2="12" />
                  </pattern>
                </defs>
                <text class="result-axis-label result-figure-title" x="${plot.left}" y="34">Residual between I[g] and Q<tspan baseline-shift="sub" font-size="9">r</tspan><tspan dx="4">[g]</tspan></text>
                ${axes}
                <g clip-path="url(#conceptResidualPlotClip)">
                  <g class="result-concept-samples result-concept-samples-muted">
${quadratureCells.join("\n")}
                  </g>
                  <g class="result-residual-regions">
${residualRegions}
                  </g>
                  <g class="result-residual-hatches">
${residualHatches}
                  </g>
                  <path class="result-primer-curve" d="${curvePath}" />
                </g>
              </svg>
              <figcaption>Figure 3. Conceptual residual diagnostic. Local over- and under-estimation can coexist; the reported scalar residual is the absolute net difference between the quadrature estimate and the exact integral.</figcaption>
            </figure>`,
  };
}

function metricTable(rows) {
  if (!rows.length) return "";
  return `<div class="result-table-wrap">
          <table class="result-table">
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
  const figureClass = ["result-paper-table", className].filter(Boolean).join(" ");
  const captionId = caption?.match(/^Table\s+(\d+)/)?.[1];
  const idAttribute = captionId ? ` id="table-${captionId}"` : "";
  return `<figure class="${figureClass}"${idAttribute}>
          <div class="result-table-wrap">
            <table class="result-table">
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
    ? `<text class="result-axis-label result-panel-subtitle" x="${panel.left}" y="54">${subtitle}</text>`
    : "";
  const mapX = (node) => panel.left + node * panel.width;
  const mapY = (top, weight) => top + panel.height - (weight / yMax) * panel.height;
  const top = 74;
  const yTickMarkup = yTicks
    .map((tick) => {
      const y = mapY(top, tick);
      const label = Number.isInteger(tick) ? String(tick) : tick.toFixed(2).replace(/0$/, "");
      return `<g>
                <path class="result-objective-grid" d="M${panel.left} ${y.toFixed(1)} H${panel.right}" />
                <text class="result-axis-tick result-objective-y-label" x="${panel.left - 14}" y="${(y + 4).toFixed(1)}">${label}</text>
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
  return `<figure class="result-primer-card result-paper-figure result-single-rule-figure" id="fig-${figureNumber}">
          <svg class="result-primer-svg result-accepted-rule-svg result-paper-chart-svg" viewBox="0 0 560 280" role="img" aria-label="${escapeHtml(ariaLabel)}">
            <text class="result-axis-label result-objective-y-title" x="34" y="${top + panel.height / 2}" transform="rotate(-90 34 ${top + panel.height / 2})">normalized weight w<tspan baseline-shift="sub" font-size="8">i</tspan></text>
            <g class="result-objective-legend result-single-rule-legend" transform="translate(${panel.right - 92} 34)">
              <g transform="translate(0 0)">
                <circle class="${markerClass === "result-baseline-node" ? "result-legend-baseline-dot" : "result-legend-accepted-dot"}" cx="0" cy="0" r="3.8" />
                <text x="16" y="4">${markerLabel}</text>
              </g>
            </g>
            <g class="result-rule-panel">
              <text class="result-axis-label result-figure-title" x="${panel.left}" y="36">${title}</text>
${subtitleMarkup}
              ${yTickMarkup}
              <path class="result-rule-paper-axis" d="M${panel.left} ${top} V${top + panel.height} H${panel.right}" />
              <text class="result-axis-tick" x="${panel.left}" y="${top + panel.height + 18}">0</text>
              <text class="result-axis-tick" x="${panel.left + panel.width / 2}" y="${top + panel.height + 18}">0.5</text>
              <text class="result-axis-tick" x="${panel.right}" y="${top + panel.height + 18}">1</text>
            </g>
            ${marks}
            <text class="result-axis-label result-x-axis-title" x="${panel.left + panel.width / 2}" y="260">node position x<tspan baseline-shift="sub" font-size="8">i</tspan></text>
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
    markerClass: "result-baseline-node",
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
    markerClass: "result-accepted-node",
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
    className: "result-contract-table",
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
      return `<g class="result-residual-cell">
                <rect x="${cellX.toFixed(1)}" y="${y.toFixed(1)}" width="${cellWidth.toFixed(1)}" height="${(base - y).toFixed(1)}" />
                <path class="result-residual-cell-gap-fill" d="${residualRegion}" />
                <path class="result-residual-cell-gap" d="${residualRegion}" />
                <circle cx="${mapX(node).toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" />
              </g>`;
    }).join("\n");
    const baselineY = mapY(fn(baselineNode));
    return `<g transform="translate(0 0)">
              <text class="result-axis-label result-figure-title" x="${left}" y="${top}">${integrandSvgLabel(name)}</text>
              <text class="result-axis-label result-residual-value" x="414" y="${top + 24}">run baseline e<tspan baseline-shift="sub" font-size="8">j</tspan></text>
              <text class="result-axis-label result-residual-number result-residual-number-baseline" x="414" y="${top + 43}">${formatMetric(baselineErrors[name], { maximumFractionDigits: 6, minimumFractionDigits: 6 })}</text>
              <text class="result-axis-label result-residual-value" x="414" y="${top + 68}">accepted e<tspan baseline-shift="sub" font-size="8">j</tspan></text>
              <text class="result-axis-label result-residual-number" x="414" y="${top + 87}">${formatMetric(errors[name], { maximumFractionDigits: 6, minimumFractionDigits: 6 })}</text>
              <path class="result-primer-grid" d="M${left} ${top + 12} V${base} H${right}" />
              <text class="result-axis-tick" x="${left}" y="${base + 18}">0</text>
              <text class="result-axis-tick" x="${right}" y="${base + 18}">1</text>
              <text class="result-axis-label result-x-axis-title" x="${left + width / 2}" y="${base + 34}">x<tspan baseline-shift="sub" font-size="8">i</tspan></text>
              ${cells}
              <g class="result-residual-baseline-marker">
                <line x1="${mapX(baselineNode).toFixed(1)}" y1="${base}" x2="${mapX(baselineNode).toFixed(1)}" y2="${baselineY.toFixed(1)}" />
                <circle cx="${mapX(baselineNode).toFixed(1)}" cy="${baselineY.toFixed(1)}" r="3.6" />
              </g>
              <path class="result-primer-curve" d="${curve}" />
            </g>`;
  }).join("\n");

  return `<figure class="result-primer-card result-paper-figure" id="fig-7">
          <svg class="result-primer-svg result-residual-location-svg result-paper-chart-svg" viewBox="0 0 560 456" role="img" aria-label="Residual location diagnostics for the run baseline and accepted rule on each public integrand.">
            <defs>
              <pattern id="acceptedResidualHatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(62)">
                <line x1="0" y1="0" x2="0" y2="10" />
              </pattern>
            </defs>
            <text class="result-axis-label result-figure-title" x="${left}" y="34">Residual location diagnostic</text>
            <g class="result-objective-legend" transform="translate(${left} 48)">
              <g transform="translate(0 0)">
                <circle class="result-legend-baseline-dot" cx="0" cy="0" r="3.4" />
                <text x="16" y="4">run baseline sample</text>
              </g>
              <g transform="translate(142 0)">
                <circle class="result-legend-accepted-dot" cx="0" cy="0" r="3.8" />
                <text x="16" y="4">accepted samples</text>
              </g>
              <g transform="translate(282 0)">
                <line class="result-objective-legend-best" x1="0" y1="0" x2="18" y2="0" />
                <text x="26" y="4">integrand curve</text>
              </g>
            </g>
            ${panels}
          </svg>
          <figcaption>Figure 7. Residual location by public integrand. Grey marks the run baseline, blue marks the accepted rule, and hatching shows local accepted-rule residual area.</figcaption>
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
                <path class="result-objective-x-tick" d="M${x.toFixed(1)} ${bottom} V${(bottom + 5).toFixed(1)}" />
                <text class="result-axis-tick" x="${x.toFixed(1)}" y="${bottom + 22}">${value}</text>
              </g>`;
    }).join("\n");
  const proposalDots = scored.map((step) => {
    const x = mapX(step.index ?? 0);
    const y = mapY(step.score);
    return `<circle class="result-objective-proposal" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.1" />`;
  }).join("\n");
  const grid = [0, 200, 400, 600, maxScore]
    .filter((value, index, values) => value <= maxScore && values.indexOf(value) === index)
    .map((value) => {
      const y = mapY(value);
      return `<g>
                <path class="result-objective-grid" d="M${left} ${y.toFixed(1)} H${right}" />
                <text class="result-axis-tick result-objective-y-label" x="${left - 18}" y="${(y + 4).toFixed(1)}">${value}</text>
              </g>`;
    }).join("\n");

  return `<figure class="result-primer-card result-paper-figure result-objective-figure" id="fig-6">
          <svg class="result-primer-svg result-objective-svg" viewBox="0 0 560 328" role="img" aria-label="Best so far objective curve across the curated public trace.">
            <text class="result-axis-label result-figure-title" x="${left}" y="34">Best-so-far acceptance objective (lower is better)</text>
            <g class="result-objective-legend" transform="translate(${left} 48)">
              <g transform="translate(0 0)">
                <circle class="result-objective-legend-proposal" cx="0" cy="0" r="2.4" />
                <text x="12" y="4">scored candidate</text>
              </g>
              <g transform="translate(118 0)">
                <line class="result-objective-legend-best" x1="0" y1="0" x2="16" y2="0" />
                <text x="24" y="4">best-so-far objective</text>
              </g>
              <g transform="translate(286 0)">
                <circle class="result-legend-baseline-dot" cx="0" cy="0" r="3.4" />
                <text x="16" y="4">baseline</text>
              </g>
              <g transform="translate(374 0)">
                <circle class="result-legend-accepted-dot" cx="0" cy="0" r="3.8" />
                <text x="16" y="4">accepted</text>
              </g>
            </g>
            ${grid}
            <path class="result-rule-paper-axis" d="M${left} ${top} V${bottom} H${right}" />
            ${xTicks}
            <text class="result-axis-label result-x-axis-title" x="${left + width / 2}" y="306">candidate index</text>
            <text class="result-axis-label result-objective-y-title" x="34" y="${top + height / 2}" transform="rotate(-90 34 ${top + height / 2})">J(r)</text>
            <g>${proposalDots}</g>
            <path class="result-objective-best" d="${svgPolyline(bestPoints)}" />
            <g class="result-objective-baseline">
              <circle cx="${baselineX.toFixed(1)}" cy="${baselineY.toFixed(1)}" r="4.2" />
            </g>
            <g class="result-objective-accepted">
              <circle cx="${acceptedX.toFixed(1)}" cy="${acceptedY.toFixed(1)}" r="4.8" />
            </g>
          </svg>
          <figcaption>Figure 6. Objective trace for the curated public chain. Faint points are scored candidates, the solid line is retained best-so-far, and rings mark baseline and accepted.</figcaption>
        </figure>`;
}

function paperAssetFigure({ src, caption, number }) {
  return `<figure class="result-paper-asset" id="fig-${number}">
          <img src="./${escapeHtml(src)}" alt="">
          <figcaption>Figure ${number}. ${escapeHtml(caption)}</figcaption>
        </figure>`;
}

function paperInlineFigure({ number, caption, svg, className = "" }) {
  const classes = ["result-primer-card", "result-paper-figure", className].filter(Boolean).join(" ");
  return `<figure class="${classes}" id="fig-${number}">
${svg}
          <figcaption>Figure ${number}. ${escapeHtml(caption)}</figcaption>
        </figure>`;
}

function implementationCodeFigure(candidateCode) {
  return pythonImplementationCodeFigure({
    source: extractCandidateCode(candidateCode),
    caption: "Accepted candidate implementation.",
  });
}

function formatRcpspDisplayCode(candidateCode) {
  const blocks = [...candidateCode.matchAll(/# EVOLVE_START:[^\n]*\n?([\s\S]*?)\n?# EVOLVE_END/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  const source = blocks.length ? blocks.join("\n\n") : extractCandidateCode(candidateCode);
  return source
    .replace(
      "def priority_score(activity: ActivityView, state: ScheduleStateView, instance: InstanceView) -> float:",
      [
        "def priority_score(",
        "    activity: ActivityView,",
        "    state: ScheduleStateView,",
        "    instance: InstanceView,",
        ") -> float:",
      ].join("\n"),
    )
    .replace(
      "unlock_score = activity.successor_work * 0.15 + activity.transitive_successor_count * 1.5",
      [
        "unlock_score = (",
        "        activity.successor_work * 0.15",
        "        + activity.transitive_successor_count * 1.5",
        "    )",
      ].join("\n"),
    )
    .replace(
      "resource_score = activity.bottleneck_ratio * 100.0 + activity.resource_pressure * 10.0",
      [
        "resource_score = (",
        "        activity.bottleneck_ratio * 100.0",
        "        + activity.resource_pressure * 10.0",
        "    )",
      ].join("\n"),
    )
    .replace(
      "return cp_score + unlock_score + resource_score + wait_score + remaining_score - (0.01 * activity.id)",
      [
        "return (",
        "        cp_score",
        "        + unlock_score",
        "        + resource_score",
        "        + wait_score",
        "        + remaining_score",
        "        - (0.01 * activity.id)",
        "    )",
      ].join("\n"),
    )
    .replace(
      "def select_activity(eligible_activities: tuple[EligibleActivityView, ...], instance: InstanceView) -> int:",
      [
        "def select_activity(",
        "    eligible_activities: tuple[EligibleActivityView, ...],",
        "    instance: InstanceView,",
        ") -> int:",
      ].join("\n"),
    )
    .replace(
      "selected = min(eligible_activities, key=lambda item: (item.state.earliest_resource_feasible_start, -item.priority))",
      [
        "selected = min(",
        "        eligible_activities,",
        "        key=lambda item: (",
        "            item.state.earliest_resource_feasible_start,",
        "            -item.priority,",
        "        ),",
        "    )",
      ].join("\n"),
    );
}

function highlightPythonLine(line) {
  const escaped = escapeHtml(line);
  const commentIndex = escaped.indexOf("#");
  const code = commentIndex >= 0 ? escaped.slice(0, commentIndex) : escaped;
  const comment = commentIndex >= 0 ? escaped.slice(commentIndex) : "";
  let html = code.replace(/(&quot;&quot;&quot;.*?&quot;&quot;&quot;)/g, '<span class="py-string">$1</span>');
  html = html.replace(/\b(def|if|for|in|return|lambda)\b/g, '<span class="py-keyword">$1</span>');
  html = html.replace(/\b(False|True|None)\b/g, '<span class="py-constant">$1</span>');
  html = html.replace(/\b(float|int|max|min|list|range|getattr)\b/g, '<span class="py-builtin">$1</span>');
  if (comment) {
    html += `<span class="py-comment">${comment}</span>`;
  }
  return html || " ";
}

function pythonImplementationCodeFigure({ source, caption, className = "" }) {
  const lines = source.trim().split("\n");
  const markup = lines
    .map((line, index) => `<span class="code-line"><span class="line-no">${index + 1}</span><span class="line-src">${highlightPythonLine(line)}</span></span>`)
    .join("");
  const extraClass = className ? ` ${className}` : "";
  return `<figure class="result-paper-code result-code-figure${extraClass}" id="listing-1">
          <pre><code>${markup}</code></pre>
          <figcaption>Listing 1. ${escapeHtml(caption)}</figcaption>
        </figure>`;
}

function rcpspImplementationCodeFigure(candidateCode) {
  return pythonImplementationCodeFigure({
    source: formatRcpspDisplayCode(candidateCode),
    caption: "Accepted candidate implementation, formatted for inspection.",
    className: "rcpsp-code-figure",
  });
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

function rcpspContractTable(evolution) {
  const portfolio = evolution?.portfolio ?? {};
  return paperTable({
    className: "rcpsp-contract-table",
    caption: "Table 1. Frozen PSPLIB J30 benchmark surface.",
    headers: ["Field", "Public contract"],
    rows: [
      ["Dataset", escapeHtml(portfolio.dataset ?? "PSPLIB J30 single-mode RCPSP")],
      ["Portfolio", `${formatMetric(portfolio.portfolio_size ?? 80, { maximumFractionDigits: 0 })} frozen instances`],
      ["Selection", escapeHtml(portfolio.selection_rule ?? "parameters [1, 7, 13, 19, 25, 31, 37, 43] crossed with instances 1..10")],
      ["Reference", `${formatMetric(portfolio.proven_optimal_instances ?? 480, { maximumFractionDigits: 0 })} J30 instances with proven optima in the source set`],
      ["Objective", "<code>mean_gap_pct + 0.35 * p95_gap_pct + feasibility_penalty</code>"],
    ],
  });
}

function rcpspObjectiveSummaryTable(full) {
  return paperTable({
    caption: "Table 2. Reported score comparison across the curated evolutionary chain; lower values are better.",
    headers: ["Metric", "Seed", "Accepted", "Change"],
    rows: [
      [
        "Acceptance score",
        formatMetric(full.metrics.seed, { maximumFractionDigits: 3, minimumFractionDigits: 3 }),
        formatMetric(full.metrics.best, { maximumFractionDigits: 3, minimumFractionDigits: 3 }),
        `-${formatMetric(full.metrics.improvement, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}`,
      ],
      [
        "Relative score change",
        "reference",
        `${formatMetric(full.metrics.improvement_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`,
        `${formatMetric(full.metrics.improvement_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}% reduction`,
      ],
      [
        "Validated schedules",
        "80 / 80 target",
        `${formatMetric(full.metrics.instances_evaluated, { maximumFractionDigits: 0 })} / 80`,
        "100% valid",
      ],
    ],
  });
}

function rcpspWorstTable(evolution) {
  const worst = Array.isArray(evolution?.worst_instances) ? evolution.worst_instances.slice(0, 8) : [];
  return paperTable({
    caption: "Table 3. Largest accepted-candidate gaps kept visible as tail-risk evidence.",
    headers: ["Instance", "Candidate makespan", "Proven optimum", "Gap"],
    rows: worst.map((item) => [
      `<code>${escapeHtml(item.instance_id)}</code>`,
      formatMetric(item.makespan, { maximumFractionDigits: 0 }),
      formatMetric(item.optimal_makespan, { maximumFractionDigits: 0 }),
      `${formatMetric(item.gap_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`,
    ]),
  });
}

function rcpspScheduleFigure() {
  return paperInlineFigure({
    number: 1,
    caption: "RCPSP schedule readout. The standard schedule view combines the precedence network, Gantt placement, and makespan marker.",
    className: "rcpsp-inline-figure rcpsp-schedule-figure",
    svg: `          <svg class="result-primer-svg rcpsp-paper-svg" viewBox="0 0 560 328" role="img" aria-label="RCPSP schedule readout with precedence network and Gantt schedule.">
            <text class="result-axis-label result-figure-title" x="72" y="34">RCPSP schedule readout</text>
            <text class="rcpsp-paper-note" x="72" y="55">Eligible activities are ranked first; the evaluator then commits them to the earliest feasible placement.</text>
            <text class="rcpsp-paper-section-label" x="72" y="82">precedence network</text>
            <g class="rcpsp-network">
              <path d="M112 112H196" />
              <path d="M112 112C148 148 184 156 226 156" />
              <path d="M228 112H338" />
              <path d="M254 156C292 148 318 128 360 112" />
              <path d="M392 112H476" />
              <circle cx="96" cy="112" r="12" /><text x="96" y="116" text-anchor="middle">0</text>
              <circle cx="212" cy="112" r="12" /><text x="212" y="116" text-anchor="middle">A</text>
              <circle cx="242" cy="156" r="12" /><text x="242" y="160" text-anchor="middle">B</text>
              <circle class="rcpsp-emphasis-node" cx="376" cy="112" r="12" /><text x="376" y="116" text-anchor="middle">C</text>
              <circle cx="492" cy="112" r="12" /><text x="492" y="116" text-anchor="middle">T</text>
            </g>
            <text class="rcpsp-paper-note" x="72" y="192">A task becomes eligible only after all predecessor arcs are satisfied.</text>
            <text class="rcpsp-paper-section-label" x="72" y="212">Gantt schedule</text>
            <g class="rcpsp-gantt">
              <path class="result-objective-grid" d="M126 234H512M126 256H512M126 278H512" />
              <path class="result-rule-paper-axis" d="M126 292H512" />
              <text x="72" y="238">row 1</text>
              <text x="72" y="260">row 2</text>
              <text x="72" y="282">row 3</text>
              <rect x="138" y="223" width="60" height="15" rx="2" /><text x="148" y="234">J1</text>
              <rect x="205" y="245" width="104" height="15" rx="2" /><text x="215" y="256">J2</text>
              <rect class="rcpsp-secondary-bar" x="314" y="245" width="118" height="15" rx="2" /><text x="324" y="256">J4</text>
              <rect x="244" y="267" width="136" height="15" rx="2" /><text x="254" y="278">J3</text>
              <rect x="442" y="267" width="58" height="15" rx="2" /><text x="452" y="278">J5</text>
              <line class="rcpsp-marker-line" x1="500" y1="216" x2="500" y2="292" />
              <text class="rcpsp-paper-note" x="507" y="224">Cmax</text>
              <text x="126" y="312">0</text>
              <text x="254" y="312" text-anchor="middle">20</text>
              <text x="382" y="312" text-anchor="middle">40</text>
              <text x="512" y="312" text-anchor="end">60</text>
            </g>
          </svg>`,
  });
}

function rcpspResourceLoadFigure() {
  return paperInlineFigure({
    number: 2,
    caption: "Renewable-resource load profile. The evaluator only accepts placements that keep every active resource demand under the capacity line.",
    className: "rcpsp-inline-figure rcpsp-resource-figure",
    svg: `          <svg class="result-primer-svg rcpsp-paper-svg" viewBox="0 0 560 306" role="img" aria-label="Renewable resource load profile for an RCPSP schedule.">
            <text class="result-axis-label result-figure-title" x="72" y="34">Renewable resource load</text>
            <text class="rcpsp-paper-note" x="72" y="55">A schedule is feasible only while every time bucket stays at or below capacity.</text>
            <g transform="translate(82 74)">
              <path class="result-objective-grid" d="M42 144H430M42 108H430M42 72H430M42 36H430" />
              <path class="result-rule-paper-axis" d="M42 0V174H430" />
              <path class="rcpsp-capacity-line" d="M42 54H430" />
              <text class="rcpsp-paper-section-label" x="408" y="46" text-anchor="end">capacity</text>
              <rect class="rcpsp-load" x="55" y="108" width="36" height="66" />
              <rect class="rcpsp-load" x="101" y="72" width="36" height="102" />
              <rect class="rcpsp-load rcpsp-load-hot" x="147" y="36" width="36" height="138" />
              <rect class="rcpsp-load rcpsp-load-hot" x="193" y="54" width="36" height="120" />
              <rect class="rcpsp-load" x="239" y="72" width="36" height="102" />
              <rect class="rcpsp-load" x="285" y="96" width="36" height="78" />
              <rect class="rcpsp-load" x="331" y="120" width="36" height="54" />
              <rect class="rcpsp-load" x="377" y="132" width="36" height="42" />
              <rect class="rcpsp-load-window" x="143" y="24" width="92" height="150" />
              <text class="result-axis-tick result-objective-y-label" x="30" y="148">0</text>
              <text class="result-axis-tick result-objective-y-label" x="30" y="112">1</text>
              <text class="result-axis-tick result-objective-y-label" x="30" y="76">2</text>
              <text class="result-axis-tick result-objective-y-label" x="30" y="40">3</text>
              <text class="result-axis-tick" x="42" y="196">0</text>
              <text class="result-axis-tick" x="190" y="196">20</text>
              <text class="result-axis-tick" x="337" y="196">40</text>
              <text class="result-axis-tick" x="430" y="196">60</text>
              <text class="result-axis-label result-x-axis-title" x="236" y="226">time bucket</text>
              <text class="result-axis-label result-objective-y-title" x="0" y="87" transform="rotate(-90 0 87)">active demand</text>
              <text class="rcpsp-paper-note" x="42" y="258">The fixed evaluator rejects any placement that crosses the capacity line.</text>
            </g>
          </svg>`,
  });
}

function rcpspObjectiveCurveFigure(scoreTrace) {
  const trace = scoreTrace || {};
  const candidates = Array.isArray(trace.candidates) ? trace.candidates : [];
  const bestByGeneration = Array.isArray(trace.best_by_generation) ? trace.best_by_generation : [];
  const generationEnd = trace.generation_end ?? 119;
  const scoreMin = 12;
  const scoreMax = trace.display_score_cap ?? 16;
  const left = 82;
  const right = 512;
  const top = 76;
  const bottom = 252;
  const plotW = right - left;
  const plotH = bottom - top;
  const xAt = (generation) => left + (Math.max(0, Math.min(generationEnd, generation)) / Math.max(1, generationEnd)) * plotW;
  const yAt = (score) => {
    const visibleScore = Math.max(scoreMin, Math.min(scoreMax, score));
    return bottom - ((visibleScore - scoreMin) / (scoreMax - scoreMin)) * plotH;
  };
  const scoreLabel = (score) => (score >= scoreMax ? `${scoreMax}+` : formatMetric(score, { maximumFractionDigits: 0 }));
  const candidateDots = candidates
    .map((candidate) => {
      const generation = candidate.generation ?? 0;
      const score = candidate.score ?? scoreMax;
      return `<circle class="result-objective-proposal${score > scoreMax ? " is-clipped" : ""}" cx="${xAt(generation).toFixed(1)}" cy="${yAt(score).toFixed(1)}" r="1.6" />`;
    })
    .join("\n              ");
  const fallbackBest = [
    { generation: 0, score: trace.seed_score ?? 14.312164873860446 },
    { generation: 2, score: 13.74111742413817 },
    { generation: 5, score: 13.404 },
    { generation: 19, score: 12.988 },
    { generation: 61, score: 12.855 },
    { generation: 89, score: 12.24 },
    { generation: 119, score: trace.accepted_score ?? 12.086633114086395 },
  ];
  const bestPoints = bestByGeneration.length ? bestByGeneration : fallbackBest;
  const bestPath = bestPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xAt(point.generation ?? index).toFixed(1)} ${yAt(point.score).toFixed(1)}`)
    .join(" ");
  const baselineScore = trace.seed_score ?? 14.312164873860446;
  const acceptedScore = trace.accepted_score ?? 12.086633114086395;
  const yTicks = [scoreMax, 14, 12]
    .map((tick) => {
      const y = yAt(tick);
      return `<path class="result-objective-grid" d="M${left} ${y.toFixed(1)}H${right}" /><text class="result-axis-tick result-objective-y-label" x="${left - 14}" y="${(y + 4).toFixed(1)}">${scoreLabel(tick)}</text>`;
    })
    .join("\n            ");
  const xTicks = [0, 40, 80, generationEnd]
    .map((generation, index, all) => {
      const x = xAt(generation);
      const anchor = index === 0 ? "" : index === all.length - 1 ? ' text-anchor="end"' : ' text-anchor="middle"';
      return `<text class="result-axis-tick" x="${x.toFixed(1)}" y="282"${anchor}>${formatMetric(generation, { maximumFractionDigits: 0 })}</text>`;
    })
    .join("\n            ");
  return paperInlineFigure({
    number: 3,
    caption: "Best-so-far score across the curated evolutionary chain, rendered in the same paper style as the quadrature objective trace. Faint points are scored candidates from the sanitized public trace; scores above 16 are clipped at the top of the plotting area.",
    className: "rcpsp-inline-figure result-objective-figure",
    svg: `          <svg class="result-primer-svg result-objective-svg rcpsp-paper-svg" viewBox="0 0 560 328" role="img" aria-label="Best-so-far RCPSP acceptance objective.">
            <text class="result-axis-label result-figure-title" x="82" y="34">Best-so-far acceptance objective (lower is better)</text>
            <g class="result-objective-legend" transform="translate(82 48)">
              <g transform="translate(0 0)"><circle class="result-objective-legend-proposal" cx="0" cy="0" r="2.4" /><text x="12" y="4">scored candidate</text></g>
              <g transform="translate(112 0)"><line class="result-objective-legend-best" x1="0" y1="0" x2="16" y2="0" /><text x="24" y="4">best-so-far objective</text></g>
              <g transform="translate(286 0)"><circle class="result-legend-baseline-dot" cx="0" cy="0" r="3.4" /><text x="16" y="4">baseline</text></g>
              <g transform="translate(370 0)"><circle class="result-legend-accepted-dot" cx="0" cy="0" r="3.8" /><text x="16" y="4">accepted</text></g>
            </g>
            ${yTicks}
            <path class="result-rule-paper-axis" d="M${left} ${top}V${bottom}H${right}" />
            <g>
              ${candidateDots}
            </g>
            <path class="result-objective-best" d="${bestPath}" />
            <g class="result-objective-baseline"><circle cx="${xAt(0).toFixed(1)}" cy="${yAt(baselineScore).toFixed(1)}" r="4.2" /></g>
            <g class="result-objective-accepted"><circle cx="${xAt(generationEnd).toFixed(1)}" cy="${yAt(acceptedScore).toFixed(1)}" r="4.8" /></g>
            ${xTicks}
            <text class="result-axis-label result-x-axis-title" x="${(left + plotW / 2).toFixed(1)}" y="306">generation <tspan font-style="italic">k</tspan></text>
            <text class="result-axis-label result-objective-y-title" x="34" y="${(top + plotH / 2).toFixed(1)}" transform="rotate(-90 34 ${(top + plotH / 2).toFixed(1)})"><tspan font-style="italic">J</tspan><tspan>(</tspan><tspan font-style="italic">r</tspan><tspan>)</tspan></text>
          </svg>`,
  });
}

function rcpspBenchmarkComparisonFigure(full) {
  const { seed, best, improvement_pct } = full.metrics;
  const scoreTrackX = 48;
  const scoreTrackWidth = 440;
  const seedWidth = (seed / 15) * scoreTrackWidth;
  const bestWidth = (best / 15) * scoreTrackWidth;
  const seedX = scoreTrackX + seedWidth;
  const bestX = scoreTrackX + bestWidth;
  const reductionMidX = (seedX + bestX) / 2;
  return paperInlineFigure({
    number: 4,
    caption: "Seed versus accepted acceptance-score readout; lower values are better.",
    className: "rcpsp-inline-figure rcpsp-benchmark-figure",
    svg: `          <svg class="result-primer-svg rcpsp-paper-svg" viewBox="0 0 560 220" role="img" aria-label="Seed versus accepted RCPSP acceptance score readout.">
            <text class="result-axis-label result-figure-title" x="48" y="34">Acceptance objective</text>
            <text class="rcpsp-paper-note" x="512" y="34" text-anchor="end">lower is better</text>
            <g class="rcpsp-score-readout">
              <path class="rcpsp-reduction-bracket" d="M${bestX.toFixed(1)} 64H${seedX.toFixed(1)}M${bestX.toFixed(1)} 59V69M${seedX.toFixed(1)} 59V69" />
              <text class="rcpsp-paper-note rcpsp-delta-text" x="${reductionMidX.toFixed(1)}" y="55" text-anchor="middle">${formatMetric(improvement_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}% reduction</text>
              <rect class="rcpsp-track" x="${scoreTrackX}" y="88" width="${scoreTrackWidth}" height="28" />
              <rect class="rcpsp-reference-fill" x="${scoreTrackX}" y="88" width="${seedWidth.toFixed(1)}" height="28" />
              <rect class="rcpsp-accent-fill" x="${scoreTrackX}" y="88" width="${bestWidth.toFixed(1)}" height="28" />
              <line class="rcpsp-marker-line" x1="${seedX.toFixed(1)}" y1="78" x2="${seedX.toFixed(1)}" y2="126" />
              <line class="rcpsp-marker-line rcpsp-accepted-marker" x1="${bestX.toFixed(1)}" y1="78" x2="${bestX.toFixed(1)}" y2="126" />
              <text class="rcpsp-paper-note" x="512" y="92" text-anchor="end">seed</text>
              <text class="rcpsp-paper-value" x="512" y="110" text-anchor="end">${formatMetric(seed, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</text>
              <text class="rcpsp-paper-note" x="${bestX.toFixed(1)}" y="140" text-anchor="middle">accepted</text>
              <text class="rcpsp-paper-value" x="${bestX.toFixed(1)}" y="158" text-anchor="middle">${formatMetric(best, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</text>
              <path class="result-rule-paper-axis" d="M${scoreTrackX} 176H${scoreTrackX + scoreTrackWidth}" />
              <text class="result-axis-tick" x="${scoreTrackX}" y="196">0</text>
              <text class="result-axis-tick" x="${(scoreTrackX + scoreTrackWidth / 2).toFixed(1)}" y="196" text-anchor="middle">7.5</text>
              <text class="result-axis-tick" x="${(scoreTrackX + scoreTrackWidth).toFixed(1)}" y="196" text-anchor="middle">15</text>
            </g>
          </svg>`,
  });
}

function rcpspScheduleCompressionFigure(scheduleExample) {
  const example = scheduleExample && Array.isArray(scheduleExample.jobs) ? scheduleExample : null;
  if (!example) {
    return paperInlineFigure({
      number: 5,
      caption: "Real schedule-compression readout unavailable.",
      className: "rcpsp-inline-figure rcpsp-compression-figure",
      svg: `          <svg class="result-primer-svg rcpsp-paper-svg" viewBox="0 0 560 160" role="img" aria-label="RCPSP schedule example unavailable.">
            <text class="result-axis-label result-figure-title" x="60" y="48">Schedule example unavailable</text>
          </svg>`,
    });
  }

  const executableJobs = example.jobs.filter((job) => !job.is_dummy && job.duration > 0);
  const axisStart = example.time_axis?.start ?? 0;
  const axisEnd = example.time_axis?.end ?? Math.max(example.seed_makespan ?? 0, example.accepted_makespan ?? 0);
  const left = 78;
  const right = 500;
  const width = right - left;
  const timeX = (time) => left + ((time - axisStart) / (axisEnd - axisStart)) * width;
  const xTicks = [axisStart, 30, 60, 90, axisEnd]
    .filter((tick, index, all) => tick >= axisStart && tick <= axisEnd && all.indexOf(tick) === index);
  const rows = [];
  const plottedJobs = [...executableJobs]
    .sort((a, b) => (a.accepted_start - b.accepted_start) || (a.id - b.id))
    .map((job) => {
      const spanStart = Math.min(job.seed_start, job.accepted_start);
      const spanEnd = Math.max(job.seed_finish, job.accepted_finish);
      let row = rows.findIndex((end) => spanStart >= end + 2);
      if (row < 0) {
        row = rows.length;
        rows.push(spanEnd);
      } else {
        rows[row] = spanEnd;
      }
      return { ...job, row };
    });
  const rowHeight = 14;
  const ganttTop = 98;
  const laneLines = rows
    .map((_end, index) => {
      const y = ganttTop + index * rowHeight + 13;
      return `M${left} ${y}H${right}`;
    })
    .join("");
  const jobBars = plottedJobs.map((job) => {
    const y = ganttTop + job.row * rowHeight;
    const seedX = timeX(job.seed_start);
    const acceptedX = timeX(job.accepted_start);
    const seedW = Math.max(3, timeX(job.seed_finish) - seedX);
    const acceptedW = Math.max(3, timeX(job.accepted_finish) - acceptedX);
    return `<g>
              <rect class="rcpsp-gantt-seed" x="${seedX.toFixed(1)}" y="${(y + 4).toFixed(1)}" width="${seedW.toFixed(1)}" height="6" />
              <rect class="rcpsp-gantt-accepted" x="${acceptedX.toFixed(1)}" y="${y.toFixed(1)}" width="${acceptedW.toFixed(1)}" height="8" />
            </g>`;
  }).join("\n");
  const axisY = ganttTop + rows.length * rowHeight + 20;
  const acceptedX = timeX(example.accepted_makespan);
  const seedX = timeX(example.seed_makespan);

  const loadLeft = 78;
  const loadRight = 500;
  const loadTop = axisY + 66;
  const loadBase = loadTop + 78;
  const loadWidth = loadRight - loadLeft;
  const capacity = example.resource_capacity || 1;
  const visibleBuckets = example.resource_load_buckets.filter((bucket) => (
    bucket.end > axisStart && bucket.start < axisEnd
  ));
  const loadY = (value) => loadBase - (value / capacity) * (loadBase - loadTop);
  const resourceBars = visibleBuckets.map((bucket) => {
    const x = timeX(Math.max(bucket.start, axisStart)) + 3;
    const barW = Math.max(3, timeX(Math.min(bucket.end, axisEnd)) - timeX(Math.max(bucket.start, axisStart)) - 6);
    const acceptedY = loadY(bucket.accepted);
    const seedY = loadY(bucket.seed);
    return `<g>
              <rect class="rcpsp-load" x="${x.toFixed(1)}" y="${acceptedY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(loadBase - acceptedY).toFixed(1)}" />
              <rect class="rcpsp-load-seed" x="${x.toFixed(1)}" y="${seedY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(loadBase - seedY).toFixed(1)}" />
            </g>`;
  }).join("\n");

  return paperInlineFigure({
    number: 5,
    caption: `Real schedule-compression readout for PSPLIB J30 instance ${escapeHtml(example.instance_id)}. All executable jobs are rendered as unlabeled bars; seed finishes at ${formatMetric(example.seed_makespan, { maximumFractionDigits: 0 })}, accepted at ${formatMetric(example.accepted_makespan, { maximumFractionDigits: 0 })}, and the proven optimum is ${formatMetric(example.optimal_makespan, { maximumFractionDigits: 0 })}.`,
    className: "rcpsp-inline-figure rcpsp-compression-figure",
    svg: `          <svg class="result-primer-svg rcpsp-paper-svg" viewBox="0 0 560 438" role="img" aria-label="Real RCPSP schedule compression and renewable resource load readout for ${escapeHtml(example.instance_id)}.">
            <text class="result-axis-label result-figure-title" x="60" y="34">Schedule compression</text>
            <g class="result-objective-legend" transform="translate(60 64)">
              <g><rect class="rcpsp-gantt-seed" x="0" y="-8" width="16" height="8" /><text x="24" y="0">seed</text></g>
              <g transform="translate(94 0)"><rect class="rcpsp-accent-fill" x="0" y="-8" width="16" height="8" /><text x="24" y="0">accepted</text></g>
              <g transform="translate(238 0)"><line class="rcpsp-capacity-line" x1="0" y1="-4" x2="28" y2="-4" /><text x="36" y="0">capacity</text></g>
            </g>
            <g class="rcpsp-gantt">
              <text class="rcpsp-paper-section-label" x="60" y="88">all executable jobs (${formatMetric(example.executable_job_count ?? executableJobs.length, { maximumFractionDigits: 0 })} bars; ${formatMetric(example.job_count, { maximumFractionDigits: 0 })} including source/sink)</text>
              <path class="result-objective-grid" d="${laneLines}" />
${jobBars}
              <line class="rcpsp-marker-line rcpsp-accepted-marker" x1="${acceptedX.toFixed(1)}" y1="${(ganttTop - 10).toFixed(1)}" x2="${acceptedX.toFixed(1)}" y2="${(axisY - 4).toFixed(1)}" />
              <line class="rcpsp-marker-line" x1="${seedX.toFixed(1)}" y1="${(ganttTop - 10).toFixed(1)}" x2="${seedX.toFixed(1)}" y2="${(axisY - 4).toFixed(1)}" />
              <path class="result-rule-paper-axis" d="M${left} ${axisY}H${right}" />
              ${xTicks.map((tick, index) => `<text class="result-axis-tick" x="${timeX(tick).toFixed(1)}" y="${axisY + 20}" ${index === 0 ? "" : index === xTicks.length - 1 ? 'text-anchor="end"' : 'text-anchor="middle"'}>${formatMetric(tick, { maximumFractionDigits: 0 })}</text>`).join("\n              ")}
              <text class="rcpsp-paper-note" x="${acceptedX.toFixed(1)}" y="${axisY + 38}" text-anchor="middle">accepted Cmax</text>
              <text class="rcpsp-paper-note" x="${seedX.toFixed(1)}" y="${axisY + 38}" text-anchor="middle">seed Cmax</text>
            </g>
            <g>
              <text class="rcpsp-paper-section-label" x="60" y="${loadTop - 20}">Resource ${formatMetric((example.resource_index ?? 0) + 1, { maximumFractionDigits: 0 })} full-instance load</text>
              <path class="result-rule-paper-axis" d="M${loadLeft} ${loadTop}V${loadBase}H${loadRight}" />
              <path class="result-objective-grid" d="M${loadLeft} ${loadTop}H${loadRight}" />
              <path class="rcpsp-capacity-line" d="M${loadLeft} ${loadTop}H${loadRight}" />
              <text class="rcpsp-paper-note" x="${loadRight}" y="${loadTop - 8}" text-anchor="end">capacity ${formatMetric(capacity, { maximumFractionDigits: 0 })}</text>
${resourceBars}
              <text class="result-axis-tick" x="${loadLeft - 10}" y="${loadBase + 3}" text-anchor="end">0</text>
              <text class="result-axis-tick" x="${loadLeft - 10}" y="${loadTop + 3}" text-anchor="end">cap</text>
              <text class="result-axis-tick" x="${loadLeft}" y="${loadBase + 20}">${formatMetric(axisStart, { maximumFractionDigits: 0 })}</text>
              <text class="result-axis-tick" x="${(loadLeft + loadRight) / 2}" y="${loadBase + 20}" text-anchor="middle">time</text>
              <text class="result-axis-tick" x="${loadRight}" y="${loadBase + 20}" text-anchor="end">${formatMetric(axisEnd, { maximumFractionDigits: 0 })}</text>
              <text class="result-axis-label result-objective-y-title" x="28" y="${(loadTop + loadBase) / 2}" transform="rotate(-90 28 ${(loadTop + loadBase) / 2})">demand</text>
            </g>
          </svg>`,
  });
}

function rcpspGapSummaryFigure(full) {
  const exactOptima = Math.round(full.metrics.optimal_hit_rate * 80);
  const metrics = [
    { label: "Mean gap", value: full.metrics.mean_gap_pct, width: Math.min(320, full.metrics.mean_gap_pct * 12.8), cls: "rcpsp-accent-fill", display: `${formatMetric(full.metrics.mean_gap_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%` },
    { label: "p95 gap", value: full.metrics.p95_gap_pct, width: Math.min(320, full.metrics.p95_gap_pct * 12.8), cls: "rcpsp-accent-fill", display: `${formatMetric(full.metrics.p95_gap_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%` },
    { label: "Max gap", value: full.metrics.max_gap_pct, width: Math.min(320, full.metrics.max_gap_pct * 12.8), cls: "rcpsp-accent-fill", display: `${formatMetric(full.metrics.max_gap_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%` },
    { label: "Exact optima", value: full.metrics.optimal_hit_rate * 100, width: full.metrics.optimal_hit_rate * 320, cls: "rcpsp-accent-fill", display: `${exactOptima} / 80` },
  ];
  const rows = metrics.map((metric, index) => {
    const y = 76 + index * 44;
    return `<g>
              <text class="rcpsp-paper-section-label" x="72" y="${y}">${metric.label}</text>
              <rect class="rcpsp-track" x="172" y="${y - 11}" width="320" height="12" />
              <rect class="${metric.cls}" x="172" y="${y - 11}" width="${metric.width.toFixed(1)}" height="12" />
              <text class="rcpsp-paper-value" x="512" y="${y}" text-anchor="end">${metric.display}</text>
            </g>`;
  }).join("\n");
  return paperInlineFigure({
    number: 6,
    caption: "Accepted candidate diagnostics on the frozen 80-instance portfolio.",
    className: "rcpsp-inline-figure rcpsp-gap-figure",
    svg: `          <svg class="result-primer-svg rcpsp-paper-svg" viewBox="0 0 560 280" role="img" aria-label="Accepted RCPSP gap diagnostics.">
            <text class="result-axis-label result-figure-title" x="72" y="34">Accepted candidate diagnostics</text>
            <text class="rcpsp-paper-note" x="488" y="34" text-anchor="end">80 frozen PSPLIB J30 instances</text>
${rows}
            <text class="rcpsp-paper-note" x="72" y="252">Feasibility penalty: 0.000 | invalid priority count: 0 | schedules validated: 80 / 80</text>
          </svg>`,
  });
}

function rcpspTailLadderFigure(evolution) {
  const worst = Array.isArray(evolution?.worst_instances) ? evolution.worst_instances.slice(0, 8) : [];
  const maxGap = Math.max(24, ...worst.map((item) => item.gap_pct ?? 0));
  const bars = worst.map((item, index) => {
    const y = 74 + index * 23;
    const width = ((item.gap_pct ?? 0) / maxGap) * 300;
    return `<g>
              <text class="rcpsp-paper-section-label" x="72" y="${y}">${escapeHtml(item.instance_id)}</text>
              <rect class="rcpsp-accent-fill" x="170" y="${y - 12}" width="${width.toFixed(1)}" height="13" />
              <text class="rcpsp-paper-value" x="${(180 + width).toFixed(1)}" y="${y}">${formatMetric(item.gap_pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}% | ${formatMetric(item.makespan, { maximumFractionDigits: 0 })} vs ${formatMetric(item.optimal_makespan, { maximumFractionDigits: 0 })}</text>
            </g>`;
  }).join("\n");
  return paperInlineFigure({
    number: 7,
    caption: "Worst-instance tail behavior for the accepted candidate. Each bar shows residual gap against the proven optimum.",
    className: "rcpsp-inline-figure rcpsp-tail-figure",
    svg: `          <svg class="result-primer-svg rcpsp-paper-svg" viewBox="0 0 560 328" role="img" aria-label="Worst accepted RCPSP gaps.">
            <text class="result-axis-label result-figure-title" x="72" y="34">Tail behavior kept visible</text>
            <text class="rcpsp-paper-note" x="488" y="34" text-anchor="end">largest accepted-candidate gaps</text>
            <path class="result-rule-paper-axis" d="M170 50V250H512" />
            <path class="result-objective-grid" d="M270 50V250M370 50V250M470 50V250" />
${bars}
            <text class="result-axis-tick" x="170" y="276">0%</text>
            <text class="result-axis-tick" x="270" y="276">8%</text>
            <text class="result-axis-tick" x="370" y="276">16%</text>
            <text class="result-axis-tick" x="470" y="276">24%</text>
            <text class="rcpsp-paper-note" x="72" y="306">Worst residual gaps remain part of the public result definition.</text>
          </svg>`,
  });
}

function rcpspWhitepaperInserts(full, evolution, candidateCode, scheduleExample, scoreTrace) {
  return {
    "rcpsp-primer": rcpspScheduleFigure(),
    "resource-load": rcpspResourceLoadFigure(),
    "contract-table": rcpspContractTable(evolution),
    "implementation-code": rcpspImplementationCodeFigure(candidateCode),
    "objective-curve": rcpspObjectiveCurveFigure(scoreTrace),
    "benchmark-comparison": rcpspBenchmarkComparisonFigure(full),
    "schedule-compression": rcpspScheduleCompressionFigure(scheduleExample),
    "objective-summary-table": rcpspObjectiveSummaryTable(full),
    "gap-summary": rcpspGapSummaryFigure(full),
    "tail-ladder": rcpspTailLadderFigure(evolution),
    "worst-table": rcpspWorstTable(evolution),
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
      return `<div class="result-node" style="--x: ${x.toFixed(3)}%; --bar: ${bar.toFixed(3)}rem;">
              <span class="result-node-pin" aria-hidden="true"></span>
              <span class="result-node-label">${formatMetric(node, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</span>
              <span class="result-node-weight">${formatMetric(weight, { maximumFractionDigits: 3, minimumFractionDigits: 3 })}</span>
            </div>`;
    })
    .join("\n");

  return `<section class="result-rule-visual" aria-label="Accepted quadrature rule visual">
          <div class="result-rule-copy">
            <p class="eyebrow">Accepted rule</p>
            <h2>Accepted five-node rule.</h2>
            <p>The final candidate is not a black-box policy. It is a compact rule on the unit interval, with two nodes pulled in from the endpoints, a midpoint node, symmetric interior support, and near-uniform weights.</p>
          </div>
          <div class="result-rule-panel">
            <div class="result-rule-axis" aria-hidden="true">
              <span class="result-axis-end result-axis-start">0</span>
              <span class="result-axis-line"></span>
              <span class="result-axis-end result-axis-finish">1</span>
${nodes}
            </div>
            <div class="result-rule-summary">
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
    ? `<div class="result-table-wrap">
          <table class="result-table">
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
    ? `<div class="result-table-wrap">
          <table class="result-table">
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

  return `<section class="result-evidence" aria-label="Result evidence">
          <div class="result-evidence-heading">
            <p class="eyebrow">Evidence</p>
            <h2>Acceptance score and observable behavior.</h2>
            ${scoreNote ? `<p>${escapeHtml(scoreNote)}</p>` : ""}
          </div>
          <div class="result-metric-grid">
${stats
  .map(
    ([label, value]) => `            <div class="result-metric-card">
              <span>${escapeHtml(label)}</span>
              <strong>${value}</strong>
            </div>`,
  )
  .join("\n")}
          </div>
          ${
            panels.length
              ? `<div class="result-data-grid result-data-grid-${panels.length}">
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
  const scheduleExample = full.artifacts?.schedule_example
    ? JSON.parse(await fs.readFile(path.join(resultRoot, full.artifacts.schedule_example), "utf8"))
    : null;
  const scoreTrace = full.artifacts?.score_trace
    ? JSON.parse(await fs.readFile(path.join(resultRoot, full.artifacts.score_trace), "utf8"))
    : null;
  const plots = full.artifacts?.plots ?? [];
  for (const file of [
    full.artifacts?.candidate_code,
    full.artifacts?.evolution_trace,
    full.artifacts?.metrics,
    full.artifacts?.provenance,
    full.artifacts?.replay,
    full.artifacts?.schedule_example,
    full.artifacts?.score_trace,
    full.evaluation_contract?.artifact,
    ...plots,
  ].filter(Boolean)) {
    await copyIfExists(resultRoot, outputRoot, file);
  }
  await copyDirectoryIfExists(path.join(resultRoot, "run"), path.join(outputRoot, "run"));
  await alignCopiedRunShell(outputRoot);

  const figures = plots
    .map(
      (plot) => `<figure class="result-figure">
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
  const isRcpspWhitepaper = full.slug === "rcpsp-psplib-j30";
  const body = isQuadratureWhitepaper
    ? `        <section class="hero compact-hero page-hero result-detail-hero">
          <h1 class="page-title">${escapeHtml(full.title)}</h1>
          <p class="intro results-hero-intro">${escapeHtml(full.summary)}</p>
        </section>

        <section class="result-detail result-whitepaper-shell">
          <article class="result-article result-whitepaper">
${markdownToHtml(articleWithoutTitle(article), quadratureWhitepaperInserts(full, evolution, candidateCode))}
          </article>
        </section>`
    : isRcpspWhitepaper
      ? `        <section class="hero compact-hero page-hero result-detail-hero rcpsp-detail-hero">
          <h1 class="page-title">${escapeHtml(full.title)}</h1>
          <p class="intro results-hero-intro">${escapeHtml(full.summary)}</p>
        </section>

        <section class="result-detail result-whitepaper-shell rcpsp-whitepaper-shell">
          <article class="result-article result-whitepaper rcpsp-whitepaper">
${markdownToHtml(articleWithoutTitle(article), rcpspWhitepaperInserts(full, evolution, candidateCode, scheduleExample, scoreTrace))}
          </article>
        </section>`
    : `        <section class="hero compact-hero page-hero result-detail-hero">
          <p class="eyebrow">${escapeHtml(full.domain)}</p>
          <h1 class="page-title">${escapeHtml(full.title)}</h1>
          <p class="intro results-hero-intro">${escapeHtml(full.summary)}</p>
        </section>

        <section class="result-detail">
          <article class="result-article">
${markdownToHtml(articleWithoutTitle(article), quadratureProblemVisuals(full, evolution))}
          </article>
        </section>

        ${acceptedRuleVisual(full, evolution)}

        ${resultSnapshot(full, evolution)}

        <section class="result-assets" aria-label="Public result figures">
${figures}
        </section>

        ${resultEvidence(full, evolution)}

        <section class="result-code" aria-label="Accepted candidate code">
          <div class="result-code-heading">
            <p class="eyebrow">Accepted implementation</p>
            <h2>Replayable candidate code.</h2>
          </div>
          <pre><code>${escapeHtml(extractCandidateCode(candidateCode))}</code></pre>
        </section>`;

  await fs.writeFile(
    path.join(outputRoot, "index.html"),
    htmlShell({
      title: `${full.title} | Results | Göther Labs`,
      description: full.summary,
      canonicalPath: `/results/${full.slug}/`,
      cssPrefix: "../../",
      body,
      enableMath: /\$\$|\\\(|\\\[/.test(article),
      bodyClass: isQuadratureWhitepaper
        ? "result-quadrature-page"
        : isRcpspWhitepaper
          ? "result-rcpsp-page"
          : "",
    }),
    "utf8",
  );
}

async function writeSitemap(results) {
  const urls = [
    "/",
    "/company/",
    "/results/",
    ...results.map((result) => `/results/${result.slug}/`),
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
  const results = (
    await Promise.all(
      catalog.results
        .filter((result) => result.status === "published")
        .map(async (result) => {
          if (!result.path) return result;
          return JSON.parse(await fs.readFile(path.join(RESULTS_ROOT, result.path), "utf8"));
        }),
    )
  ).sort((a, b) => (a.website?.order ?? 999) - (b.website?.order ?? 999));

  await fs.mkdir(OUT_ROOT, { recursive: true });
  await writeIndex(results);
  for (const result of results) {
    await writeDetail(result);
  }
  await writeSitemap(results);
  console.log(`Synced ${results.length} result(s) from ${path.relative(SITE_ROOT, RESULTS_ROOT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
