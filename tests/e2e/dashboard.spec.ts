import { test, expect } from "@playwright/test";
import { DashboardPage } from "../pages/DashboardPage";

test.describe("Dashboard", () => {
  test("page title is 'Dashboard | PropelRFP'", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveTitle(/Dashboard \| PropelRFP/);
  });

  test("dashboard heading is visible", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();
  });

  test("New proposal button is present", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();
    await expect(dashboard.newProposalButton()).toBeVisible();
  });

  test("shows empty state or proposals table", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    const hasProjects = await page.getByRole("table").isVisible().catch(() => false);
    const hasEmpty = await dashboard.emptyState().isVisible().catch(() => false);

    expect(hasProjects || hasEmpty).toBeTruthy();
  });
});
