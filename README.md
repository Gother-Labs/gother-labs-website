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
- `company/`, `contact/`, `careers/`, `evolther/`: section routes
- `tools/`: internal support helpers that should not live in the repository root

## Local preview

Serve the repository root with a simple static server:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Maintenance rules

- Keep tracked assets only when they are used by the site or by a documented helper workflow.
- Remove deprecated public routes instead of leaving ambiguous stubs behind.
- Keep internal or experimental helpers under `tools/`, not in the repository root.
