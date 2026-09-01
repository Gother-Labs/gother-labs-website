import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseCliArguments, validateSite } from "./check-site-integrity.mjs";

const origin = "https://example.test";

function page(route, body, { canonical = route, robots = "" } = {}) {
  const canonicalUrl = new URL(canonical, origin).href;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    ${robots ? `<meta name="robots" content="${robots}">` : ""}
    <link rel="canonical" href="${canonicalUrl}">
    <meta property="og:url" content="${canonicalUrl}">
    <title>Fixture</title>
  </head>
  <body>${body}</body>
</html>
`;
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "site-integrity-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "company"), { recursive: true });
  await fs.writeFile(
    path.join(root, "index.html"),
    page("/", '<h1>Home</h1><a href="/company#about">Company</a>'),
  );
  await fs.writeFile(
    path.join(root, "company", "index.html"),
    page("/company/", '<h1 id="about">Company</h1><h2>Scope</h2>'),
  );
  await fs.writeFile(
    path.join(root, "sitemap.xml"),
    `<?xml version="1.0"?><urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/company/</loc></url></urlset>`,
  );
  await fs.writeFile(
    path.join(root, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
  );
  return root;
}

async function writeJson(root, relative, value) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function publicationFixture(t) {
  const root = await fixture(t);
  const routes = [
    "/",
    "/company/",
    "/results/quadrature-rule-optimization/",
    "/results/rcpsp-psplib-j30/",
    "/results/qubit-routing-lightsabre/",
    "/results/iberian-bess-policy-challenge/",
  ];
  const exactCircleMetric = "2.123456789012345678901";
  await fs.writeFile(
    path.join(root, "index.html"),
    page(
      "/",
      `<h1>Home</h1><span data-result-metric="accepted_sum_radii">${exactCircleMetric}</span>`,
    ),
  );
  await writeJson(
    root,
    "results/circle-packing-26-unit-square/artifacts/metrics.json",
    { exact_accepted_sum_radii: exactCircleMetric },
  );

  const claimPages = [
    {
      route: "/results/quadrature-rule-optimization/",
      body: `<h1>Quadrature</h1>
        <article><h2>Abstract</h2><p>The accepted rule improves the objective by 83.37%.</p></article>
        <aside>Audit copy retains 83.37%.</aside>`,
      metrics: { improvement_pct: 83.371749 },
    },
    {
      route: "/results/rcpsp-psplib-j30/",
      body: `<h1>RCPSP</h1>
        <p class="result-outcome-value">10.108<span>−29.37%</span></p>
        <p class="result-outcome-copy">The policy is feasible with 80 out of 80 schedules.</p>
        <aside>Audit copy retains 10.108, −29.37%, and 80 out of 80.</aside>`,
      metrics: { best: 10.108499, improvement_pct: 29.371275, instances_evaluated: 80 },
    },
    {
      route: "/results/qubit-routing-lightsabre/",
      body: `<h1>Qubit routing</h1>
        <p class="intro results-hero-intro">The accepted candidate reduced added CNOTs by 12,294 across 72 public routing cases.</p>
        <aside>Audit copy retains 12,294 and 72 public routing cases.</aside>`,
      metrics: { added_cnot_reduction_vs_lightsabre: 12294, total_cases: 72 },
    },
    {
      route: "/results/iberian-bess-policy-challenge/",
      body: `<h1>BESS</h1><svg>
        <g><text class="bess-kpi-label">Mean gross uplift</text><text class="bess-kpi-value">€20.20/day</text></g>
        <g><text class="bess-kpi-label">Guardrails</text><text class="bess-kpi-value">0 breaches</text></g>
        </svg><aside>Audit copy retains €20.20/day and 0 breaches.</aside>`,
      metrics: {
        uplift_vs_quantile_dispatch_baseline_mean_eur: 20.197299,
        constraint_breach_count: 0,
      },
    },
  ];

  for (const claimPage of claimPages) {
    const relative = claimPage.route.replace(/^\/+|\/+$/g, "");
    const directory = path.join(root, relative);
    await fs.mkdir(path.join(directory, "artifacts"), { recursive: true });
    await fs.writeFile(path.join(directory, "index.html"), page(claimPage.route, claimPage.body));
    await fs.writeFile(
      path.join(directory, "artifacts", "metrics.json"),
      `${JSON.stringify(claimPage.metrics, null, 2)}\n`,
    );
  }

  await fs.writeFile(
    path.join(root, "sitemap.xml"),
    `<?xml version="1.0"?><urlset>${routes
      .map((route) => `<url><loc>${new URL(route, origin).href}</loc></url>`)
      .join("")}</urlset>`,
  );
  return root;
}

test("accepts a coherent static route set", async (t) => {
  const siteRoot = await fixture(t);
  assert.deepEqual(await validateSite({ siteRoot, origin, publicationClaims: false }), []);
});

test("reports broken internal targets and fragments", async (t) => {
  const siteRoot = await fixture(t);
  await fs.writeFile(
    path.join(siteRoot, "index.html"),
    page("/", '<h1>Home</h1><a href="/missing/">Missing</a><a href="/company/#unknown">Unknown</a>'),
  );
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(failures.some((failure) => failure.includes("points to missing /missing/")));
  assert(failures.some((failure) => failure.includes("missing fragment #unknown")));
});

test("resolves directory routes without a trailing slash before checking fragments", async (t) => {
  const siteRoot = await fixture(t);
  await fs.mkdir(path.join(siteRoot, "assets"));
  await fs.writeFile(
    path.join(siteRoot, "index.html"),
    page(
      "/",
      '<h1>Home</h1><a href="/company#unknown">Unknown</a><a href="/assets#missing">No index</a>',
    ),
  );
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(failures.some((failure) => failure.includes("missing fragment #unknown")));
  assert(failures.some((failure) => failure.includes("points to missing /assets")));
});

test("reports canonical and sitemap/indexability contradictions", async (t) => {
  const siteRoot = await fixture(t);
  await fs.writeFile(
    path.join(siteRoot, "company", "index.html"),
    page("/company/", "<h1>Company</h1>", { canonical: "/wrong/", robots: "noindex" }),
  );
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(failures.some((failure) => failure.includes("must not appear in sitemap.xml")));
  assert(failures.some((failure) => failure.includes("does not identify an indexable canonical HTML route")));
});

test("reports a robots policy that blocks public routes", async (t) => {
  const siteRoot = await fixture(t);
  await fs.writeFile(
    path.join(siteRoot, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /company/\nSitemap: ${origin}/sitemap.xml\n`,
  );
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(failures.some((failure) => failure.includes("must not contain a non-empty Disallow")));
});

