#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultSiteRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultOrigin = "https://www.gotherlabs.com";
const ignoredDirectories = new Set([".git"]);
const approvedExternalScripts = new Map([
  [
    "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js",
    "sha384-AHAnt9ZhGeHIrydA1Kp1L7FN+2UosbF7RQg6C+9Is/a7kDpQ1684C2iH2VWil6r4",
  ],
]);
const metricClaimContracts = [
  {
    route: "/results/quadrature-rule-optimization/",
    metrics: "results/quadrature-rule-optimization/artifacts/metrics.json",
    claims: [
      {
        key: "improvement_pct",
        digits: 2,
        suffix: "%",
        target: {
          label: "the lead paragraph after the Abstract heading",
          selector: { tag: "p" },
          after: { tag: "h2", text: "Abstract" },
          first: true,
        },
      },
    ],
  },
  {
    route: "/results/rcpsp-psplib-j30/",
    metrics: "results/rcpsp-psplib-j30/artifacts/metrics.json",
    claims: [
      {
        key: "best",
        digits: 3,
        match: "startsWith",
        target: {
          label: "the current accepted score field",
          selector: { tag: "p", className: "result-outcome-value" },
        },
      },
      {
        key: "improvement_pct",
        digits: 2,
        prefix: "−",
        suffix: "%",
        match: "exact",
        target: {
          label: "the current accepted score delta field",
          selector: { tag: "span" },
          within: { tag: "p", className: "result-outcome-value" },
        },
      },
      {
        key: "instances_evaluated",
        digits: 0,
        suffix: " out of 80",
        target: {
          label: "the current outcome feasibility copy",
          selector: { tag: "p", className: "result-outcome-copy" },
        },
      },
    ],
  },
  {
    route: "/results/qubit-routing-lightsabre/",
    metrics: "results/qubit-routing-lightsabre/artifacts/metrics.json",
    claims: [
      {
        key: "added_cnot_reduction_vs_lightsabre",
        digits: 0,
        grouped: true,
        target: {
          label: "the result hero introduction",
          selector: { tag: "p", className: "results-hero-intro" },
        },
      },
      {
        key: "total_cases",
        digits: 0,
        suffix: " public routing cases",
        target: {
          label: "the result hero introduction",
          selector: { tag: "p", className: "results-hero-intro" },
        },
      },
    ],
  },
  {
    route: "/results/iberian-bess-policy-challenge/",
    metrics: "results/iberian-bess-policy-challenge/artifacts/metrics.json",
    claims: [
      {
        key: "uplift_vs_quantile_dispatch_baseline_mean_eur",
        digits: 2,
        prefix: "€",
        suffix: "/day",
        match: "exact",
        target: {
          label: "the Mean gross uplift KPI value",
          selector: { tag: "text", className: "bess-kpi-value" },
          after: { tag: "text", className: "bess-kpi-label", text: "Mean gross uplift" },
          first: true,
        },
      },
      {
        key: "constraint_breach_count",
        digits: 0,
        suffix: " breaches",
        match: "exact",
        target: {
          label: "the Guardrails KPI value",
          selector: { tag: "text", className: "bess-kpi-value" },
          after: { tag: "text", className: "bess-kpi-label", text: "Guardrails" },
          first: true,
        },
      },
    ],
  },
];
const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectHtmlFiles(root, directory = root, failures = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      failures.push(
        `/${normalizePath(path.relative(root, target))}: symbolic links are not allowed in the published tree`,
      );
    } else if (entry.isDirectory()) {
      files.push(...(await collectHtmlFiles(root, target, failures)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      files.push(target);
    }
  }
  return files;
}

