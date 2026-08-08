# Result article Markdown contract

Result articles use a deliberately bounded Markdown subset. Generation must fail with the source file and line number when content falls outside this contract; unsupported syntax must never be emitted as degraded text.

## Supported blocks

- Headings levels 1–3. The article title is removed before rendering; remaining headings are shifted into the result-page hierarchy.
- Paragraphs separated by blank lines.
- Fenced code blocks using triple backticks and an optional alphanumeric language identifier.
- Display formulas delimited by `$$` on their own lines. Inline MathJax delimiters remain plain text for MathJax to process.
- Flat ordered and unordered lists. Nested lists are intentionally unsupported.
- Pipe tables with a header, a separator row using at least three dashes per column, and rows with an identical column count.
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

Run these commands whenever the parser, result articles, or generated result output changes:

```bash
node tools/check-result-markdown.mjs
node tools/sync-results.mjs
node tools/check-generated-results.mjs
node tools/check-site-shell.mjs
git diff --check
```

`check-result-markdown.mjs` parses every published result domain and exercises supported and rejected fixtures. `check-generated-results.mjs` rejects surviving raw Markdown, missing local targets, and missing Qubit contract/artifact/figure links.
