import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  checkGeneratedResultContent,
  writeGeneratedResultContentContract,
} from "./check-generated-result-content.mjs";

function validResult({ article = "", slug = "qubit-routing-lightsabre" } = {}) {
  return `<!doctype html>
<html lang="en">
<body>
<main id="site-main">
<section class="hero result-detail-hero"><h1>${slug}</h1></section>
<section class="result-detail result-whitepaper-shell qubit-routing-whitepaper-shell">
<article class="result-article result-whitepaper qubit-routing-whitepaper">
${article || `<h2>Abstract</h2>
<p>Bounded result.</p>
<figure id="fig-1"><img src="../../assets/example.svg" alt="Example"></figure>
<h2>Evidence</h2>
<table><thead><tr><th>Metric</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
<p><a href="artifacts/evaluation_contract.json">Evaluation contract</a></p>`}
</article>
</section>
</main>
</body>
</html>`;
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "generated-result-content-"));
  const routeRoot = path.join(root, "site", "results", "qubit-routing-lightsabre");
  const toolsRoot = path.join(root, "tools");
  await fs.mkdir(routeRoot, { recursive: true });
  await fs.mkdir(toolsRoot, { recursive: true });
  const siteRoot = path.join(root, "site");
  const contractPath = path.join(toolsRoot, "contract.json");
  await fs.writeFile(path.join(routeRoot, "index.html"), validResult(), "utf8");
  return { root, siteRoot, routeRoot, contractPath };
}

test("current generated shape can be contracted and verified", async (t) => {
  const current = await fixture();
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));

  await writeGeneratedResultContentContract({
    siteRoot: current.siteRoot,
    contractPath: current.contractPath,
  });
  await checkGeneratedResultContent({
    siteRoot: current.siteRoot,
    contractPath: current.contractPath,
  });
});

test("Qubit-style raw Markdown and missing primitives fail with route-local diagnostics", async (t) => {
  const current = await fixture();
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));

  await writeGeneratedResultContentContract({
    siteRoot: current.siteRoot,
    contractPath: current.contractPath,
  });

  const broken = validResult({
    article: `<h2>Abstract</h2>
<p>Bounded result.</p>
<p>![Topology comparison](assets/topology.svg)</p>
<p>[Evaluation contract](artifacts/evaluation_contract.json)</p>`,
  });
  await fs.writeFile(path.join(current.routeRoot, "index.html"), broken, "utf8");

  await assert.rejects(
    () => checkGeneratedResultContent({ siteRoot: current.siteRoot, contractPath: current.contractPath }),
    (error) => {
      assert.match(error.message, /results\/qubit-routing-lightsabre\/index\.html: raw Markdown image syntax/);
      assert.match(error.message, /results\/qubit-routing-lightsabre\/index\.html: raw Markdown link syntax/);
      assert.match(error.message, /figures changed; expected 1, found 0/);
      assert.match(error.message, /tables changed; expected 1, found 0/);
      assert.match(error.message, /heading sequence changed/);
      assert.match(error.message, /article artifact links changed/);
      return true;
    },
  );
});

test("a new public result page must receive an explicit content-shape contract", async (t) => {
  const current = await fixture();
  t.after(() => fs.rm(current.root, { recursive: true, force: true }));

  await writeGeneratedResultContentContract({
    siteRoot: current.siteRoot,
    contractPath: current.contractPath,
  });

  const extraRoot = path.join(current.siteRoot, "results", "new-result");
  await fs.mkdir(extraRoot, { recursive: true });
  await fs.writeFile(path.join(extraRoot, "index.html"), validResult({ slug: "new-result" }), "utf8");

  await assert.rejects(
    () => checkGeneratedResultContent({ siteRoot: current.siteRoot, contractPath: current.contractPath }),
    /results\/new-result\/index\.html: public result page has no content-shape contract/,
  );
});
