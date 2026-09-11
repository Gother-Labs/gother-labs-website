import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const studio = fs.readFileSync(path.join(ROOT, "assets", "studio.css"), "utf8");

function firstBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing ${selector} block`);
  return match[1];
}

function customProperty(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`${escaped}\\s*:\\s*([^;]+);`));
  assert.ok(match, `missing ${name}`);
  return match[1].trim();
}

function hexToRgb(value) {
  const hex = value.trim().toLowerCase();
  const short = /^#([0-9a-f]{3})$/i.exec(hex);
  const long = /^#([0-9a-f]{6})$/i.exec(hex);
  const digits = long?.[1] ?? short?.[1].split("").map((digit) => digit + digit).join("");
  assert.ok(digits, `expected hex color, got ${value}`);
  return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
}

function linear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb) {
  const [red, green, blue] = rgb.map(linear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(left, right) {
  const a = luminance(left);
  const b = luminance(right);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function compositeBlack(alpha, background = [255, 255, 255]) {
  return background.map((channel) => Math.round(channel * (1 - alpha)));
}

function assertRatio(label, foreground, background, minimum) {
  const ratio = contrast(foreground, background);
  assert.ok(
    ratio >= minimum,
    `${label} contrast ${ratio.toFixed(3)} is below ${minimum.toFixed(1)}:1`,
  );
}

test("base text and focus tokens preserve WCAG contrast floors", () => {
  const root = firstBlock(styles, ":root");
  const background = hexToRgb(customProperty(root, "--bg"));
  const text = hexToRgb(customProperty(root, "--text"));
  const muted = hexToRgb(customProperty(root, "--muted"));
  const mutedSoft = hexToRgb(customProperty(root, "--muted-soft"));
  const accent = hexToRgb(customProperty(root, "--accent"));
  const focus = hexToRgb(customProperty(root, "--focus-ring"));

  assertRatio("--muted on --bg", muted, background, 4.5);
  assertRatio("--muted-soft on --bg", mutedSoft, background, 4.5);
  assertRatio("--accent on --bg", accent, background, 4.5);
  assertRatio("--focus-ring against --bg", focus, background, 3.0);
  assertRatio("--focus-ring against --text", focus, text, 3.0);
});

test("result code syntax colors remain readable on code and gutter surfaces", () => {
  const code = firstBlock(styles, ".result-whitepaper .result-code-figure");
  const background = hexToRgb(customProperty(code, "--code-bg"));
  const gutter = hexToRgb(customProperty(code, "--code-gutter"));

  for (const token of ["--code-text", "--code-keyword", "--code-builtin", "--code-string", "--code-comment", "--code-constant"]) {
    assertRatio(`${token} on --code-bg`, hexToRgb(customProperty(code, token)), background, 4.5);
  }
  assertRatio("--code-line-no on --code-gutter", hexToRgb(customProperty(code, "--code-line-no")), gutter, 4.5);
});

test("editorial studio normal-text colors retain AA contrast on its forced light surface", () => {
  const root = firstBlock(studio, ":root");
  const blue = hexToRgb(customProperty(root, "--studio-blue"));
  const background = [255, 255, 255];

  assertRatio("--studio-blue on white", blue, background, 4.5);
  assertRatio("studio muted 62% black on white", compositeBlack(0.62), background, 4.5);
  assertRatio("studio muted-soft 68% black on white", compositeBlack(0.68), background, 4.5);

  const literalTextAlphas = [...studio.matchAll(/color:\s*rgb\(0 0 0 \/ (\d+)%\)/g)].map((match) => Number(match[1]) / 100);
  assert.ok(literalTextAlphas.length > 0, "expected studio literal muted-text colors to audit");
  for (const alpha of literalTextAlphas) {
    assertRatio(`studio literal ${Math.round(alpha * 100)}% black text on white`, compositeBlack(alpha), background, 4.5);
  }
});

test("all standard keyboard-focusable controls inherit the universal focus foundation", () => {
  assert.match(styles, /Universal keyboard focus foundation/);
  assert.match(
    styles,
    /:where\([\s\S]*?a\[href\][\s\S]*?button[\s\S]*?select[\s\S]*?textarea[\s\S]*?summary[\s\S]*?\[tabindex\]:not\(\[tabindex="-1"\]\)[\s\S]*?\):focus-visible\s*\{/,
  );
  assert.match(styles, /outline:\s*3px solid var\(--focus-ring\)\s*!important;/);
  assert.match(styles, /outline-offset:\s*3px\s*!important;/);

  for (const [name, css] of [["styles.css", styles], ["assets/studio.css", studio]]) {
    assert.doesNotMatch(css, /outline\s*:\s*(?:none|0(?:\D|$))/i, `${name} must not suppress focus outlines`);
  }
});
