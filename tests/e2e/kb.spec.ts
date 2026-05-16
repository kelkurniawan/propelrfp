import { test, expect } from "@playwright/test";
import { KbPage } from "../pages/KbPage";
import path from "path";
import fs from "fs";
import os from "os";

// Create a minimal PDF fixture on the fly (plain text file renamed .txt — swap for real PDF in CI)
function createTextFixture(name: string, content: string): string {
  const filePath = path.join(os.tmpdir(), name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test.describe("Knowledge Base", () => {
  test("page title is 'Knowledge Base | PropelRFP'", async ({ page }) => {
    await page.goto("/kb");
    await expect(page).toHaveTitle(/Knowledge Base \| PropelRFP/);
  });

  test("heading and usage meter are visible", async ({ page }) => {
    const kb = new KbPage(page);
    await kb.goto();
    await kb.waitForLoad();

    // Usage meter (progress bar) should be visible
    const meter = page.locator("progress, [role='progressbar'], .h-2, .h-3").first();
    await expect(meter).toBeVisible();
  });

  test("file input is present for upload", async ({ page }) => {
    const kb = new KbPage(page);
    await kb.goto();
    await kb.waitForLoad();

    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached();
  });
});
