import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function describedBy(html, ...ids) {
  for (const id of ids) {
    assert.match(html, new RegExp(`aria-describedby=["']${id}["']`), `missing aria-describedby=${id}`);
    const summary = html.match(new RegExp(`<[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)</[^>]+>`));
    assert.ok(summary, `missing summary element ${id}`);
    const text = summary[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    assert.ok(text.length >= 80, `${id} must carry a material textual alternative`);
  }
}

test("BESS replay distinguishes evidence without color and exposes material caveats", () => {
  const html = read("results/iberian-bess-policy-challenge/run/index.html");
  const baseCss = read("results/iberian-bess-policy-challenge/run/surface.css");
  const a11yCss = read("results/iberian-bess-policy-challenge/run/accessibility.css");

  describedBy(html, "dispatch-chart-summary", "score-chart-summary");
  assert.match(html, /dashed-border charge bars below the zero-dispatch axis/i);
  assert.match(html, /offline benchmark excludes intraday, reserves, imbalance, taxes, grid and portfolio effects/i);
  assert.match(baseCss, /\.storage-soc-line[\s\S]*?stroke-dasharray:\s*7 8/);
  assert.match(a11yCss, /\.storage-charge-bar[\s\S]*?stroke-dasharray:\s*2 2/);
  assert.match(a11yCss, /\.storage-discharge-bar[\s\S]*?stroke-dasharray:\s*none/);
  assert.match(a11yCss, /\.storage-score-dot--accepted[\s\S]*?stroke-width:\s*1\.6/);
});

test("Qubit replay uses marker geometry and text in addition to color", () => {
  const html = read("results/qubit-routing-lightsabre/run/index.html");
  const css = read("results/qubit-routing-lightsabre/run/accessibility.css");

  describedBy(html, "qubit-score-summary", "qubit-circuit-summary", "qubit-topology-summary");
  assert.match(html, /baseline marker is a solid circle while accepted markers use a dashed ring/i);
  assert.match(html, /not a hardware-runtime claim/i);
  assert.match(css, /\.qubit-run-baseline-ring[\s\S]*?stroke-dasharray:\s*none/);
  assert.match(css, /\.qubit-run-accepted-ring,[\s\S]*?\.qubit-run-step-marker\.is-accepted[\s\S]*?stroke-dasharray:\s*2 2/);
});

test("RCPSP replay binds existing hatching, guides, labels and scope caveat to text", () => {
  const html = read("results/rcpsp-psplib-j30/run/index.html");
  const css = read("results/rcpsp-psplib-j30/run/surface.css");

  describedBy(html, "rcpsp-score-summary", "rcpsp-dispatch-summary", "rcpsp-gap-summary");
  assert.match(html, /frozen 80-instance PSPLIB J30 subset, not all RCPSP instances/i);
  assert.match(css, /rcpsp-gap-hatch-line/);
  assert.match(css, /stroke-dasharray:\s*3 4/);
  assert.match(css, /rcpsp-schedule-excess-hatch/);
});

test("Quadrature replay has textual alternatives and distinct baseline, accepted and current states", () => {
  const html = read("results/quadrature-rule-optimization/run/index.html");
  const css = read("results/quadrature-rule-optimization/run/accessibility.css");

  describedBy(html, "quadrature-score-summary", "quadrature-rule-summary", "quadrature-integrands-summary");
  assert.match(html, /solid baseline ring, a dashed accepted ring, a filled current marker/i);
  assert.match(html, /bounded benchmark on the fixed public one-dimensional analytic suite/i);
  assert.match(css, /\.quadrature-score-accepted[\s\S]*?stroke-dasharray:\s*2 2/);
});

test("Circle-packing historical replay exposes status and geometry without a color dependency", () => {
  const html = read("results/circle-packing-26-unit-square/run/index.html");

  describedBy(html, "packing-score-summary", "packing-layout-summary", "packing-contact-summary");
  assert.match(html, /negative strict slack and is not the current accepted certificate/i);
  assert.match(html, /spatial position, radius and boundary geometry rather than color alone/i);
  assert.match(html, /current Result ledger is authoritative/i);
});

test("caption-owned generated asset figures expose the caption as the accessible group name", () => {
  const generator = read("tools/sync-results.mjs");

  assert.match(generator, /function paperAssetFigure\(\{ src, caption, number \}\)/);
  assert.match(generator, /role="group" aria-labelledby="\$\{captionId\}"/);
  assert.match(generator, /alt="" aria-hidden="true"/);
  assert.match(generator, /<figcaption id="\$\{captionId\}">Figure \$\{number\}/);
});

test("verified RTL article figures retain meaningful authored alt text", () => {
  const html = read("results/verified-rtl-optimization/index.html");
  assert.match(html, /rtl-to-ppa\.svg" alt="RTL design decisions flow through synthesis/);
  assert.match(html, /transformation-regimes\.svg" alt="Three public RTL transformations/);
});
