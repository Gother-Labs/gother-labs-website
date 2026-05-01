#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const RESULTS_ROOT = path.resolve(SITE_ROOT, "..", "gother-labs-open-results");
const CATALOG_PATH = path.join(RESULTS_ROOT, "catalog.json");
const OUT_ROOT = path.join(SITE_ROOT, "open-results");

const CSS_VERSION = "open-results-pipeline-v1";
const SITE_URL = "https://www.gotherlabs.com";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value) {
  if (typeof value !== "number") return escapeHtml(value);
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 3,
  }).format(value);
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let paragraph = [];
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    chunks.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushCode = () => {
    if (!code.length) return;
    chunks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 1, 4);
      chunks.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushCode();
  return chunks.join("\n");
}

function articleWithoutTitle(markdown) {
  return markdown.replace(/\r\n/g, "\n").replace(/^#\s+.+\n+/, "");
}

function nav(prefix) {
  return `<header class="site-header">
        <nav class="site-nav" aria-label="Primary">
          <a class="brand nav-brand" href="${prefix}" aria-label="Göther Labs home">
            <img src="${prefix}assets/gother-mark.svg" alt="" class="brand-image">
          </a>
          <a href="${prefix}company/">Company</a>
          <a href="${prefix}domains/">Domains</a>
          <a href="${prefix}open-results/">Open Results</a>
          <a href="${prefix}contact/">Contact</a>
        </nav>
      </header>`;
}

function htmlShell({ title, description, canonicalPath, cssPrefix, body }) {
  const canonical = `${SITE_URL}${canonicalPath}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${SITE_URL}/assets/og-image.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${SITE_URL}/assets/og-image.png">
    <link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="icon" href="${cssPrefix}assets/gother-mark.svg" type="image/svg+xml">
    <link rel="stylesheet" href="${cssPrefix}styles.css?v=${CSS_VERSION}">
  </head>
  <body>
    <a class="skip-link" href="#site-main">Skip to content</a>
    <div class="page-shell site-shell">
      ${nav(cssPrefix)}

      <main class="site-main" id="site-main">
${body}
      </main>

      <footer class="site-footer">
        <p>© <span id="year">2026</span> Göther Labs</p>
      </footer>
    </div>

    <script src="${cssPrefix}scripts.js"></script>
  </body>
</html>
`;
}

function resultCard(result) {
  const labels = result.website?.display_labels ?? {};
  return `<article class="open-result-card">
            <a class="open-result-link" href="./${result.slug}/" aria-label="Read ${escapeHtml(result.title)}">
              <div class="open-result-meta">
                <p class="eyebrow">${escapeHtml(result.website.card_label)}</p>
              </div>
              <h2>${escapeHtml(result.title)}</h2>
              <p>${escapeHtml(result.website.card_summary || result.summary)}</p>
              <div class="open-result-measure">
                <span>${escapeHtml(labels.seed || "Seed objective")}</span>
                <strong>${formatNumber(result.metrics.seed)}</strong>
                <span>${escapeHtml(labels.best || "Best objective")}</span>
                <strong>${formatNumber(result.metrics.best)}</strong>
              </div>
            </a>
          </article>`;
}

async function writeIndex(results) {
  const cards = results.map(resultCard).join("\n\n");
  const body = `        <section class="hero compact-hero page-hero">
          <h1 class="page-title">Open results for evaluated technical improvement.</h1>
          <p class="intro open-results-hero-intro">
            Public technical results where the problem, evaluation contract, and accepted improvement can be inspected together.
          </p>
        </section>

        <section class="open-results-index" aria-label="Open results library">
${cards}
        </section>`;

  await fs.writeFile(
    path.join(OUT_ROOT, "index.html"),
    htmlShell({
      title: "Open Results | Göther Labs",
      description:
        "Open technical results from Göther Labs: evaluated runs, reproducible surfaces, and governed optimization evidence.",
      canonicalPath: "/open-results/",
      cssPrefix: "../",
      body,
    }),
    "utf8",
  );
}

async function copyIfExists(sourceRoot, outputRoot, relativeFile) {
  const source = path.join(sourceRoot, relativeFile);
  const target = path.join(outputRoot, relativeFile);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function writeDetail(result) {
  const resultRoot = path.join(RESULTS_ROOT, "results", result.slug);
  const outputRoot = path.join(OUT_ROOT, result.slug);
  await fs.mkdir(outputRoot, { recursive: true });

  const full = JSON.parse(await fs.readFile(path.join(resultRoot, "result.json"), "utf8"));
  const article = await fs.readFile(path.join(resultRoot, "article.md"), "utf8");
  const plots = full.artifacts?.plots ?? [];
  for (const file of [
    full.artifacts?.candidate_code,
    full.artifacts?.evolution_trace,
    full.artifacts?.metrics,
    full.artifacts?.provenance,
    full.evaluation_contract?.artifact,
    ...plots,
  ].filter(Boolean)) {
    await copyIfExists(resultRoot, outputRoot, file);
  }

  const surfaceLink = full.website?.surface_path
    ? `<a class="text-link" href="../../${escapeHtml(full.website.surface_path)}">Open interactive surface</a>`
    : "";
  const figures = plots
    .map(
      (plot) => `<figure class="open-result-figure">
            <img src="./${escapeHtml(plot)}" alt="">
          </figure>`,
    )
    .join("\n");

  const labels = full.website?.display_labels ?? {};
  const body = `        <section class="hero compact-hero page-hero open-result-detail-hero">
          <p class="eyebrow">${escapeHtml(full.domain)}</p>
          <h1 class="page-title">${escapeHtml(full.title)}</h1>
          <p class="intro open-results-hero-intro">${escapeHtml(full.summary)}</p>
        </section>

        <section class="open-result-detail">
          <aside class="open-result-side">
            <div class="open-result-stat">
              <span>${escapeHtml(labels.seed || "Seed objective")}</span>
              <strong>${formatNumber(full.metrics.seed)}</strong>
            </div>
            <div class="open-result-stat">
              <span>${escapeHtml(labels.best || "Best objective")}</span>
              <strong>${formatNumber(full.metrics.best)}</strong>
            </div>
            <div class="open-result-stat">
              <span>${escapeHtml(labels.improvement || "Improvement")}</span>
              <strong>${formatNumber(full.metrics.improvement)}</strong>
            </div>
            ${surfaceLink}
          </aside>
          <article class="open-result-article">
${markdownToHtml(articleWithoutTitle(article))}
          </article>
        </section>

        <section class="open-result-assets" aria-label="Public result figures">
${figures}
        </section>`;

  await fs.writeFile(
    path.join(outputRoot, "index.html"),
    htmlShell({
      title: `${full.title} | Open Results | Göther Labs`,
      description: full.summary,
      canonicalPath: `/open-results/${full.slug}/`,
      cssPrefix: "../../",
      body,
    }),
    "utf8",
  );
}

async function writeSitemap(results) {
  const urls = [
    "/",
    "/company/",
    "/domains/",
    "/open-results/",
    ...results.map((result) => `/open-results/${result.slug}/`),
    "/contact/",
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>\n    <loc>${SITE_URL}${url}</loc>\n  </url>`).join("\n")}
</urlset>
`;
  await fs.writeFile(path.join(SITE_ROOT, "sitemap.xml"), xml, "utf8");
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG_PATH, "utf8"));
  const results = catalog.results
    .filter((result) => result.status === "published")
    .sort((a, b) => (a.website?.order ?? 999) - (b.website?.order ?? 999));

  await fs.mkdir(OUT_ROOT, { recursive: true });
  await writeIndex(results);
  for (const result of results) {
    await writeDetail(result);
  }
  await writeSitemap(results);
  console.log(`Synced ${results.length} open result(s) from ${path.relative(SITE_ROOT, RESULTS_ROOT)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