function routeForFile(root, file) {
  const relative = normalizePath(path.relative(root, file));
  if (relative === "index.html") return "/";
  if (relative === "404.html") return "/404.html";
  return `/${relative.replace(/index\.html$/, "")}`;
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function attributesForTag(tag) {
  const attributes = new Map();
  const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = attributePattern.exec(tag))) {
    attributes.set(match[1].toLowerCase(), decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

function normalizeNodeText(value) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function elementsMatching(html, selector, start = 0, end = html.length) {
  const source = html.slice(start, end);
  const tagName = escapeRegExp(selector.tag);
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}\\s*>`, "gi");
  const matches = [];
  let match;
  while ((match = pattern.exec(source))) {
    const rawOpen = `<${selector.tag}${match[1]}>`;
    const attributes = attributesForTag(rawOpen);
    const classes = new Set((attributes.get("class") ?? "").split(/\s+/).filter(Boolean));
    if (selector.className && !classes.has(selector.className)) continue;
    if (selector.id && attributes.get("id") !== selector.id) continue;
    const text = normalizeNodeText(match[2]);
    if (selector.text !== undefined && text !== selector.text) continue;
    const absoluteStart = start + match.index;
    const openingLength = match[0].indexOf(">") + 1;
    matches.push({
      start: absoluteStart,
      end: absoluteStart + match[0].length,
      innerStart: absoluteStart + openingLength,
      innerEnd: absoluteStart + openingLength + match[2].length,
      text,
    });
  }
  return matches;
}

function describeSelector(selector) {
  const classLabel = selector.className ? `.${selector.className}` : "";
  const idLabel = selector.id ? `#${selector.id}` : "";
  const textLabel = selector.text === undefined ? "" : ` with text ${JSON.stringify(selector.text)}`;
  return `<${selector.tag}${idLabel}${classLabel}>${textLabel}`;
}

function uniqueElement(html, selector, start, end, context) {
  const matches = elementsMatching(html, selector, start, end);
  if (matches.length !== 1) {
    return {
      error: `${context}: expected exactly one ${describeSelector(selector)}, found ${matches.length}`,
    };
  }
  return { node: matches[0] };
}

function locateClaimTarget(html, target) {
  let start = 0;
  let end = html.length;

  if (target.within) {
    const container = uniqueElement(html, target.within, start, end, target.label);
    if (container.error) return container;
    start = container.node.innerStart;
    end = container.node.innerEnd;
  }

  if (target.after) {
    const anchor = uniqueElement(html, target.after, start, end, target.label);
    if (anchor.error) return anchor;
    start = anchor.node.end;
  }

  const matches = elementsMatching(html, target.selector, start, end);
  if (target.first) {
    if (matches.length === 0) {
      return { error: `${target.label}: missing ${describeSelector(target.selector)}` };
    }
    return { node: matches[0] };
  }
  if (matches.length !== 1) {
    return {
      error: `${target.label}: expected exactly one ${describeSelector(target.selector)}, found ${matches.length}`,
    };
  }
  return { node: matches[0] };
}

function scanTags(html, route, failures) {
  const tags = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf("<", cursor);
    if (start === -1) break;
    if (html.startsWith("<!--", start)) {
      const commentEnd = html.indexOf("-->", start + 4);
      if (commentEnd === -1) {
        failures.push(`${route}: unterminated HTML comment`);
        break;
      }
      cursor = commentEnd + 3;
      continue;
    }

    let quote = null;
    let end = start + 1;
    for (; end < html.length; end += 1) {
      const character = html[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end >= html.length) {
      failures.push(`${route}: unterminated HTML tag near byte ${start}`);
      break;
    }

    tags.push({ raw: html.slice(start, end + 1), offset: start });
    cursor = end + 1;
  }
  return tags;
}

function withoutRawText(html) {
  return html.replace(
    /(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi,
    (_match, open, _name, close) => `${open}${close}`,
  );
}

function validateHtmlSyntax(html, route, failures) {
  if (!/^<!doctype html>/i.test(html.trimStart())) {
    failures.push(`${route}: missing <!doctype html>`);
  }

  const stack = [];
  for (const { raw, offset } of scanTags(withoutRawText(html), route, failures)) {
    if (/^<\s*[!?]/.test(raw)) continue;
    const closing = raw.match(/^<\s*\/\s*([a-zA-Z][\w:-]*)/);
    if (closing) {
      const name = closing[1].toLowerCase();
      const expected = stack.pop();
      if (!expected) {
        failures.push(`${route}: unexpected closing </${name}> near byte ${offset}`);
      } else if (expected !== name) {
        failures.push(`${route}: closing </${name}> near byte ${offset}; expected </${expected}>`);
      }
      continue;
    }

    const opening = raw.match(/^<\s*([a-zA-Z][\w:-]*)/);
    if (!opening) continue;
    const name = opening[1].toLowerCase();
    if (!voidElements.has(name) && !/\/\s*>$/.test(raw)) {
      stack.push(name);
    }
  }

  for (const name of stack.reverse()) {
    failures.push(`${route}: unclosed <${name}> element`);
  }
  for (const required of ["html", "head", "body"]) {
    if (!new RegExp(`<${required}\\b`, "i").test(html)) {
      failures.push(`${route}: missing <${required}> element`);
    }
  }
}

function pageMetadata(html) {
  const tags = scanTags(withoutRawText(html), "metadata", []);
  const metadata = {
    canonical: [],
    ogUrl: [],
    noindex: false,
    redirect: false,
    ids: new Set(),
    duplicateIds: [],
    references: [],
  };

  for (const { raw } of tags) {
    const name = raw.match(/^<\s*([a-zA-Z][\w:-]*)/)?.[1]?.toLowerCase();
    if (!name || raw.startsWith("</")) continue;
    const attributes = attributesForTag(raw);
    const id = attributes.get("id");
    if (id) {
      if (metadata.ids.has(id)) metadata.duplicateIds.push(id);
      metadata.ids.add(id);
    }

    if (name === "link" && (attributes.get("rel") ?? "").toLowerCase().split(/\s+/).includes("canonical")) {
      metadata.canonical.push(attributes.get("href") ?? "");
    }
    if (name === "meta" && (attributes.get("property") ?? "").toLowerCase() === "og:url") {
      metadata.ogUrl.push(attributes.get("content") ?? "");
    }
    if (name === "meta" && (attributes.get("name") ?? "").toLowerCase() === "robots") {
      metadata.noindex ||= (attributes.get("content") ?? "").toLowerCase().split(/[\s,]+/).includes("noindex");
    }
    if (name === "meta" && (attributes.get("http-equiv") ?? "").toLowerCase() === "refresh") {
      metadata.redirect = true;
    }

    for (const attribute of ["href", "src", "action"]) {
      if (attributes.has(attribute)) {
        metadata.references.push({
          tag: name,
          attribute,
          value: attributes.get(attribute),
          integrity: attributes.get("integrity"),
          crossorigin: attributes.get("crossorigin"),
        });
      }
    }
  }
  return metadata;
}

function validateHeadings(html, route, redirect, failures) {
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((match) => ({
    level: Number(match[1]),
    text: decodeEntities(match[2].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim(),
  }));
  if (!redirect && headings.filter((heading) => heading.level === 1).length !== 1) {
    failures.push(`${route}: expected exactly one <h1>`);
  }
  for (const heading of headings) {
    if (!heading.text) failures.push(`${route}: empty <h${heading.level}> heading`);
  }
  if (!redirect && headings.length > 0 && headings[0].level !== 1) {
    failures.push(`${route}: first heading must be <h1>`);
  }
  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level > headings[index - 1].level + 1) {
      failures.push(
        `${route}: heading level jumps from h${headings[index - 1].level} to h${headings[index].level} ` +
          `at ${JSON.stringify(headings[index].text)}`,
      );
    }
  }
}

async function localTargetForUrl(siteRoot, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { error: `invalid URL encoding in ${url.pathname}` };
  }
  const relative = pathname.replace(/^\/+/, "");
  let target = pathname.endsWith("/")
    ? path.join(siteRoot, relative, "index.html")
    : path.join(siteRoot, relative);
  const resolvedRoot = path.resolve(siteRoot);
  let resolved = path.resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    return { error: `target escapes the published root: ${url.pathname}` };
  }
  if (!pathname.endsWith("/")) {
    try {
      if ((await fs.stat(resolved)).isDirectory()) {
        target = path.join(resolved, "index.html");
        resolved = path.resolve(target);
      }
    } catch {
      // The caller reports the missing target with the original public URL.
    }
  }
  return { target: resolved };
}

