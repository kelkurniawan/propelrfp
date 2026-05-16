import { type Page, expect } from "@playwright/test";
import path from "path";

export class KbPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/kb");
  }

  async waitForLoad() {
    await expect(this.page.getByRole("heading", { name: /knowledge base/i })).toBeVisible();
  }

  dropZone() {
    return this.page.locator("input[type='file']");
  }

  async uploadFile(fixturePath: string) {
    const input = this.dropZone();
    await input.setInputFiles(fixturePath);
  }

  docRow(name: string) {
    return this.page.getByText(name);
  }

  docStatus(name: string) {
    return this.page.locator("tr, [role='row']").filter({ hasText: name }).getByText(/ready|processing|failed/i);
  }

  async waitForStatus(name: string, status: "Ready" | "Failed", timeout = 90_000) {
    await expect(
      this.page.locator("tr, [role='row'], .doc-row").filter({ hasText: name }).getByText(new RegExp(status, "i"))
    ).toBeVisible({ timeout });
  }
}
