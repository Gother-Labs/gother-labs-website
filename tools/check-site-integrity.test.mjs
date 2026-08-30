import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { validateSite } from "./check-site-integrity.mjs";

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
    page("/", '<h1>Home</h1><a href="/company/#about">Company</a>'),
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
