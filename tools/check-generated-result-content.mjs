#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const defaultSiteRoot = path.resolve(scriptDirectory, "..");
const defaultContractPath = path.join(scriptDirectory, "generated-result-content-contract.json");
const SCHEMA_VERSION = "generated-result-content-contract/v1";

function normalizeWhitespace(value) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function classList(tag) {
  const match = tag.match(/\bclass=(?:"([^"]*)"|'([^']*)')/i);
  return (match?.[1] ?? match?.[2] ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function attributeValue(tag, name) {
  const pattern = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i");
  const match = tag.match(pattern);
  return match?.[1] ?? match?.[2] ?? null;
}

function collectTags(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  return [...html.matchAll(pattern)].map((match) => match[0]);
}

function extractArticle(html) {
  const opening = /<article\b[^>]*class=(?:"[^"]*\bresult-article\b[^"]*"|'[^']*\bresult-article\b[^']*')[^>]*>/i.exec(html);
  if (!opening) return null;
  const start = opening.index + opening[0].length;
  const end = html.indexOf("</article>", start);
  if (end < 0) return null;
  return {
    openingTag: opening[0],
    body: html.slice(start, end),
  };
}

function headingSequence(articleBody) {
  const headings = [];
  const pattern = /<h([2-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  for (const match of articleBody.matchAll(pattern)) {
    headings.push(`h${match[1]}:${normalizeWhitespace(match[2])}`);
  }
  return headings;
}

function artifactHrefs(articleBody) {
  const hrefs = [];
  for (const tag of collectTags(articleBody, "a")) {
    const href = attributeValue(tag, "href");
    if (href && /(?:^|\/)artifacts\//.test(href)) hrefs.push(href);
  }
  return [...new Set(hrefs)].sort();
}

function rawMarkdownResidue(articleBody) {
  const withoutCode = articleBody
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, "")
    .replace(/<code\b[\s\S]*?<\/code>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  const text = withoutCode.replace(/<[^>]+>/g, "\n");
  const findings = [];

  if (/!\[[^\]\n]*\]\([^\n)]+\)/.test(text)) findings.push("raw Markdown image syntax");
  if (/(^|[^!])\[[^\]\n]+\]\([^\n)]+\)/.test(text)) findings.push("raw Markdown link syntax");
  if (/\{\{visual:[a-z0-9-]+\}\}/i.test(text)) findings.push("unexpanded visual placeholder");
  if (/(^|\n)\s{0,3}#{1,6}\s+\S/.test(text)) findings.push("raw Markdown heading syntax");
  if (/(^|\n)\s*```/.test(text)) findings.push("raw Markdown fence syntax");
  if (/(^|\n)\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*(?:\n|$)/.test(text)) findings.push("raw Markdown table syntax");

  return findings;
}

function profileResultPage(html, route, failures) {
  const article = extractArticle(html);
  if (!article) {
    failures.push(`${route}: missing result article`);
    return null;
  }

  if (!/class=(?:"[^"]*\bresult-detail-hero\b[^"]*"|'[^']*\bresult-detail-hero\b[^']*')/i.test(html)) {
    failures.push(`${route}: missing result detail hero`);
  }
  if (!/class=(?:"[^"]*\bresult-whitepaper-shell\b[^"]*"|'[^']*\bresult-whitepaper-shell\b[^']*')/i.test(html)) {
    failures.push(`${route}: missing result whitepaper shell`);
  }

  const headings = headingSequence(article.body);
  if (headings.length === 0) failures.push(`${route}: result article has no h2-h6 headings`);

  for (const residue of rawMarkdownResidue(article.body)) {
    failures.push(`${route}: ${residue} survived into generated HTML`);
  }

  return {
    article_classes: classList(article.openingTag),
    headings,
    figures: collectTags(article.body, "figure").length,
    tables: collectTags(article.body, "table").length,
    images: collectTags(article.body, "img").length,
    artifact_hrefs: artifactHrefs(article.body),
    detail_sections: collectTags(html, "section").filter((tag) => classList(tag).includes("result-detail")).length,
  };
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectResultRoutes(siteRoot) {
  const resultsRoot = path.join(siteRoot, "results");
  if (!(await pathExists(resultsRoot))) return [];
  const entries = await fs.readdir(resultsRoot, { withFileTypes: true });
  const routes = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue;
    const indexPath = path.join(resultsRoot, entry.name, "index.html");
    if (await pathExists(indexPath)) routes.push(`results/${entry.name}/index.html`);
  }
  return routes;
}

async function inspectSite(siteRoot) {
  const routes = await collectResultRoutes(siteRoot);
  const failures = [];
  const profiles = {};
  for (const route of routes) {
    const html = await fs.readFile(path.join(siteRoot, route), "utf8");
    const profile = profileResultPage(html, route, failures);
    if (profile) profiles[route] = profile;
  }
  return { routes, profiles, failures };
}

function arrayDifference(expected, actual) {
  const missing = expected.filter((entry) => !actual.includes(entry));
  const extra = actual.filter((entry) => !expected.includes(entry));
  return { missing, extra };
}

function compareProfile(route, expected, actual, failures) {
  for (const field of ["figures", "tables", "images", "detail_sections"]) {
    if (expected[field] !== actual[field]) {
      failures.push(`${route}: ${field} changed; expected ${expected[field]}, found ${actual[field]}`);
    }
  }

  if (JSON.stringify(expected.article_classes) !== JSON.stringify(actual.article_classes)) {
    const diff = arrayDifference(expected.article_classes, actual.article_classes);
    failures.push(
      `${route}: result article classes changed; missing [${diff.missing.join(", ")}], extra [${diff.extra.join(", ")}]`,
    );
  }

  if (JSON.stringify(expected.headings) !== JSON.stringify(actual.headings)) {
    const diff = arrayDifference(expected.headings, actual.headings);
    failures.push(
      `${route}: heading sequence changed; missing [${diff.missing.join(" | ")}], extra [${diff.extra.join(" | ")}]`,
    );
  }

  if (JSON.stringify(expected.artifact_hrefs) !== JSON.stringify(actual.artifact_hrefs)) {
    const diff = arrayDifference(expected.artifact_hrefs, actual.artifact_hrefs);
    failures.push(
      `${route}: article artifact links changed; missing [${diff.missing.join(", ")}], extra [${diff.extra.join(", ")}]`,
    );
  }
}

async function readContract(contractPath) {
  const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
  if (contract.schema_version !== SCHEMA_VERSION || !contract.routes || typeof contract.routes !== "object") {
    throw new Error(`Unsupported generated result content contract: ${contractPath}`);
  }
  return contract;
}

export async function checkGeneratedResultContent({
  siteRoot = defaultSiteRoot,
  contractPath = defaultContractPath,
} = {}) {
  const inspected = await inspectSite(path.resolve(siteRoot));
  const contract = await readContract(path.resolve(contractPath));
  const failures = [...inspected.failures];
  const actualRoutes = Object.keys(inspected.profiles).sort();
  const expectedRoutes = Object.keys(contract.routes).sort();
  const routeDiff = arrayDifference(expectedRoutes, actualRoutes);

  for (const route of routeDiff.missing) failures.push(`${route}: contracted result page is missing`);
  for (const route of routeDiff.extra) failures.push(`${route}: public result page has no content-shape contract`);

  for (const route of expectedRoutes) {
    if (!inspected.profiles[route]) continue;
    compareProfile(route, contract.routes[route], inspected.profiles[route], failures);
  }

  if (failures.length > 0) {
    throw new Error(
      `Generated result content integrity check failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }

  console.log(`Generated result content integrity passed for ${actualRoutes.length} public result pages.`);
}

export async function writeGeneratedResultContentContract({
  siteRoot = defaultSiteRoot,
  contractPath = defaultContractPath,
} = {}) {
  const inspected = await inspectSite(path.resolve(siteRoot));
  if (inspected.failures.length > 0) {
    throw new Error(
      `Refusing to bless malformed generated result content:\n${inspected.failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }
  const routes = Object.fromEntries(
    Object.entries(inspected.profiles).sort(([left], [right]) => left.localeCompare(right)),
  );
  const contract = { schema_version: SCHEMA_VERSION, routes };
  await fs.writeFile(path.resolve(contractPath), `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  console.log(`Wrote generated result content contract for ${Object.keys(routes).length} public result pages.`);
}

function parseCliArgs(argv) {
  const options = { update: false, siteRoot: defaultSiteRoot, contractPath: defaultContractPath };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--update") {
      options.update = true;
    } else if (arg === "--site-root") {
      options.siteRoot = path.resolve(argv[++index]);
    } else if (arg === "--contract") {
      options.contractPath = path.resolve(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  Promise.resolve()
    .then(async () => {
      const options = parseCliArgs(process.argv.slice(2));
      if (options.update) {
        await writeGeneratedResultContentContract(options);
      } else {
        await checkGeneratedResultContent(options);
      }
    })
    .catch((error) => {
      console.error(error.message ?? error);
      process.exitCode = 1;
    });
}