test("reports malformed HTML and skipped heading levels", async (t) => {
  const siteRoot = await fixture(t);
  await fs.writeFile(
    path.join(siteRoot, "company", "index.html"),
    page("/company/", "<main><h1>Company</h1><h3>Skipped</h3></section>"),
  );
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(failures.some((failure) => failure.includes("expected </main>")));
  assert(failures.some((failure) => failure.includes("heading level jumps from h1 to h3")));
});

test("validates standalone HTML files in a published tools directory", async (t) => {
  const siteRoot = await fixture(t);
  await fs.mkdir(path.join(siteRoot, "tools"));
  await fs.writeFile(
    path.join(siteRoot, "tools", "standalone.html"),
    page("/tools/standalone.html", "<h1>Standalone</h1><h3>Skipped</h3>", {
      robots: "noindex",
    }),
  );
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(
    failures.some(
      (failure) =>
        failure.startsWith("/tools/standalone.html:") &&
        failure.includes("heading level jumps from h1 to h3"),
    ),
  );
});

test("reports symlinks in the published tree", async (t) => {
  const siteRoot = await fixture(t);
  try {
    await fs.symlink(path.join(siteRoot, "index.html"), path.join(siteRoot, "linked-index.html"));
  } catch (error) {
    t.skip(`symlinks unavailable: ${error.message}`);
    return;
  }
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(failures.some((failure) => failure.includes("symbolic links are not allowed")));
});

