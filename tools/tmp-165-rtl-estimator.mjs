#!/usr/bin/env node
import fs from "node:fs/promises";

const RESULTS_SHA = "ca4cd4525fbc91d12bf062672abd8f06038375bb";

const lockPath = "tools/generated-results.lock.json";
const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
lock.commit = RESULTS_SHA;
await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

const syncPath = "tools/sync-results.mjs";
let sync = await fs.readFile(syncPath, "utf8");
sync = sync.replaceAll("rtl-result.css?v=rtl-result-v3", "rtl-result.css?v=rtl-result-v4");
await fs.writeFile(syncPath, sync, "utf8");

const cssPath = "assets/rtl-result.css";
let css = await fs.readFile(cssPath, "utf8");
const marker = "/* RTL paired-estimator mathematics v4 */";
if (!css.includes(marker)) {
  css += `

${marker}
.result-verified-rtl-page .verified-rtl-whitepaper > .formula-block {
  width: min(100%, 68rem);
  max-width: 68rem;
  margin-block: 1.15rem 1.8rem;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  padding-bottom: 0.25rem;
}

.result-verified-rtl-page .verified-rtl-whitepaper > .formula-block .formula-math {
  min-width: max-content;
  padding-inline: 0.2rem 2.5rem;
}

.result-verified-rtl-page .verified-rtl-whitepaper > .formula-block mjx-container[display="true"] {
  margin-block: 0.55rem !important;
}

.result-verified-rtl-page .result-markdown-image figcaption {
  max-width: 56rem;
  margin-top: 0.8rem;
  color: color-mix(in srgb, var(--text) 58%, transparent);
  font-family: "Inter", Arial, sans-serif;
  font-size: 0.78rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: -0.01em;
  text-align: left;
}

.result-verified-rtl-page .rtl-data-table th {
  letter-spacing: 0;
  text-transform: none;
}

.result-verified-rtl-page .rtl-maturity-warning .rtl-maturity-heading::before {
  display: none;
  content: none;
}

@media (max-width: 760px) {
  .result-verified-rtl-page .verified-rtl-whitepaper > .formula-block {
    width: 100%;
    max-width: 100%;
    margin-inline: 0;
  }

  .result-verified-rtl-page .verified-rtl-whitepaper > .formula-block .formula-math {
    padding-right: 1.75rem;
  }

  .result-verified-rtl-page .result-markdown-image figcaption {
    font-size: 0.74rem;
  }
}
`;
}
await fs.writeFile(cssPath, css, "utf8");

console.log(`Prepared #165 website publication against Results ${RESULTS_SHA}`);
