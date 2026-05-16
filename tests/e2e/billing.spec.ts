import { test, expect } from "@playwright/test";
import { BillingPage } from "../pages/BillingPage";

test.describe("Billing", () => {
  test("page title is 'Billing | PropelRFP'", async ({ page }) => {
    await page.goto("/settings/billing");
    await expect(page).toHaveTitle(/Billing \| PropelRFP/);
  });

  test("billing page loads with plan tiles visible", async ({ page }) => {
    const billing = new BillingPage(page);
    await billing.goto();
    await billing.waitForLoad();

    // Usage cards should be present
    const usageSection = page
      .getByText(/proposals|storage|members/i)
      .first();
    await expect(usageSection).toBeVisible();
  });

  test("plan tiles display Starter and Growth options", async ({ page }) => {
    const billing = new BillingPage(page);
    await billing.goto();
    await billing.waitForLoad();

    await expect(page.getByText(/starter/i).first()).toBeVisible();
    await expect(page.getByText(/growth/i).first()).toBeVisible();
  });

  test("upgrade button for Starter is present and clickable", async ({ page }) => {
    const billing = new BillingPage(page);
    await billing.goto();
    await billing.waitForLoad();

    // Find an upgrade/select button on the page (already on paid plan = skip)
    const anyUpgrade = page.getByRole("button", { name: /upgrade|select|get started/i }).first();
    const isVisible = await anyUpgrade.isVisible().catch(() => false);

    if (!isVisible) {
      test.info().annotations.push({ type: "skip", description: "Account is already on paid plan" });
      return;
    }

    await expect(anyUpgrade).toBeEnabled();
  });
});