test("reports unapproved or unpinned external scripts", async (t) => {
  const siteRoot = await fixture(t);
  await fs.writeFile(
    path.join(siteRoot, "index.html"),
    page(
      "/",
      '<h1>Home</h1><script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>',
    ),
  );
  const failures = await validateSite({ siteRoot, origin, publicationClaims: false });
  assert(
    failures.some((failure) => failure.includes("not an approved version-pinned external script")),
  );
  assert(failures.some((failure) => failure.includes("crossorigin=anonymous")));
});

test("binds metric claims to their public fields instead of matching decoy copy", async (t) => {
  const mutations = [
    {
      name: "quadrature abstract improvement",
      file: "results/quadrature-rule-optimization/index.html",
      from: "improves the objective by 83.37%",
      to: "improves the objective by 99.99%",
      key: "improvement_pct",
    },
    {
      name: "RCPSP accepted score",
      file: "results/rcpsp-psplib-j30/index.html",
      from: '<p class="result-outcome-value">10.108<span>',
      to: '<p class="result-outcome-value">999.999<span>',
      key: "best",
    },
    {
      name: "RCPSP accepted delta",
      file: "results/rcpsp-psplib-j30/index.html",
      from: "<span>−29.37%</span>",
      to: "<span>−99.99%</span>",
      key: "improvement_pct",
    },
    {
      name: "RCPSP feasibility count",
      file: "results/rcpsp-psplib-j30/index.html",
      from: "feasible with 80 out of 80 schedules",
      to: "feasible with 79 out of 80 schedules",
      key: "instances_evaluated",
    },
    {
      name: "qubit CNOT reduction",
      file: "results/qubit-routing-lightsabre/index.html",
      from: "reduced added CNOTs by 12,294 across",
      to: "reduced added CNOTs by 1 across",
      key: "added_cnot_reduction_vs_lightsabre",
    },
    {
      name: "qubit routing case count",
      file: "results/qubit-routing-lightsabre/index.html",
      from: "across 72 public routing cases",
      to: "across 7 public routing cases",
      key: "total_cases",
    },
    {
      name: "BESS mean uplift",
      file: "results/iberian-bess-policy-challenge/index.html",
      from: '<text class="bess-kpi-value">€20.20/day</text>',
      to: '<text class="bess-kpi-value">€99.99/day</text>',
      key: "uplift_vs_quantile_dispatch_baseline_mean_eur",
    },
    {
      name: "BESS guardrail count",
      file: "results/iberian-bess-policy-challenge/index.html",
      from: '<text class="bess-kpi-value">0 breaches</text>',
      to: '<text class="bess-kpi-value">9 breaches</text>',
      key: "constraint_breach_count",
    },
  ];

  for (const mutation of mutations) {
    await t.test(mutation.name, async (t) => {
      const siteRoot = await publicationFixture(t);
      assert.deepEqual(await validateSite({ siteRoot, origin }), []);
      const target = path.join(siteRoot, mutation.file);
      const before = await fs.readFile(target, "utf8");
      assert(before.includes(mutation.from), `fixture is missing ${mutation.from}`);
      await fs.writeFile(target, before.replace(mutation.from, mutation.to));
      const failures = await validateSite({ siteRoot, origin });
      assert(
        failures.some((failure) => failure.includes(`for ${mutation.key}`)),
        failures.join("\n"),
      );
    });
  }
});

test("parses an explicit site root and rejects ambiguous CLI arguments", () => {
  const siteRoot = path.join("relative", "site");
  assert.equal(parseCliArguments(["--site-root", siteRoot]).siteRoot, path.resolve(siteRoot));
  assert.throws(() => parseCliArguments(["--site-root"]), /requires a path/);
  assert.throws(
    () => parseCliArguments(["--site-root", siteRoot, "--site-root", siteRoot]),
    /only be provided once/,
  );
  assert.throws(() => parseCliArguments(["--unknown"]), /unknown argument/);
});
