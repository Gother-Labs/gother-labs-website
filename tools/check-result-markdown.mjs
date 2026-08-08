#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articleWithoutTitle, markdownToHtml } from "./result-markdown.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_ROOT = process.env.RESULTS_ROOT
  ? path.resolve(process.env.RESULTS_ROOT)
  : path.resolve(__dirname, "..", "..", "gother-labs-results");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(path.join(RESULTS_ROOT, "catalog.json"), "utf8"));
  const published = catalog.results.filter((result) => result.status === "published" && result.path);

  for (const entry of published) {
    const resultPath = path.join(RESULTS_ROOT, entry.path);
    const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
    const articlePath = path.join(path.dirname(resultPath), result.article_path ?? "article.md");
    const article = await fs.readFile(articlePath, "utf8");
    const visualKeys = [...article.matchAll(/^\{\{visual:([a-z0-9-]+)\}\}$/gm)].map((match) => match[1]);
    const inserts = Object.fromEntries(visualKeys.map((key) => [key, `<div data-contract-visual="${key}"></div>`]));
    const html = markdownToHtml(articleWithoutTitle(article), inserts, {
      sourceName: path.relative(RESULTS_ROOT, articlePath),
    });

    assert(!/<p>[^<]*(?:!\[|\[[^\]]+\]\()/.test(html), `${result.slug}: raw Markdown survived parsing`);
    for (const key of visualKeys) assert(html.includes(`data-contract-visual="${key}"`), `${result.slug}: visual ${key} was dropped`);
  }

  const fixture = `## Contract fixture

- one
- two

| Kind | Behavior |
| --- | --- |
| Link | [artifact](artifacts/metrics.json) |

\`inline\` and **strong**.

\`\`\`js
const safe = true;
\`\`\`

$$
x = 1
$$

![Local figure](assets/figure.svg)`;
  const fixtureHtml = markdownToHtml(fixture, {}, { sourceName: "contract-fixture.md" });
  assert(fixtureHtml.includes("<ul>"), "contract fixture list did not render");
  assert(fixtureHtml.includes("<table>"), "contract fixture table did not render");
  assert(fixtureHtml.includes('href="artifacts/metrics.json"'), "relative artifact link did not render");
  assert(fixtureHtml.includes('src="assets/figure.svg"'), "local image did not render");

  for (const unsupported of ["[bad](javascript:alert)", "> unsupported", "![bad](https://example.com/a.png)"]) {
    let rejected = false;
    try {
      markdownToHtml(unsupported, {}, { sourceName: "unsupported-fixture.md" });
    } catch {
      rejected = true;
    }
    assert(rejected, `unsupported fixture was not rejected: ${unsupported}`);
  }

  console.log(`Result Markdown contract passed for ${published.length} published result domains.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
