import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createServer } from "../server.mjs";
await mkdir("artifacts", { recursive: true });
const server = createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
const checks = [],
  errors = [];
try {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1512, height: 1080 },
  });
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText("1 matching record", { exact: true }).waitFor();
  await page.locator("#preview h2").filter({ hasText: "PO-0101" }).waitFor();
  checks.push(
    "Scoped search loads the expected purchase order and record preview",
  );
  await page.locator("#preset-name").fill("Cedar overdue");
  await page.locator("#save-preset").click();
  await page.locator("#query").fill("nonexistent");
  await page.getByRole("button", { name: "Find records" }).click();
  await page
    .getByText("No records match this scope.", { exact: false })
    .waitFor();
  await page.locator("#presets").selectOption("0");
  await page.getByText("1 matching record", { exact: true }).waitFor();
  checks.push("Empty search and saved preset restore");
  await page.screenshot({ path: "artifacts/desktop.png", fullPage: true });
  await page.route("**/api", async (route) => {
    if (route.request().postDataJSON().action === "search")
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Source unavailable" }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Find records" }).click();
  await page.getByText("Search not completed", { exact: true }).waitFor();
  assert.equal(await page.locator("#preview h2").count(), 0);
  checks.push("Failed search clears previous record details");
  await page.unroute("**/api");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  checks.push("390px layout has no document overflow");
  const offline = await browser.newPage();
  offline.setDefaultTimeout(10000);
  offline.on("pageerror", (e) => errors.push(e.message));
  const requests = [];
  offline.on("request", (r) => {
    if (/^https?:/.test(r.url())) requests.push(r.url());
  });
  await offline.goto(pathToFileURL(resolve("dist/demo.html")).href);
  await offline.getByText("1 matching record", { exact: true }).waitFor();
  await offline.locator("#preview h2").filter({ hasText: "PO-0101" }).waitFor();
  assert.deepEqual(requests, []);
  checks.push(
    "Standalone demo completes the main workflow without network requests",
  );
  assert.deepEqual(errors, []);
  checks.push("No browser JavaScript errors");
  const evidence = {
    date: new Date().toISOString(),
    browser: browser.version(),
    checks,
    errors,
    scope:
      "Standalone fictional-data workflows. Native NetSuite validation not performed.",
  };
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
