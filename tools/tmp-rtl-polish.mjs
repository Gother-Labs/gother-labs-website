#!/usr/bin/env node
import fs from "node:fs/promises";

const RESULTS_SHA = "30bf83fe4a658042b71a6838fc784f7b7c6d8cdf";

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

if (!sync.includes("function verifiedRtlArticleHtml(")) {
  const anchor = `function localArticleAssetPaths(article) {
  const paths = [];
  for (const match of article.matchAll(/!\\[[^\\]\\n]*\\]\\((assets\\/[^)\\s]+)\\)/g)) {
    paths.push(match[1]);
  }
  return [...new Set(paths)];
}
`;
  const helper = `${anchor}
function verifiedRtlArticleHtml(article, markdownOptions) {
  let html = markdownToHtml(articleWithoutTitle(article), {}, markdownOptions);

  html = html
    .replaceAll("<table>", '<div class="rtl-table-scroll"><table class="rtl-data-table">')
    .replaceAll("</table>", "</table></div>");

  html = html
    .replace(
      '<table class="rtl-data-table">\\n  <thead><tr><th>Case</th><th>Structural change</th><th>Correctness boundary</th><th>Case-local composite</th></tr></thead>',
      '<table class="rtl-data-table rtl-table--regimes">\\n  <thead><tr><th>Case</th><th>Structural change</th><th>Correctness boundary</th><th>Case-local composite</th></tr></thead>',
    )
    .replaceAll(
      '<table class="rtl-data-table">\\n  <thead><tr><th>Metric</th><th>Paired improvement</th><th>95% interval</th></tr></thead>',
      '<table class="rtl-data-table rtl-table--paired">\\n  <thead><tr><th>Metric</th><th>Paired improvement</th><th>95% interval</th></tr></thead>',
    )
    .replace(
      '<table class="rtl-data-table">\\n  <thead><tr><th>Case</th><th>Area</th><th>Delay</th><th>Active power</th><th>Composite</th></tr></thead>',
      '<table class="rtl-data-table rtl-table--portfolio">\\n  <thead><tr><th>Case</th><th>Area</th><th>Delay</th><th>Active power</th><th>Composite</th></tr></thead>',
    )
    .replace(
      '<table class="rtl-data-table">\\n  <thead><tr><th>Evidence layer</th><th>Public status</th></tr></thead>',
      '<table class="rtl-data-table rtl-table--assurance">\\n  <thead><tr><th>Evidence layer</th><th>Public status</th></tr></thead>',
    );

  const headings = [
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
  ];
  for (const [label, id] of headings) {
    html = html.replace("<h2>" + label + "</h2>", '<h2 id="' + id + '">' + label + "</h2>");
  }

  html = html
    .replaceAll("<h3>Correctness gate</h3>", '<h3 class="rtl-correctness-heading">Correctness gate</h3>')
    .replaceAll("<h3>Paired result</h3>", '<h3 class="rtl-paired-heading">Paired result</h3>');

  const toc = [
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

  return html;
}
`;
  sync = replaceOnce(sync, anchor, helper, "verified RTL article helper insertion");
}

sync = sync.replace(
  "${markdownToHtml(articleWithoutTitle(article), {}, markdownOptions)}",
  "${verifiedRtlArticleHtml(article, markdownOptions)}",
);

const extraHeadNeedle = `      extraHead: isCirclePackingWhitepaper
        ? \`<meta name="citation_title" content="\${escapeHtml(full.title)}">
    <meta name="citation_author" content="Juan José Fernández Morales">
    <meta name="citation_publication_date" content="2026/08/22">
    <meta name="citation_doi" content="10.5281/zenodo.22060172">\`
        : "",`;
const extraHeadReplacement = `      extraHead: isCirclePackingWhitepaper
        ? \`<meta name="citation_title" content="\${escapeHtml(full.title)}">
    <meta name="citation_author" content="Juan José Fernández Morales">
    <meta name="citation_publication_date" content="2026/08/22">
    <meta name="citation_doi" content="10.5281/zenodo.22060172">\`
        : isVerifiedRtlWhitepaper
          ? '<link rel="stylesheet" href="../../assets/rtl-result.css?v=rtl-result-v2">'
          : "",`;
if (!sync.includes("rtl-result.css?v=rtl-result-v2")) {
  sync = replaceOnce(sync, extraHeadNeedle, extraHeadReplacement, "verified RTL stylesheet link");
}

await fs.writeFile(syncPath, sync, "utf8");
console.log(`Prepared RTL result presentation polish against Results ${RESULTS_SHA}`);