async function validateReferences(siteRoot, origin, page, pageByFile, failures) {
  const base = new URL(page.route, origin);
  for (const reference of page.metadata.references) {
    const value = reference.value.trim();
    const label = `${reference.tag}[${reference.attribute}=${JSON.stringify(reference.value)}]`;
    if (!value) {
      failures.push(`${page.route}: ${label} is empty`);
      continue;
    }
    if (/^javascript:/i.test(value)) {
      failures.push(`${page.route}: ${label} uses an unsafe javascript URL`);
      continue;
    }
    if (/^(?:mailto|tel|data|blob):/i.test(value)) continue;

    let url;
    try {
      url = new URL(value, base);
    } catch {
      failures.push(`${page.route}: ${label} is not a valid URL`);
      continue;
    }
    if (url.origin !== origin) {
      if (reference.tag === "script" && reference.attribute === "src") {
        const expectedIntegrity = approvedExternalScripts.get(url.href);
        if (!expectedIntegrity) {
          failures.push(`${page.route}: ${label} is not an approved version-pinned external script`);
        } else if (reference.integrity !== expectedIntegrity) {
          failures.push(`${page.route}: ${label} does not match its approved SRI digest`);
        }
        if (reference.crossorigin !== "anonymous") {
          failures.push(`${page.route}: ${label} must use crossorigin=anonymous with SRI`);
        }
      }
      continue;
    }

    const resolved = await localTargetForUrl(siteRoot, url);
    if (resolved.error) {
      failures.push(`${page.route}: ${label} ${resolved.error}`);
      continue;
    }
    if (!(await exists(resolved.target))) {
      failures.push(`${page.route}: ${label} points to missing ${url.pathname}`);
      continue;
    }

    if (url.hash && resolved.target.endsWith(".html")) {
      const targetPage = pageByFile.get(path.resolve(resolved.target));
      if (targetPage) {
        let fragment;
        try {
          fragment = decodeURIComponent(url.hash.slice(1));
        } catch {
          failures.push(`${page.route}: ${label} contains an invalid fragment encoding`);
          continue;
        }
        if (fragment && !targetPage.metadata.ids.has(fragment)) {
          failures.push(`${page.route}: ${label} points to missing fragment #${fragment} on ${targetPage.route}`);
        }
      }
    }
  }
}

