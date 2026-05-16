import { test, expect } from "@playwright/test";
import { ProjectPage } from "../pages/ProjectPage";

const TEST_TITLE = `Playwright Test — ${Date.now()}`;

test.describe("RFP Projects", () => {
  test("page title is 'Proposals | PropelRFP'", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveTitle(/Proposals \| PropelRFP/);
  });

  test("New proposal button navigates to /projects/new", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /new proposal/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/);
  });

  test("can create a new project", async ({ page }) => {
    const project = new ProjectPage(page);
    await project.createProject(TEST_TITLE);

    // Should land on the project editor page
    await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+$/);
  });

  test("detect sections populates the sidebar", async ({ page }) => {
    const project = new ProjectPage(page);
    await project.createProject(`${TEST_TITLE} — sections`);

    await project.detectSections();

    // At least one section should appear in the sidebar
    const sections = project.sidebarSections();
    await expect(sections.first()).toBeVisible({ timeout: 30_000 });
    expect(await sections.count()).toBeGreaterThan(0);
  });
});
