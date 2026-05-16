import { type Page, expect } from "@playwright/test";

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/dashboard");
  }

  async waitForLoad() {
    await expect(this.page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  }

  statsCards() {
    return this.page.locator("[data-testid='stats-card'], .stats-card, .rounded-lg").first();
  }

  newProposalButton() {
    return this.page.getByRole("link", { name: /new proposal/i });
  }

  emptyState() {
    return this.page.getByText(/no proposals yet/i);
  }
}