async function validateSitemapAndRobots(siteRoot, origin, pages, failures) {
  const sitemapPath = path.join(siteRoot, "sitemap.xml");
  const robotsPath = path.join(siteRoot, "robots.txt");
  if (!(await exists(sitemapPath))) failures.push("/sitemap.xml: missing sitemap");
  if (!(await exists(robotsPath))) failures.push("/robots.txt: missing robots policy");
  if (!(await exists(sitemapPath)) || !(await exists(robotsPath))) return;

  const [sitemap, robots] = await Promise.all([
    fs.readFile(sitemapPath, "utf8"),
    fs.readFile(robotsPath, "utf8"),
  ]);
  if (!/^<\?xml\b/.test(sitemap.trimStart()) || !/<urlset\b[\s\S]*<\/urlset>\s*$/.test(sitemap)) {
    failures.push("/sitemap.xml: malformed XML envelope");
  }
  const locations = [...sitemap.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) => decodeEntities(match[1]));
  const sitemapUrls = new Set();
  for (const location of locations) {
    let url;
    try {
      url = new URL(location);
    } catch {
      failures.push(`/sitemap.xml: invalid <loc> ${JSON.stringify(location)}`);
      continue;
    }
    if (url.origin !== origin) failures.push(`/sitemap.xml: foreign origin in ${location}`);
    if (url.search || url.hash) failures.push(`/sitemap.xml: sitemap URL must not contain query or fragment: ${location}`);
    if (sitemapUrls.has(location)) failures.push(`/sitemap.xml: duplicate URL ${location}`);
    sitemapUrls.add(location);
  }

  const pageByCanonical = new Map();
  for (const page of pages) {
    const expectedCanonical = new URL(page.route, origin).href;
    const indexable = !page.metadata.noindex && !page.metadata.redirect && page.route !== "/404.html";
    if (indexable) {
      if (page.metadata.canonical.length !== 1 || page.metadata.canonical[0] !== expectedCanonical) {
        failures.push(`${page.route}: canonical must be exactly ${expectedCanonical}`);
      }
      if (page.metadata.ogUrl.length !== 1 || page.metadata.ogUrl[0] !== expectedCanonical) {
        failures.push(`${page.route}: og:url must be exactly ${expectedCanonical}`);
      }
      if (!sitemapUrls.has(expectedCanonical)) {
        failures.push(`${page.route}: indexable canonical is missing from sitemap.xml`);
      }
      if (pageByCanonical.has(expectedCanonical)) {
        failures.push(`${page.route}: canonical duplicates ${pageByCanonical.get(expectedCanonical)}`);
      }
      pageByCanonical.set(expectedCanonical, page.route);
    } else if (sitemapUrls.has(expectedCanonical)) {
      failures.push(`${page.route}: noindex, redirect, or error route must not appear in sitemap.xml`);
    }
  }

  for (const location of sitemapUrls) {
    if (!pageByCanonical.has(location)) {
      failures.push(`/sitemap.xml: ${location} does not identify an indexable canonical HTML route`);
    }
  }

  const directives = robots
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  if (!directives.some((line) => /^user-agent:\s*\*$/i.test(line))) {
    failures.push("/robots.txt: missing `User-agent: *`");
  }
  if (!directives.some((line) => /^allow:\s*\/$/i.test(line))) {
    failures.push("/robots.txt: missing `Allow: /`");
  }
  if (directives.some((line) => /^disallow:\s*\S+/i.test(line))) {
    failures.push("/robots.txt: public release policy must not contain a non-empty Disallow directive");
  }
  const sitemapDirectives = directives
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.replace(/^sitemap:\s*/i, ""));
  const expectedSitemap = `${origin}/sitemap.xml`;
  if (sitemapDirectives.length !== 1 || sitemapDirectives[0] !== expectedSitemap) {
    failures.push(`/robots.txt: Sitemap must be exactly ${expectedSitemap}`);
  }
}

