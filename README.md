# Gother Labs Website

Public company website for Gother Labs.

## Overview

This repository contains the production static site served through GitHub Pages for `www.gotherlabs.com`.

- No build step or framework is used in this repository.
- The custom domain is configured through `CNAME`.
- `.nojekyll` keeps GitHub Pages serving the site as a plain static tree.
- `.github/workflows/pages.yml` publishes the validated static tree through the GitHub Pages Actions deployment API.

## Repository shape

- Root: publishable site files and deployment metadata such as `CNAME`, `robots.txt`, and `sitemap.xml`
- `assets/`: shared static assets used by the site
- `company/`, `contact/`, `rtl-optimization/`, `results/`, `evolther/`: section routes
- `careers/`: legacy redirect to `contact/`
- `tools/`: internal support helpers that should not live in the repository root

The results release combines source-owned output with explicitly curated publication pages. Result
metadata, copied evidence artifacts, run surfaces that are not preserved archives, the results
index, the homepage marker, and the sitemap are synchronized from the sibling
`gother-labs-results` repository. Rich detail pages that predate the complete article generator,
plus the retained historical run surfaces, are enumerated in `tools/generated-results.lock.json`
and are never silently overwritten. The release input is the exact commit recorded in that lock,
not a moving branch tip.

To refresh generated output from a checkout at that commit:

```bash
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs
```

Inspect the resulting diff before committing it. To prove that every source-owned generated file
and declared public artifact is byte-aligned with the clean pinned source, while all enumerated
curated files remain present and the check does not modify the website checkout:

```bash
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs --check
```

Advancing the source is an explicit release change: update the full commit SHA in the lock file,
check out that exact commit in `gother-labs-results`, run the write command, review the generated
content and claims, and then run the complete validation set below. Adding a curated path is not a
drift bypass; it records a deliberate website-owned publication boundary and requires review in
the same change.

After a results change has merged, update a clean local `main` checkout and regenerate the lock
from that merged state only:

```bash
git -C ../gother-labs-results fetch origin main
git -C ../gother-labs-results merge --ff-only origin/main
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/update-generated-results-lock.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs
GOTHER_RESULTS_ROOT=../gother-labs-results node tools/sync-results.mjs --check
```

The lock updater refuses a dirty checkout, a commit other than the current `origin/main`, or an
unknown catalog schema. CI separately requires the locked commit to be reachable from a fetched
`origin/main`, so an older merged release remains reproducible while an unmerged commit fails
closed. The provenance check and synchronizer require a clean checkout at the exact locked SHA.
They reject tracked symlinks and Git submodules before consuming result entries. Catalog handling
explicitly accepts `results-catalog/v1` and `results-catalog/v2` and rejects every other version.

Shared site shell maintenance is documented in `docs/site-shell.md`. Preview and visual QA
expectations are documented in `docs/preview-qa.md`. Before opening a PR, run the same release
commands used by CI:

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

The Pages deployment calls the same integrity workflow and cannot upload an artifact unless these
checks pass. It uploads only the explicit public allowlist assembled in `_site`; repository tools,
documentation, and other maintenance files are not deployed. `check-site-integrity.mjs` validates
every HTML file in that exact artifact, including local targets and fragments, canonical and Open
Graph URLs, robots policy, sitemap/indexability parity, heading hierarchy, basic HTML structure,
and node-bound metric claims on every published result domain. `check-rtl-page.mjs` preserves the
separately reviewed RTL claim boundaries. Workflow actions are pinned to immutable commit SHAs,
Node is fixed by `.node-version`, and the hosted runner is bounded to the Ubuntu 24.04 image line
(whose patch image remains managed by GitHub). The sole external runtime script, MathJax 3.2.2, is
version-pinned and checked against an approved SRI digest.

## Local preview

Serve the repository root with a simple static server:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

To preview GitHub Pages-style custom 404 behavior for unknown routes, use the local preview helper instead:

```bash
node tools/preview.mjs
```

Then open `http://127.0.0.1:4173/domains` or another missing route. The helper serves `404.html` with a 404 status, matching the production fallback more closely than Python's built-in error page.

If port `4173` is already in use, pass another port:

```bash
node tools/preview.mjs 4174
```

## Maintenance rules

- Keep tracked assets only when they are used by the site or by a documented helper workflow.
- Remove deprecated public routes instead of leaving ambiguous stubs behind.
- Treat retained `run/` routes as unlinked, `noindex` historical archives; public entry points must use the canonical result page.
- Keep internal or experimental helpers under `tools/`, not in the repository root.
- Keep hand-authored shell changes aligned with `tools/sync-results.mjs` and `docs/site-shell.md`.
