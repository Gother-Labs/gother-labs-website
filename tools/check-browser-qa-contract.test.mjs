import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./check-browser-qa-contract.mjs", import.meta.url), "utf8");

test("browser QA contract pins exact Playwright and baseline count", () => {
  assert.match(source, /@playwright\/test/);
  assert.match(source, /Expected exactly 48 committed visual baselines/);
  assert.match(source, /normal-motion-smoke/);
  assert.match(source, /\/results\/verified-rtl-optimization\//);
  assert.match(source, /\/domains/);
});
