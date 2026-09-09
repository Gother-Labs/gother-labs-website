#!/usr/bin/env node
import fs from "node:fs/promises";

const RESULTS_SHA = "9fb50452bc7ee815339f5cf20f9df501591b2d30";

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

const lockPath = "tools/generated-results.lock.json";
const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
lock.commit = RESULTS_SHA;
await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

const syncPath = "tools/sync-results.mjs";
let sync = await fs.readFile(syncPath, "utf8");

const tableNeedle = `  html = html
    .replace(
      '<table class="rtl-data-table">\\n  <thead><tr><th>Case</th><th>Structural change</th><th>Correctness boundary</th><th>Case-local composite</th></tr></thead>',
      '<table class="rtl-data-table rtl-table--regimes">\\n  <thead><tr><th>Case</th><th>Structural change</th><th>Correctness boundary</th><th>Case-local composite</th></tr></thead>',
    )
    .replaceAll(`;
const tableReplacement = `  html = html
    .replace(
      '<table class="rtl-data-table">\\n  <thead><tr><th>Dimension</th><th>Current public measurement</th><th>What it does not mean</th></tr></thead>',
      '<table class="rtl-data-table rtl-table--ppa-definition">\\n  <thead><tr><th>Dimension</th><th>Current public measurement</th><th>What it does not mean</th></tr></thead>',
    )
    .replace(
      '<table class="rtl-data-table">\\n  <thead><tr><th>Case</th><th>Structural change</th><th>Correctness boundary</th><th>Case-local composite</th></tr></thead>',
      '<table class="rtl-data-table rtl-table--regimes">\\n  <thead><tr><th>Case</th><th>Structural change</th><th>Correctness boundary</th><th>Case-local composite</th></tr></thead>',
    )
    .replaceAll(`;
sync = replaceOnce(sync, tableNeedle, tableReplacement, "PPA definition table classification");

const oldHeadings = `  const headings = [
    ["Abstract", "rtl-abstract"],
    ["1. Three transformation regimes", "rtl-regimes"],
    ["2. Common evaluation methodology", "rtl-method"],
    ["3. SHA-1 RTL — Boolean simplification", "rtl-sha1"],
    ["4. INT8 MatVec RTL — Arithmetic restructuring", "rtl-matvec"],
    ["5. ML-KEM CBD RTL — State representation", "rtl-mlkem"],
    ["6. Portfolio readout", "rtl-portfolio"],
    ["7. What the portfolio establishes", "rtl-boundary"],
    ["8. Evidence and assurance status", "rtl-assurance"],
    ["9. Reproducibility and authority", "rtl-repro"],
  ];`;
const newHeadings = `  const headings = [
    ["Abstract", "rtl-abstract"],
    ["1. Why RTL optimization matters", "rtl-why"],
    ["2. Three transformation regimes", "rtl-regimes"],
    ["3. Common evaluation methodology", "rtl-method"],
    ["4. SHA-1 RTL — Boolean simplification", "rtl-sha1"],
    ["5. INT8 MatVec RTL — Arithmetic restructuring", "rtl-matvec"],
    ["6. ML-KEM CBD RTL — State representation", "rtl-mlkem"],
    ["7. Portfolio readout", "rtl-portfolio"],
    ["8. What the portfolio establishes", "rtl-boundary"],
    ["9. Evidence and assurance status", "rtl-assurance"],
    ["10. Reproducibility and authority", "rtl-repro"],
  ];`;
sync = replaceOnce(sync, oldHeadings, newHeadings, "RTL section heading identities");

const oldSubheadings = `  html = html
    .replaceAll("<h3>Correctness gate</h3>", '<h3 class="rtl-correctness-heading">Correctness gate</h3>')
    .replaceAll("<h3>Paired result</h3>", '<h3 class="rtl-paired-heading">Paired result</h3>');`;
const newSubheadings = `  html = html
    .replaceAll("<h3>Correctness gate</h3>", '<h3 class="rtl-correctness-heading">Correctness gate</h3>')
    .replaceAll("<h3>Paired result</h3>", '<h3 class="rtl-paired-heading">Paired result</h3>')
    .replace("<h3>Evidence-scale warning</h3>", '<h3 class="rtl-maturity-heading">Evidence-scale warning</h3>');`;
sync = replaceOnce(sync, oldSubheadings, newSubheadings, "RTL maturity subheading");

const oldToc = `  const toc = [
    '<nav class="rtl-result-toc" aria-label="On this page">',
    '  <a href="#rtl-regimes">Regimes</a>',
    '  <a href="#rtl-method">Method</a>',
    '  <a href="#rtl-sha1">SHA-1</a>',
    '  <a href="#rtl-matvec">INT8 MatVec</a>',
    '  <a href="#rtl-mlkem">ML-KEM CBD</a>',
    '  <a href="#rtl-portfolio">Portfolio</a>',
    '  <a href="#rtl-assurance">Assurance</a>',
    '  <a href="#rtl-repro">Reproduce</a>',
    '</nav>',
  ].join("\\n");
  html = html.replace(
    '<h2 id="rtl-regimes">1. Three transformation regimes</h2>',
    toc + '\\n<h2 id="rtl-regimes">1. Three transformation regimes</h2>',
  );

  return html;`;
