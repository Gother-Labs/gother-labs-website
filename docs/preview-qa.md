# Preview And Visual QA

The website uses three complementary release-quality layers:

1. deterministic structural checks over the exact GitHub Pages artifact;
2. generated-Result content-shape checks that prevent silent article degradation;
3. Playwright browser/visual regression checks over representative public routes.

Manual review remains useful for editorial judgment, but it is no longer the only protection against responsive, theme, overflow, asset, console, interaction, or generated-content regressions.

## Preview Server

For repository-source previews:

```bash
node tools/preview.mjs
```

For the exact Pages artifact used by the browser suite:

```bash
node tools/build-pages-artifact.mjs --output _site
GOTHER_SITE_ROOT=_site node tools/preview.mjs
```

If port `4173` is already in use, pass another port as the first argument.
Unknown routes are served with `404.html` and an HTTP 404 status.

## Structural Checks

Run these before browser review:

```bash
node --test tools/*.test.mjs
node tools/check-site-shell.mjs
node tools/build-pages-artifact.mjs --output _site
node tools/check-site-integrity.mjs --site-root _site
node tools/check-generated-result-content.mjs --site-root _site
node tools/check-rtl-page.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/check-results-source-provenance.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs --check
git diff --check
```

The generated-results check uses the exact source commit in
`tools/generated-results.lock.json`, creates a clean temporary output tree, and fails on missing,
stale, or byte-different source-owned generated files and declared artifacts. The Pages builder
copies only the explicit public tree into `_site`; the integrity checkers validate that exact
deployment artifact.

## Generated Result Content Contract

`tools/generated-result-content-contract.json` records the reviewed structural shape of every public
Result detail page. For each route it pins:

- the Result article class contract;
- the ordered `h2`–`h6` heading sequence;
- figure, table, and image counts;
- Result-detail section count;
- artifact links exposed by the article.

`tools/check-generated-result-content.mjs` also fails independently of that snapshot when raw
Markdown image/link syntax, headings, fences, tables, or an unexpanded `{{visual:...}}` placeholder
survives into generated HTML. A new public Result page fails until it receives an explicit reviewed
content-shape contract.

The unit fixture deliberately reproduces the former Qubit-routing failure mode: raw Markdown plus
missing figure/table/artifact-link primitives must produce route-local diagnostics.

When an intentional Result-content change alters the structural shape, first regenerate the Result
from its pinned source and inspect the generated diff. Only then update the contract:

```bash
node tools/check-generated-result-content.mjs --update
node tools/build-pages-artifact.mjs --output _site
node tools/check-generated-result-content.mjs --site-root _site
```

Do not run `--update` merely to make CI green. The update command refuses to bless pages that already
contain generic malformed-content signals such as raw Markdown residue or a missing Result article,
hero, whitepaper shell, or heading structure.

## Automated Browser / Visual Regression

Install the pinned dependency and Chromium runtime once:

```bash
npm ci
npx playwright install chromium
```

Run the browser suite:

```bash
npm run test:visual
```

The suite builds `_site`, serves that exact artifact with `tools/preview.mjs`, and exercises the
representative route matrix under pinned Chromium.

The committed visual baselines cover:

- desktop light: `1440 × 900`;
- laptop dark: `1280 × 800`;
- mobile light + reduced motion: `390 × 844`;
- mobile dark + reduced motion: `390 × 844`.

A separate normal-motion browser smoke test exercises the Home RTL case selector and the live
commercial scheduling actions without taking an unstable animation screenshot.

For every screenshot route, the suite also fails closed on:

- uncaught page exceptions;
- browser console errors;
- failing or missing same-origin resources;
- broken `<img>` assets;
- document-level horizontal overflow;
- missing or reordered `Results / Company / Contact` navigation.

The route matrix includes Home, Company, Contact, the RTL/PPA pilot, Results index, multiple Result
rendering surfaces, historical run surfaces, Evölther, and the custom 404 fallback.

On a visual mismatch Playwright emits actual/expected/diff images and a retained trace. CI uploads
`playwright-report/` and `test-results/visual/` as a short-lived review artifact when the browser gate
fails.

### Approving an intentional visual change

Do not weaken pixel thresholds or structural assertions to make an intentional change pass. Review
the browser output first, then explicitly regenerate the baselines:

```bash
npm run test:visual:update
npm run test:visual
```

Commit only the baseline images that correspond to the reviewed visual change.

## Route Set

The automated suite covers these representative surfaces:

| Route | Purpose |
| --- | --- |
| `/` | Home and interactive RTL evidence selector. |
| `/company/` | Standard hand-authored shell page. |
| `/contact/` | Contact/scheduling surface. |
| `/rtl-optimization/` | RTL/PPA pilot and booking route. |
| `/results/` | Generated Results index. |
| `/results/quadrature-rule-optimization/` | Generated mathematical Result detail. |
| `/results/quadrature-rule-optimization/run/` | Historical run surface. |
| `/results/verified-rtl-optimization/` | Rich RTL Result surface. |
| `/results/rcpsp-psplib-j30/` | Diagram-heavy Result surface. |
| `/results/rcpsp-psplib-j30/run/` | RCPSP historical run surface. |
| `/evolther/` | Experimental page with route-specific behavior. |
| `/domains` | Missing-route request exercising custom 404 behavior. |

## Generated Results Checks

When `tools/sync-results.mjs` or generated Result files change:

- preserve the supported Markdown/article contract;
- keep the generated content-shape contract aligned only after reviewing intentional structural changes;
- keep `styles.css?v=rtl-audit-v2` and `scripts.js?v=rtl-audit-v2` where required;
- preserve the current wordmark shell and `.nav-links` wrapper;
- preserve expected `noindex` behavior on copied historical run pages;
- keep generated diffs limited to intended shell, metadata, or Result-content changes;
- review and update visual baselines only when the visible change is intentional.

## CI / Evidence

`site-integrity` runs structural, generated-content, and browser/visual checks in the same required
job, so any of those regressions blocks the existing merge gate rather than creating a parallel
advisory check. The Pages deployment reuses `site-integrity` before publishing from `main`.

Do not commit ad-hoc screenshots. The only committed screenshots are the deterministic visual
regression baselines under `tests/visual/__screenshots__/`. Failure evidence belongs in the CI
artifact; one-off before/after screenshots can still be attached to a PR when they clarify a visual
decision.