async function validateHomepageClaim(siteRoot, failures) {
  const homePath = path.join(siteRoot, "index.html");
  const metricsPath = path.join(
    siteRoot,
    "results",
    "circle-packing-26-unit-square",
    "artifacts",
    "metrics.json",
  );
  if (!(await exists(metricsPath))) {
    failures.push("/: missing Circle Packing metrics used by the featured public claim");
    return;
  }
  const [home, metrics] = await Promise.all([
    fs.readFile(homePath, "utf8"),
    fs.readFile(metricsPath, "utf8").then(JSON.parse),
  ]);
  const exact = metrics.exact_accepted_sum_radii;
  const featured = home.match(/<span\s+data-result-metric="accepted_sum_radii"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "";
  if (typeof exact !== "string" || !featured.includes(exact.slice(0, 20))) {
    failures.push("/: featured Circle Packing claim does not match the published exact metric");
  }
  if (/last proof/i.test(home)) {
    failures.push("/: featured result must not be described as a proof");
  }
}

async function validateMetricClaims(siteRoot, pages, failures) {
  const pageByRoute = new Map(pages.map((page) => [page.route, page]));
  for (const contract of metricClaimContracts) {
    const page = pageByRoute.get(contract.route);
    const metricsPath = path.join(siteRoot, contract.metrics);
    if (!page) {
      failures.push(`${contract.route}: claim contract route is missing`);
      continue;
    }
    if (!(await exists(metricsPath))) {
      failures.push(`${contract.route}: claim contract metrics are missing: ${contract.metrics}`);
      continue;
    }
    const metrics = JSON.parse(await fs.readFile(metricsPath, "utf8"));
    for (const claim of contract.claims) {
      const value = metrics[claim.key];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        failures.push(`${contract.route}: claim metric ${claim.key} is not a finite number`);
        continue;
      }
      const rendered = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: claim.digits,
        maximumFractionDigits: claim.digits,
        useGrouping: claim.grouped ?? false,
      }).format(value);
      const expected = `${claim.prefix ?? ""}${rendered}${claim.suffix ?? ""}`;
      const target = locateClaimTarget(page.html, claim.target);
      if (target.error) {
        failures.push(`${contract.route}: claim metric ${claim.key} cannot bind to ${target.error}`);
        continue;
      }
      const matches =
        claim.match === "exact"
          ? target.node.text === expected
          : claim.match === "startsWith"
            ? target.node.text.startsWith(expected)
            : target.node.text.includes(expected);
      if (!matches) {
        failures.push(
          `${contract.route}: ${claim.target.label} for ${claim.key} must ${claim.match === "exact" ? "equal" : claim.match === "startsWith" ? "start with" : "include"} ${JSON.stringify(expected)}; found ${JSON.stringify(target.node.text)}`,
        );
      }
    }
  }
}

