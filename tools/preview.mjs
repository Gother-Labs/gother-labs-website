#!/usr/bin/env node
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = 4173;
const port = Number(process.env.PORT || process.argv[2] || DEFAULT_PORT);

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

function contentType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function sitePathFromUrl(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);

  if (pathname.endsWith("/")) {
    pathname += "index.html";
  }

  return pathname.replace(/^\/+/, "");
}

function resolveInsideSiteRoot(sitePath) {
  const resolved = path.resolve(SITE_ROOT, sitePath);

  if (resolved !== SITE_ROOT && !resolved.startsWith(`${SITE_ROOT}${path.sep}`)) {
    return null;
  }

  return resolved;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryIndexExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isDirectory()) {
      return null;
    }

    const indexPath = path.join(filePath, "index.html");
    return (await fileExists(indexPath)) ? indexPath : null;
  } catch {
    return null;
  }
}

async function resolveStaticFile(requestUrl) {
  const requested = resolveInsideSiteRoot(sitePathFromUrl(requestUrl));

  if (!requested) {
    return null;
  }

  if (await fileExists(requested)) {
    return requested;
  }

  return directoryIndexExists(requested);
}

async function serveFile(response, filePath, statusCode = 200) {
  const body = await fs.readFile(filePath);
  response.writeHead(statusCode, {
    "Content-Length": body.byteLength,
    "Content-Type": contentType(filePath),
  });
  response.end(body);
}

async function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const filePath = await resolveStaticFile(request.url ?? "/");
  const finalPath = filePath ?? path.join(SITE_ROOT, "404.html");
  const statusCode = filePath ? 200 : 404;

  if (request.method === "HEAD") {
    response.writeHead(statusCode, {
      "Content-Type": contentType(finalPath),
    });
    response.end();
    return;
  }

  await serveFile(response, finalPath, statusCode);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Preview server running at http://127.0.0.1:${port}/`);
  console.log("Unknown routes fall back to 404.html with status 404.");
});
