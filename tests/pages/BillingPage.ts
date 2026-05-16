import { type Page, expect } from "@playwright/test";

export class BillingPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/settings/billing");
  }

  async waitForLoad() {
    await expect(this.page.getByRole("heading", { name: /billing/i })).toBeVisible();
  }

  currentPlanLabel() {
    return this.page.getByText(/current plan|free|starter|growth/i).first();
  }

  upgradeButton(plan: "Starter" | "Growth") {
    return this.page.getByRole("button", { name: new RegExp(`upgrade.*${plan}|${plan}.*upgrade`, "i") }).or(
      this.page.locator("button").filter({ hasText: new RegExp(plan, "i") })
    ).first();
  }

  manageBillingButton() {
    return this.page.getByRole("button", { name: /manage billing|customer portal/i });
  }

  upgradeModal() {
    return this.page.getByRole("dialog").filter({ hasText: /limit|upgrade/i });
  }
}
