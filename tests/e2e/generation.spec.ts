import { test, expect } from "@playwright/test";
import { ProjectPage } from "../pages/ProjectPage";

test.describe("AI Generation", () => {
  test("generate button produces draft content in editor", async ({ page }) => {
    const project = new ProjectPage(page);
    await project.createProject(`Playwright Gen Test — ${Date.now()}`);
    await project.detectSections();

    // Click first section in sidebar
    const sections = project.sidebarSections();
    await sections.first().click();

    // Click Generate
    const generateBtn = project.generateButton();
    await expect(generateBtn).toBeVisible({ timeout: 10_000 });
    await generateBtn.click();

    // Editor should eventually have text content (streamed in)
    const editor = project.editor();
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await expect(editor).not.toBeEmpty({ timeout: 60_000 });
  });
});
