# Accessibility QA

This checklist complements the automated browser/visual gate. It records what CI can prove and what still requires a named assistive-technology session before the WCAG 2.2 AA epic can close.

## Result tables

Generated and curated Result data tables use native HTML table semantics at every viewport. Column headers use `th[scope="col"]`; the first cell in each body row is a `th[scope="row"]`; data cells carry explicit `headers` references to both their row and column headers.

Wide tables may scroll horizontally inside their labelled `.result-table-wrap` region. They must not create horizontal document overflow. Mobile CSS must not convert `table`, `thead`, `tbody`, `tr`, `th`, or `td` into generic block boxes, and visual `::before` labels must not substitute for programmatic header relationships.

Run the automated contract with:

```bash
node tools/build-pages-artifact.mjs --output _site
npx playwright test tests/visual/table-accessibility.spec.mjs --config=playwright.config.mjs
```

The browser test covers BESS plus representative mathematical, scheduling, and RTL Result tables. It verifies explicit row/column associations and the BESS mobile display/overflow contract at 390 px.

## Manual assistive-technology boundary

Automation does **not** constitute a VoiceOver or NVDA validation. Issue #120 owns the final named-screen-reader pass across the route matrix. For Result tables, that pass must confirm at minimum:

- VoiceOver on macOS/Safari announces the table name or surrounding caption and the correct row/column context while navigating data cells;
- NVDA on Windows with a supported desktop browser announces the same row/column relationships;
- horizontally scrollable table regions remain keyboard reachable without trapping focus;
- 200% and 400% zoom/reflow do not create horizontal page scrolling or hide required table content;
- light/dark and reduced-motion modes do not alter the semantic relationships.

Record browser, operating-system and assistive-technology versions with the #120 evidence. Do not claim WCAG 2.2 AA conformance from the automated table contract alone.
