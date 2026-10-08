import { expect, test } from "@playwright/test";

const REPRESENTATIVE_TABLES = [
  {
    path: "/results/quadrature-rule-optimization/",
    selector: ".result-whitepaper .result-paper-table .result-table",
    minimumTables: 3,
  },
  {
    path: "/results/rcpsp-psplib-j30/",
    selector: ".result-whitepaper .result-paper-table .result-table",
    minimumTables: 3,
  },
  {
    path: "/results/verified-rtl-optimization/",
    selector: ".rtl-data-table",
    minimumTables: 5,
  },
];

function semanticSnapshot(table) {
  return table.evaluate((element) => {
    const columnHeaders = [...element.querySelectorAll("thead th")];
    const rows = [...element.querySelectorAll("tbody tr")];
    return {
      columnHeaders: columnHeaders.map((header) => ({
        id: header.id,
        scope: header.getAttribute("scope"),
        text: header.textContent.trim(),
      })),
      rows: rows.map((row) => {
        const rowHeader = row.querySelector("th[scope='row']");
        const dataCells = [...row.querySelectorAll("td")];
        return {
          rowHeader: rowHeader
            ? {
                id: rowHeader.id,
                scope: rowHeader.getAttribute("scope"),
                headers: rowHeader.getAttribute("headers") ?? "",
                text: rowHeader.textContent.trim(),
              }
            : null,
          dataCells: dataCells.map((cell) => ({
            headers: cell.getAttribute("headers") ?? "",
            text: cell.textContent.trim(),
          })),
        };
      }),
    };
  });
}

for (const surface of REPRESENTATIVE_TABLES) {
  test(`${surface.path} exposes explicit row and column table context`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "normal-motion-smoke");

    await page.goto(surface.path, { waitUntil: "networkidle" });
    const tables = page.locator(surface.selector);
    expect(await tables.count()).toBeGreaterThanOrEqual(surface.minimumTables);

    for (let tableIndex = 0; tableIndex < (await tables.count()); tableIndex += 1) {
      const table = tables.nth(tableIndex);
      const snapshot = await semanticSnapshot(table);
      expect(snapshot.columnHeaders.length, `${surface.path} table ${tableIndex + 1}: column headers`).toBeGreaterThan(0);
      for (const header of snapshot.columnHeaders) {
        expect(header.scope, `${surface.path}: ${header.text} column scope`).toBe("col");
        expect(header.id, `${surface.path}: ${header.text} column id`).not.toBe("");
      }

      for (const [rowIndex, row] of snapshot.rows.entries()) {
        expect(row.rowHeader, `${surface.path} table ${tableIndex + 1} row ${rowIndex + 1}: row header`).not.toBeNull();
        expect(row.rowHeader.scope).toBe("row");
        expect(row.rowHeader.id).not.toBe("");
        expect(row.rowHeader.headers.split(/\s+/)).toContain(snapshot.columnHeaders[0].id);

        for (const [cellIndex, cell] of row.dataCells.entries()) {
          const ids = cell.headers.split(/\s+/).filter(Boolean);
          expect(ids, `${surface.path} row ${rowIndex + 1} cell ${cellIndex + 2}: row context`).toContain(row.rowHeader.id);
          expect(ids, `${surface.path} row ${rowIndex + 1} cell ${cellIndex + 2}: column context`).toContain(
            snapshot.columnHeaders[cellIndex + 1].id,
          );
        }
      }
    }
  });
}
