/**
 * Smoke test — fast end-to-end path through the entire app.
 * Run this against staging before every production deploy:
 *
 *   BASE_URL=https://your-staging.vercel.app \
 *   TEST_USER_EMAIL=test@example.com \
 *   TEST_USER_PASSWORD=yourpassword \
 *   pnpm test:e2e:smoke
 */

import { test, expect } from "@playwright/test";
import { DashboardPage } from "../pages/DashboardPage";
import { KbPage } from "../pages/KbPage";
import { ProjectPage } from "../pages/ProjectPage";
import { BillingPage } from "../pages/BillingPage";

const RUN_ID = Date.now();

test.describe("Smoke — full happy path", () => {
  test("1. Dashboard loads with correct title", async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(page).toHaveTitle(/Dashboard \| PropelRFP/);
    await dashboard.waitForLoad();
  });

  test("2. Knowledge Base page loads", async ({ page }) => {
    const kb = new KbPage(page);
    await kb.goto();
    await expect(page).toHaveTitle(/Knowledge Base \| PropelRFP/);
    await kb.waitForLoad();
  });

  test("3. Can create an RFP project", async ({ page }) => {
    const project = new ProjectPage(page);
    await project.createProject(`Smoke Test ${RUN_ID}`);
    await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+$/);
  });

  test("4. Section detection works", async ({ page }) => {
    const project = new ProjectPage(page);
    await project.createProject(`Smoke Sections ${RUN_ID}`);
    await project.detectSections();

    const sections = project.sidebarSections();
    await expect(sections.first()).toBeVisible({ timeout: 30_000 });
  });

  test("5. AI generation produces draft text", async ({ page }) => {
    const project = new ProjectPage(page);
    await project.createProject(`Smoke Gen ${RUN_ID}`);
    await project.detectSections();

    await project.sidebarSections().first().click();
    await project.generateButton().click();

    await expect(project.editor()).not.toBeEmpty({ timeout: 60_000 });
  });

  test("6. Proposals page loads with correct title", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveTitle(/Proposals \| PropelRFP/);
  });

  test("7. Billing page loads with correct title", async ({ page }) => {
    const billing = new BillingPage(page);
    await billing.goto();
    await expect(page).toHaveTitle(/Billing \| PropelRFP/);
    await billing.waitForLoad();
  });

  test("8. Unauthenticated access to /dashboard redirects to /login", async ({ browser }) => {
    const context = await browser.newContext(); // no stored auth
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
