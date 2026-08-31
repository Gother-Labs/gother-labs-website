import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildPagesArtifact, publishedEntries } from "./build-pages-artifact.mjs";

const publishedDirectories = new Set([
  "assets",
  "careers",
  "company",
  "contact",
  "evolther",
  "results",
  "rtl-optimization",
]);

async function artifactFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pages-artifact-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const siteRoot = path.join(root, "website");
  await fs.mkdir(siteRoot);
  for (const entry of publishedEntries) {
    const target = path.join(siteRoot, entry);
    if (publishedDirectories.has(entry)) {
      await fs.mkdir(target, { recursive: true });
      await fs.writeFile(path.join(target, "fixture.txt"), entry);
    } else {
      await fs.writeFile(target, entry);
    }
  }
  await fs.mkdir(path.join(siteRoot, "tools"));
  await fs.writeFile(path.join(siteRoot, "tools", "private.html"), "not public");
  await fs.mkdir(path.join(siteRoot, "docs"));
  await fs.writeFile(path.join(siteRoot, "docs", "notes.md"), "not public");
  await fs.writeFile(path.join(siteRoot, "README.md"), "not public");
  return { root, siteRoot, outputRoot: path.join(siteRoot, "_site") };
}

test("builds only the explicit public tree", async (t) => {
  const { siteRoot, outputRoot } = await artifactFixture(t);
  await buildPagesArtifact({ siteRoot, outputRoot });

  assert.deepEqual((await fs.readdir(outputRoot)).sort(), [...publishedEntries].sort());
  await assert.rejects(fs.access(path.join(outputRoot, "tools")));
  await assert.rejects(fs.access(path.join(outputRoot, "docs")));
  await assert.rejects(fs.access(path.join(outputRoot, "README.md")));
});

test("rejects a symlink anywhere in the public tree", async (t) => {
  const { siteRoot, outputRoot } = await artifactFixture(t);
  const link = path.join(siteRoot, "assets", "linked.txt");
  try {
    await fs.symlink(path.join(siteRoot, "styles.css"), link);
  } catch (error) {
    t.skip(`symlinks unavailable: ${error.message}`);
    return;
  }

  await assert.rejects(
    buildPagesArtifact({ siteRoot, outputRoot }),
    /Refusing symbolic link in published artifact: assets\/linked\.txt/,
  );
});

test("refuses every output path except the dedicated artifact directory", async (t) => {
  const { root, siteRoot } = await artifactFixture(t);
  await assert.rejects(
    buildPagesArtifact({ siteRoot, outputRoot: siteRoot }),
    /Refusing unsafe Pages artifact output path/,
  );
  await assert.rejects(
    buildPagesArtifact({ siteRoot, outputRoot: path.join(siteRoot, "assets") }),
    /Refusing unsafe Pages artifact output path/,
  );
  await assert.rejects(
    buildPagesArtifact({ siteRoot, outputRoot: root }),
    /Refusing unsafe Pages artifact output path/,
  );
});
