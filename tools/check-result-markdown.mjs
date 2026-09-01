#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articleWithoutTitle, markdownToHtml } from "./result-markdown.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_ROOT = process.env.GOTHER_RESULTS_ROOT
  ? path.resolve(process.env.GOTHER_RESULTS_ROOT)
  : path.resolve(__dirname, "..", "..", "gother-labs-results");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(path.join(RESULTS_ROOT, "catalog.json"), "utf8"));
  assert(
    ["results-catalog/v1", "results-catalog/v2"].includes(catalog.schema_version),
    `Unsupported results catalog schema: ${catalog.schema_version}`,
  );
  const published = catalog.results.filter((result) => result.status === "published");

  for (const entry of published) {
    assert(/^[a-z0-9-]+$/.test(entry.slug ?? ""), `Unsafe result slug: ${entry.slug}`);
    const articlePath = path.join(RESULTS_ROOT, "results", entry.slug, "article.md");
    const article = await fs.readFile(articlePath, "utf8");
    const visualKeys = [...article.matchAll(/^\{\{visual:([a-z0-9-]+)\}\}$/gm)].map((match) => match[1]);
    const inserts = Object.fromEntries(
      visualKeys.map((key) => [key, `<div data-contract-visual="${key}"></div>`]),
    );
    const sourceName = path.relative(RESULTS_ROOT, articlePath);
    const html = markdownToHtml(articleWithoutTitle(article), inserts, {
      sourceName,
      staticMath: entry.slug === "circle-packing-26-unit-square",
    });

    assert(!/(?:!\[|\[[^\]]+\]\()/.test(html.replaceAll(/<a\b[^>]*>.*?<\/a>/g, "")), `${entry.slug}: raw Markdown survived parsing`);
    for (const key of visualKeys) {
      assert(html.includes(`data-contract-visual="${key}"`), `${entry.slug}: visual ${key} was dropped`);
    }
  }

  console.log(`Result Markdown contract passed for ${published.length} published result domains.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
