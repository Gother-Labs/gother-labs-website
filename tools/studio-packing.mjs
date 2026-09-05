import fs from "node:fs/promises";
import path from "node:path";

// Display geometry comes from the published certificate; the browser does not
// reconstruct, optimize, or certify it. Keep the exact decimals in data-radius.
export async function studioPackingFigure(siteRoot) {
  const resultRoot = path.join(siteRoot, "results/circle-packing-26-unit-square");
  const csv = await fs.readFile(path.join(resultRoot, "artifacts/exact.csv"), "utf8");
  const source = await fs.readFile(path.join(resultRoot, "assets/exact-packing-contact-graph.svg"), "utf8");
  const rows = csv.trim().split(/\r?\n/).slice(1).map(line => line.split(","));
  if (rows.length !== 26 || rows.some(row => row.length !== 4 || row.some(value => !Number.isFinite(Number(value))))) {
    throw new Error("Unexpected published circle-packing certificate.");
  }
  const circles = [];
  const centers = [];
  for (const [id, x, y, radius] of rows) {
    const cx = (20 + Number(x) * 460).toFixed(6);
    const cy = (20 + (1 - Number(y)) * 460).toFixed(6);
    const r = (Number(radius) * 460).toFixed(6);
    const selected = id === "12" ? " is-selected" : "";
    circles.push(`<circle class="packing-circle${selected}" data-circle="${id}" data-radius="${radius}" cx="${cx}" cy="${cy}" r="${r}"><title>Circle ${id}; radius ${Number(radius).toFixed(6)}</title></circle>`);
    centers.push(`<circle class="packing-center${selected}" data-center="${id}" cx="${cx}" cy="${cy}" r="1.7"/>`);
  }
  const contacts = [];
  for (const group of ["pair-contacts", "wall-contacts"]) {
    const content = source.match(new RegExp(`<g id="${group}"[^>]*>([\\s\\S]*?)</g>`))?.[1];
    if (!content) throw new Error(`Missing published contact group: ${group}`);
    for (const match of content.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)) {
      const values = match.slice(1).map(value => (20 + (Number(value) - 60) * 460 / 780).toFixed(6));
      contacts.push(`<line ${["x1", "y1", "x2", "y2"].map((key, i) => `${key}="${values[i]}"`).join(" ")}/>`);
    }
  }
  if (contacts.length !== 78) throw new Error("Unexpected published contact count.");
  return `<svg class="studio-packing" viewBox="0 0 500 500" role="img" aria-labelledby="packing-title packing-description">
<title id="packing-title">The published 26-circle packing</title><desc id="packing-description">Variable-radius circles inside a unit square, drawn from the exact rational certificate. The 58 circle contacts and 20 wall contacts are shown together with the circles.</desc>
<rect class="packing-boundary" x="20" y="20" width="460" height="460"/>
${circles.join("\n")}
<g class="packing-contacts">${contacts.join("\n")}</g>
${centers.join("\n")}</svg>`;
}
