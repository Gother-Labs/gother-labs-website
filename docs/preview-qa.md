# Preview And Visual QA Checklist

Use this checklist before opening PRs that can affect shared navigation, the site shell, responsive layout, generated result pages, or route-level metadata. The workflow stays intentionally lightweight: structural checks first, then targeted browser review.

## Preview Server

For most static route checks:

```bash
python3 -m http.server 4173
```

For GitHub Pages-style custom 404 behavior:

```bash
node tools/preview.mjs
```

If port `4173` is already in use, pass another port:

```bash
node tools/preview.mjs 4174
```

Use the same server for the whole QA pass so screenshots and observations are comparable.

## Structural Checks

Run these before browser review:

```bash
node tools/check-site-shell.mjs
git diff --check
```

For generated-results changes, also run:

```bash
node tools/sync-results.mjs
```

Then review the generated diff before committing. Shell-sensitive changes should not introduce unrelated editorial changes.

## Route Set

Inspect this route set for shell-sensitive PRs:

| Route | Purpose |
| --- | --- |
| `/` | Home exception: hero wordmark may replace header brand. |
| `/company/` | Standard hand-authored shell page. |
| `/contact/` | Standard hand-authored shell page and footer behavior. |
| `/results/` | Generated results index shell. |
| `/results/quadrature-rule-optimization/` | Generated result detail page with MathJax exception. |
| `/results/quadrature-rule-optimization/run/` | Copied run page shell normalization. |
| `/404.html` | Hand-authored custom 404 shell. |
| `/domains` | Missing-route fallback when using `node tools/preview.mjs`. |
| `/evolther/` | Experimental page with route-specific shell and responsive behavior. |

If a PR changes RCPSP-specific result rendering, inspect `/results/rcpsp-psplib-j30/` and `/results/rcpsp-psplib-j30/run/` as well.

## Visual Checks

Review each affected route at:

- Desktop: approximately `1440 x 900`.
- Laptop: approximately `1280 x 800`.
- Mobile: approximately `390 x 844`.

For each viewport, verify:

- Header navigation is visible, aligned, and ordered `Results`, `Company`, `Contact`.
- The animated wordmark appears with the expected colored symbol dots where the shared shell uses it.
- Text does not wrap unexpectedly or overlap adjacent content.
- There is no horizontal overflow.
- Footer presence or absence matches the documented shell exceptions.
- Route-specific diagrams, cards, or visual assets remain legible.
- Dark and light mode render critical lines, arrows, symbols, and labels with enough contrast when the page supports both modes.

## Generated Results Checks

When `tools/sync-results.mjs` or generated result files change:

- Confirm generated pages keep `styles.css?v=home-proof-inline-v2` and `scripts.js?v=home-proof-inline-v2`.
- Confirm generated pages use the current wordmark shell and `.nav-links` wrapper.
- Confirm copied run pages keep their expected noindex behavior.
- Confirm generated result diffs are limited to intended shell, metadata, or result-content changes.

## Evidence

Do not commit screenshots or generated visual reports by default. Attach screenshots to the PR only when they clarify a visual decision, responsive fix, or before/after regression.

In the PR body, list the structural commands run and the routes/viewport classes spot-checked.
