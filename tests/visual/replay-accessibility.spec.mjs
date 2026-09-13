import { expect, test } from "@playwright/test";

test("BESS scenario changes are announced and expose the complete textual replay", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "normal-motion-smoke" && testInfo.project.name !== "mobile-light-reduced");

  const response = await page.goto("/results/iberian-bess-policy-challenge/run/", { waitUntil: "networkidle" });
  expect(response?.status()).toBe(200);

  const select = page.locator("#scenario-select");
  const live = page.locator("#scenario-live");
  const summary = page.locator("#selected-scenario-summary");
  const rows = page.locator("#scenario-hourly-data tbody tr");

  await expect(select).toHaveAttribute("aria-controls", "selected-scenario-summary scenario-hourly-data");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveAttribute("aria-atomic", "true");
  await expect(live).toHaveText("");
  await expect(rows).toHaveCount(24);

  for (const label of [
    "Candidate profit",
    "Uplift vs baseline",
    "Regret vs oracle",
    "Terminal SOC error",
    "Feasibility penalty",
    "Simultaneous-power penalty",
    "Constraint breached",
    "Replay valid",
  ]) {
    await expect(summary).toContainText(label);
  }

  const headings = await page.locator("#scenario-hourly-data thead th").allTextContents();
  expect(headings.map((value) => value.trim())).toEqual([
    "Hour",
    "Price (€/MWh)",
    "Charge (MW)",
    "Discharge (MW)",
    "Net action (MW)",
    "SOC (MWh)",
  ]);

  const initialValue = await select.inputValue();
  const values = await select.locator("option").evaluateAll((options) => options.map((option) => option.value));
  const nextValue = values.find((value) => value !== initialValue);
  expect(nextValue).toBeTruthy();

  const initialFirstRow = (await rows.first().textContent())?.replace(/\s+/g, " ").trim();
  await select.selectOption(nextValue);

  await expect(page.locator("#scenario-title")).toContainText(nextValue);
  await expect(live).toContainText(`${nextValue} selected.`);
  await expect(live).toContainText("24 hourly rows updated.");
  await expect(rows).toHaveCount(24);

  const changedFirstRow = (await rows.first().textContent())?.replace(/\s+/g, " ").trim();
  expect(changedFirstRow).not.toBe(initialFirstRow);
  await expect(page.locator("#dispatch-chart")).toHaveAttribute("aria-label", `Dispatch trace for ${nextValue}`);
  await expect(page.locator("#dispatch-chart-summary")).toContainText("complete hourly values are available");

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
