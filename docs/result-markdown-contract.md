# Result article Markdown contract

Result articles use a deliberately bounded Markdown subset. Generation fails with the source file and line number when content falls outside this contract; unsupported syntax must never be emitted as degraded text.

## Supported blocks

- Headings levels 1–3. The leading article title is removed before rendering, while remaining heading levels are preserved.
- Paragraphs separated by blank lines.
- Fenced code blocks using triple backticks and an optional alphanumeric language identifier.
- Display formulas delimited by `$$` on their own lines. Inline MathJax delimiters remain available; the Circle Packing page preserves its static-math mode.
- Flat ordered and unordered lists. Nested lists are intentionally unsupported.
- Pipe tables with a header, a separator row using at least three dashes per column, and rows with identical column counts.
- Domain visuals declared as `{{visual:name}}`. Every declared visual must have a renderer; a missing renderer is a generation error.
- Local block images written as `![Alt text](assets/file.svg)` on their own line. Remote images are rejected.

## Supported inline syntax

- Strong text using `**text**`.
- Inline code using single backticks.
- Links to `http` or `https` URLs.
- Relative artifact, page, and fragment links, including bare paths such as `artifacts/metrics.json`.

Link schemes other than HTTP(S), protocol-relative targets, whitespace/control characters, quotes, and backslashes are rejected. Labels, code, captions, headings, targets, and ordinary text are HTML-escaped. Raw HTML is not supported.

## Unsupported syntax

Blockquotes, raw HTML blocks, thematic breaks, headings deeper than level 3, nested lists, inline images, remote images, malformed fences/formulas, malformed links, and malformed tables cause generation to fail.

## Required validation

```bash
node --test tools/result-markdown.test.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/check-result-markdown.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs --check
node tools/check-site-integrity.mjs
git diff --check
```

The contract checker parses every published result domain. The unit tests exercise each supported block family and verify that unsafe or unsupported input fails with source context.