const newToc = `  const toc = [
    '<nav class="rtl-result-toc" aria-label="On this page">',
    '  <a href="#rtl-why">RTL & PPA</a>',
    '  <a href="#rtl-regimes">Regimes</a>',
    '  <a href="#rtl-method">Method</a>',
    '  <a href="#rtl-sha1">SHA-1</a>',
    '  <a href="#rtl-matvec">INT8 MatVec</a>',
    '  <a href="#rtl-mlkem">ML-KEM CBD</a>',
    '  <a href="#rtl-portfolio">Portfolio</a>',
    '  <a href="#rtl-assurance">Assurance</a>',
    '  <a href="#rtl-repro">Reproduce</a>',
    '</nav>',
  ].join("\\n");
  html = html.replace(
    '<h2 id="rtl-why">1. Why RTL optimization matters</h2>',
    toc + '\\n<h2 id="rtl-why">1. Why RTL optimization matters</h2>',
  );

  html = html.replace(
    /<h3 class="rtl-maturity-heading">Evidence-scale warning<\\/h3>([\\s\\S]*?)(?=<h2 id="rtl-regimes">)/,
    '<section class="rtl-maturity-warning" aria-label="Current public evidence scale"><h3 class="rtl-maturity-heading">Evidence-scale warning</h3>$1</section>\\n',
  );

  return html;`;
sync = replaceOnce(sync, oldToc, newToc, "RTL technical framing TOC and maturity wrapper");

sync = sync.replaceAll("rtl-result.css?v=rtl-result-v2", "rtl-result.css?v=rtl-result-v3");
await fs.writeFile(syncPath, sync, "utf8");

const cssPath = "assets/rtl-result.css";
let css = await fs.readFile(cssPath, "utf8");
if (!css.includes("/* RTL technical framing v3 */")) {
  css += `

/* RTL technical framing v3 */
.result-verified-rtl-page .rtl-table--ppa-definition {
  min-width: 58rem;
}

.result-verified-rtl-page .rtl-table--ppa-definition th:nth-child(1),
.result-verified-rtl-page .rtl-table--ppa-definition td:nth-child(1) {
  width: 16%;
}

.result-verified-rtl-page .rtl-table--ppa-definition th:nth-child(2),
.result-verified-rtl-page .rtl-table--ppa-definition td:nth-child(2) {
  width: 42%;
}

.result-verified-rtl-page .rtl-table--ppa-definition th:nth-child(3),
.result-verified-rtl-page .rtl-table--ppa-definition td:nth-child(3) {
  width: 42%;
}

.result-verified-rtl-page .rtl-maturity-warning {
  width: min(100%, 68rem);
  margin: 2.4rem 0 3.4rem;
  padding: clamp(1.25rem, 2.4vw, 1.8rem) clamp(1.3rem, 2.6vw, 2rem);
  border: 1px solid var(--line-strong);
  border-left: 4px solid var(--text);
  background: color-mix(in srgb, var(--text) 2.5%, var(--bg));
}

.result-verified-rtl-page .rtl-maturity-warning .rtl-maturity-heading {
  width: auto;
  max-width: none;
  margin: 0 0 0.9rem;
  font-size: clamp(1.35rem, 1.8vw, 1.7rem);
  line-height: 1.15;
  letter-spacing: -0.035em;
}

.result-verified-rtl-page .rtl-maturity-warning .rtl-maturity-heading::before {
  display: block;
  margin-bottom: 0.55rem;
  color: var(--accent);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  content: "WARNING · PUBLIC EVIDENCE SCALE";
}

.result-verified-rtl-page .rtl-maturity-warning p {
  width: min(100%, 58rem);
  max-width: 58rem;
  margin: 0.7rem 0 0;
  font-size: 0.98rem;
  line-height: 1.68;
}

.result-verified-rtl-page .rtl-maturity-warning p:first-of-type {
  margin-top: 0;
  font-size: 1.04rem;
}

.result-verified-rtl-page .result-markdown-image:has(img[src$="rtl-to-ppa.svg"]),
.result-verified-rtl-page .result-markdown-image:has(img[src$="-context-ppa.svg"]) {
  width: min(100%, 72rem);
}

.result-verified-rtl-page .result-markdown-image:has(img[src$="-context-ppa.svg"]) {
  margin-top: 1.8rem;
  margin-bottom: 2.2rem;
}

@media (max-width: 760px) {
  .result-verified-rtl-page .rtl-maturity-warning {
    width: 100%;
    margin-inline: 0;
  }

  .result-verified-rtl-page .rtl-table--ppa-definition {
    min-width: 48rem;
  }
}
`;
}
await fs.writeFile(cssPath, css, "utf8");

console.log(`Prepared #163 technical framing against Results ${RESULTS_SHA}`);
