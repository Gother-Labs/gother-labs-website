# Gother Labs Website

Public company website for Gother Labs.

## Overview

This repository contains the production static site served through GitHub Pages for `www.gotherlabs.com`.

- No build step or framework is used in this repository.
- The custom domain is configured through `CNAME`.
- `.nojekyll` keeps GitHub Pages serving the site as a plain static tree.

## Repository shape

- Root: publishable site files and deployment metadata such as `CNAME`, `robots.txt`, and `sitemap.xml`
- `assets/`: shared static assets used by the site
- `company/`, `contact/`, `results/`, `evolther/`: section routes
- `careers/`: legacy redirect to `contact/`
- `tools/`: internal support helpers that should not live in the repository root

Published result pages are generated from the sibling `gother-labs-results` repository:

```bash
node tools/sync-results.mjs
```

Shared site shell maintenance is documented in `docs/site-shell.md`. Preview and visual QA expectations are documented in `docs/preview-qa.md`. Before opening a PR that changes global navigation, metadata, shared assets, or generated result chrome, run:

```bash
node tools/check-site-shell.mjs
```

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
- Keep internal or experimental helpers under `tools/`, not in the repository root.
- Keep hand-authored shell changes aligned with `tools/sync-results.mjs` and `docs/site-shell.md`.
