import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPublishedResults } from "./sync-results.mjs";

const result = {
  schema_version: "result/v1",
  slug: "fixture-result",
  status: "published",
  website: { order: 1 },
};

test("accepts the legacy v1 catalog through its bounded result path", async (t) => {
  const resultsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-v1-test-"));
  t.after(() => fs.rm(resultsRoot, { recursive: true, force: true }));
  const resultDirectory = path.join(resultsRoot, "results", result.slug);
  await fs.mkdir(resultDirectory, { recursive: true });
  await fs.writeFile(path.join(resultDirectory, "result.json"), `${JSON.stringify(result)}\n`);

  const loaded = await loadPublishedResults(
    {
      schema_version: "results-catalog/v1",
      results: [{ slug: result.slug, status: "published", path: `results/${result.slug}/result.json` }],
    },
    resultsRoot,
  );
  assert.deepEqual(loaded, [result]);
});

test("accepts v2 embedded objects in committed order without reading a second metadata feed", async () => {
  const second = {
    ...result,
    slug: "second-fixture",
    website: { order: 0 },
  };
  const loaded = await loadPublishedResults({
    schema_version: "results-catalog/v2",
    results: [result, second],
  });
  assert.deepEqual(loaded, [result, second]);
});

test("rejects unknown catalog versions", async () => {
  await assert.rejects(
    loadPublishedResults({ schema_version: "results-catalog/v3", results: [result] }),
    /Unsupported results catalog schema "results-catalog\/v3"/,
  );
});

test("rejects unsafe legacy source paths", async () => {
  await assert.rejects(
    loadPublishedResults(
      {
        schema_version: "results-catalog/v1",
        results: [{ slug: result.slug, status: "published", path: "../private/result.json" }],
      },
      "/tmp/results-root",
    ),
    /escapes the results repository/,
  );
});

test("rejects a legacy result path that escapes through a symlink", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-symlink-test-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const resultsRoot = path.join(base, "results-root");
  const outside = path.join(base, "outside");
  await fs.mkdir(resultsRoot);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "result.json"), `${JSON.stringify(result)}\n`);
  try {
    await fs.symlink(outside, path.join(resultsRoot, "linked"));
  } catch (error) {
    t.skip(`symlinks unavailable: ${error.message}`);
    return;
  }

  await assert.rejects(
    loadPublishedResults(
      {
        schema_version: "results-catalog/v1",
        results: [{ slug: result.slug, status: "published", path: "linked/result.json" }],
      },
      resultsRoot,
    ),
    /resolves outside its result root/,
  );
});
