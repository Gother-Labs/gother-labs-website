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
node --test tools/*.test.mjs
node tools/check-site-shell.mjs
node tools/build-pages-artifact.mjs --output _site
node tools/check-site-integrity.mjs --site-root _site
node tools/check-rtl-page.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/check-results-source-provenance.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs --check
git diff --check
```

The generated-results check uses the exact source commit in
`tools/generated-results.lock.json`, creates a clean temporary output tree, and fails on missing,
stale, or byte-different source-owned generated files and declared artifacts. The same lock lists
the rich detail pages, historical run surfaces, and support assets that are intentionally curated
in the website repository; the checker seeds only those explicit paths before generation. It does
not modify the checkout. A mismatched/dirty source, tracked symlink, Git submodule, or locked commit
that is not reachable from the fetched Results `origin/main` fails before the catalog or artifacts
are consumed. The Pages builder copies only the explicit public tree into `_site`; the integrity
checker then validates every HTML file in that exact deployment artifact.

When intentionally advancing or repairing generated results, first check out the locked commit in
the sibling repository and run:

```bash
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs
```

Then review the generated diff before committing and rerun the complete command set above.
Shell-sensitive changes should not introduce unrelated editorial changes.

The pull-request workflow runs this same set. The Pages workflow reuses it as a required `verify`
job and only deploys from `main`, so a push or manual deployment cannot upload the static tree after
a failed gate or from another ref.

## Route Set

Inspect this route set for shell-sensitive PRs:

| Route | Purpose |
| --- | --- |
| `/` | Home exception: hero wordmark may replace header brand. |
| `/company/` | Standard hand-authored shell page. |
| `/contact/` | Standard hand-authored shell page and footer behavior. |
| `/rtl-optimization/` | Hand-authored RTL/PPA pilot page with route-specific styles, evidence links, and responsive proof cards. |
| `/results/` | Generated results index shell. |
| `/results/quadrature-rule-optimization/` | Generated result detail page with MathJax exception. |
| `/results/quadrature-rule-optimization/run/` | Website-owned, noindex historical archive retained across generation. |
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

- Confirm generated pages keep `styles.css?v=rtl-audit-v2` and `scripts.js?v=rtl-audit-v2`.
- Confirm generated pages use the current wordmark shell and `.nav-links` wrapper.
- Confirm copied run pages keep their expected noindex behavior.
- Confirm generated result diffs are limited to intended shell, metadata, or result-content changes.

## Evidence

Do not commit screenshots or generated visual reports by default. Attach screenshots to the PR only when they clarify a visual decision, responsive fix, or before/after regression.

In the PR body, list the structural commands run and the routes/viewport classes spot-checked.
