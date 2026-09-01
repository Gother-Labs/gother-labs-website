import assert from "node:assert/strict";
import test from "node:test";
import { articleWithoutTitle, markdownToHtml } from "./result-markdown.mjs";

test("renders the documented result article subset", () => {
  const markdown = `# Removed title

## Contract

- one
- **two**

| Kind | Behavior |
| --- | --- |
| Link | [artifact](artifacts/metrics.json) |

\`inline\` and [external](https://example.com).

\`\`\`js
const safe = true;
\`\`\`

$$
x = 1
$$

![Local figure](assets/figure.svg)

{{visual:contract-table}}`;
  const html = markdownToHtml(
    articleWithoutTitle(markdown),
    { "contract-table": '<div data-visual="contract-table"></div>' },
    { sourceName: "fixture.md" },
  );

  assert.match(html, /<h2>Contract<\/h2>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /href="artifacts\/metrics\.json"/);
  assert.match(html, /target="_blank" rel="noreferrer"/);
  assert.match(html, /class="language-js"/);
  assert.match(html, /class="formula-block"/);
  assert.match(html, /src="assets\/figure\.svg"/);
  assert.match(html, /data-visual="contract-table"/);
});

test("preserves the existing static-math rendering mode", () => {
  const html = markdownToHtml("Value \\(x_i \\in \\mathbb{R}\\).\n\n$$\n\\tau \\geq 0\n$$", {}, {
    sourceName: "static.md",
    staticMath: true,
  });
  assert.match(html, /class="static-math"/);
  assert.match(html, /∈ ℝ/);
  assert.match(html, /τ ≥ 0/);
  assert.doesNotMatch(html, /\\\[/);
});

for (const [name, markdown, message] of [
  ["unknown visual", "{{visual:missing}}", "missing renderer for visual insert"],
  ["unsafe link", "[bad](javascript:alert)", "unsupported Markdown target scheme"],
  ["remote image", "![bad](https://example.com/a.png)", "remote Markdown images are not supported"],
  ["raw HTML", "<aside>bad</aside>", "unsupported block Markdown syntax"],
  ["blockquote", "> bad", "unsupported block Markdown syntax"],
  ["nested list", "  - bad", "nested lists are not supported"],
  ["unclosed code", "```js\nconst bad = true;", "unclosed fenced-code block"],
  ["unclosed formula", "$$\nx = 1", "unclosed display-formula block"],
  ["malformed table", "| A | B |\n| --- |", "column counts differ"],
]) {
  test(`rejects ${name} with source context`, () => {
    assert.throws(
      () => markdownToHtml(markdown, {}, { sourceName: "bad.md" }),
      new RegExp(`bad\\.md:1:.*${message}`),
    );
  });
}