export async function validateSite({
  siteRoot = defaultSiteRoot,
  origin = defaultOrigin,
  publicationClaims = true,
} = {}) {
  const failures = [];
  const htmlFiles = await collectHtmlFiles(siteRoot, siteRoot, failures);
  const pages = [];

  for (const file of htmlFiles) {
    const html = await fs.readFile(file, "utf8");
    const route = routeForFile(siteRoot, file);
    validateHtmlSyntax(html, route, failures);
    const metadata = pageMetadata(html);
    validateHeadings(html, route, metadata.redirect, failures);
    for (const duplicate of metadata.duplicateIds) {
      failures.push(`${route}: duplicate id=${JSON.stringify(duplicate)}`);
    }
    pages.push({ file: path.resolve(file), html, route, metadata });
  }

  const pageByFile = new Map(pages.map((page) => [page.file, page]));
  for (const page of pages) {
    await validateReferences(siteRoot, origin, page, pageByFile, failures);
  }
  await validateSitemapAndRobots(siteRoot, origin, pages, failures);
  if (publicationClaims) {
    await validateHomepageClaim(siteRoot, failures);
    await validateMetricClaims(siteRoot, pages, failures);
  }
  return failures;
}

export function parseCliArguments(args) {
  let siteRoot = defaultSiteRoot;
  let sawSiteRoot = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== "--site-root") {
      throw new Error(`unknown argument: ${argument}`);
    }
    if (sawSiteRoot) throw new Error("--site-root may only be provided once");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("--site-root requires a path");
    }
    siteRoot = path.resolve(value);
    sawSiteRoot = true;
    index += 1;
  }
  return { siteRoot };
}

async function main() {
  const failures = await validateSite(parseCliArguments(process.argv.slice(2)));
  if (failures.length > 0) {
    console.error("Site integrity check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("Site integrity check passed: HTML, headings, internal targets, canonicals, robots, sitemap, and featured claims are coherent.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
