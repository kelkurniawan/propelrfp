import { type Page, expect } from "@playwright/test";

const SAMPLE_RFP = `
Request for Proposal — IT Managed Services

1. Executive Summary
Please provide an overview of your company's experience delivering managed IT services
to enterprise clients, including references from the past three years.

2. Technical Approach
Describe your approach to network monitoring, helpdesk operations, and incident response.
Include details on SLAs, escalation paths, and tooling.

3. Pricing
Provide a detailed pricing breakdown for the services described above,
including one-time setup costs and monthly recurring fees.
`;

export class ProjectPage {
  constructor(private page: Page) {}

  async gotoNew() {
    await this.page.goto("/projects/new");
  }

  async gotoList() {
    await this.page.goto("/projects");
  }

  async createProject(title: string) {
    await this.gotoNew();
    await this.page.getByLabel(/title/i).fill(title);
    await this.page.getByLabel(/client/i).fill("Acme Corp");

    const rfpInput = this.page.getByLabel(/rfp text|paste|content/i).or(
      this.page.locator("textarea").first()
    );
    await rfpInput.fill(SAMPLE_RFP);

    await this.page.getByRole("button", { name: /create|save|submit/i }).click();
    await this.page.waitForURL(/\/projects\/[^/]+$/, { timeout: 15_000 });
  }

  async detectSections() {
    await this.page.getByRole("button", { name: /detect sections/i }).click();
    await expect(
      this.page.getByRole("button", { name: /detect sections/i })
    ).not.toBeDisabled({ timeout: 30_000 });
  }

  sidebarSections() {
    return this.page.locator("aside").getByRole("button").or(
      this.page.locator("[data-testid='section-item']")
    );
  }

  generateButton() {
    return this.page.getByRole("button", { name: /generate/i });
  }

  editor() {
    return this.page.locator(".tiptap, [contenteditable='true']");
  }

  async approveSection() {
    const dropdown = this.page.getByRole("combobox").or(
      this.page.getByRole("button", { name: /draft|in review|approved/i })
    ).first();
    await dropdown.selectOption("approved").catch(async () => {
      await dropdown.click();
      await this.page.getByRole("option", { name: /approved/i }).click();
    });
  }

  exportButton() {
    return this.page.getByRole("button", { name: /export/i });
  }
}
