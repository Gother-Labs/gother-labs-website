# Accessibility Foundations

This document records the narrow contrast and keyboard-focus contract enforced by issue #121. It is not a claim of complete WCAG 2.2 conformance; the route-level assistive-technology audit remains separate work.

## Normal-text contrast baseline

The July audit referenced `#7a7a7a` muted text and `#0a84ff` accent text on white. The current editorial site no longer uses that pair as its normal-text baseline.

Current shared tokens in `styles.css` are:

| Role | Foreground | Surface | Contrast |
| --- | --- | --- | ---: |
| Muted text | `#6a6a6a` | `#ffffff` | 5.41:1 |
| Muted-soft text | `#6a6a6a` | `#ffffff` | 5.41:1 |
| Accent text | `#006edc` | `#ffffff` | 4.93:1 |
| Focus ring | `#0a84ff` | `#ffffff` | 3.65:1 |
| Focus ring | `#0a84ff` | `#0a0a0a` | 5.43:1 |

Normal text therefore retains a 4.5:1 floor on the shared light surface. The focus indicator retains a 3:1 non-text contrast floor against both the shared light surface and dark ink.

The editorial Studio layer uses a forced light surface. Its primary blue `#005bff` is 5.33:1 against white. Literal semi-transparent black text colors in `assets/studio.css` are also audited automatically against the same white surface rather than assumed safe from opacity alone.

## Result code figures

The generic Result-code palette had two remaining normal-text failures that could survive outside the Studio override:

- line numbers `#7a8490` on `#eef2f6` were about 3.38:1;
- built-ins `#0a84ff` on `#f7f8fb` were about 3.43:1.

The shared palette now uses:

- `--code-line-no: #5f6975` → 4.96:1 on the gutter;
- `--code-builtin: #005fba` → 5.91:1 on the code surface.

The automated test also checks the remaining code text, keyword, string, comment, and constant tokens against their rendered surfaces.

## Universal keyboard focus

Every standard focusable control now inherits one base `:focus-visible` rule from `styles.css`:

- links and image-map areas with `href`;
- buttons;
- non-hidden inputs;
- selects and textareas;
- summaries;
- editable elements;
- button/link/tab roles;
- explicit non-negative `tabindex` targets.

The foundation uses a 3px `var(--focus-ring)` outline with a positive 3px offset. The rule is authoritative so component-specific legacy selectors cannot silently remove or inset the visible ring. Component rules may still change hover color or other presentation, but they do not own whether keyboard focus is visible.

## Automated evidence

`node --test tools/*.test.mjs` includes `tools/accessibility-foundations.test.mjs`, which fails if:

- shared muted/accent normal-text tokens fall below 4.5:1;
- focus-ring contrast falls below 3:1 on the shared light or dark reference surfaces;
- Result code-token contrast falls below 4.5:1;
- Studio literal muted-text colors fall below 4.5:1 on its forced light surface;
- the universal focus selector disappears or its ring/offset weakens;
- the shared or Studio CSS suppresses outlines with `outline: none` / `outline: 0`.

The Playwright `normal-motion-smoke` project also tabs through representative Home, Company, Contact, RTL/PPA, Results, verified RTL Result, and Evölther routes and checks the computed `:focus-visible` outline width and offset on successive keyboard targets.

Visual regression remains responsible for detecting unintended presentation changes across the desktop/laptop/mobile matrix.

## Boundary

This contract deliberately covers foundational text contrast and keyboard-focus visibility only. Figure alternatives, non-color chart distinctions, table semantics, live-region behavior, screen-reader output, zoom/reflow, and a complete WCAG 2.2 AA route audit remain owned by the other accessibility workstreams.
