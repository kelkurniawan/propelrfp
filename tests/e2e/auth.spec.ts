import { test, expect } from "@playwright/test";

test.describe("Auth", () => {
  test("protected route redirects unauthenticated users to /login", async ({ browser }) => {
    // Fresh context with no stored auth
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("sign out clears session and redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Find and click the sign out button (in nav or user menu)
    const signOutTrigger = page
      .getByRole("button", { name: /sign out|log out/i })
      .or(page.getByRole("menuitem", { name: /sign out|log out/i }));

    // May be inside a dropdown — try opening it first
    const userMenu = page.getByRole("button", { name: /account|user|profile/i });
    if (await userMenu.isVisible().catch(() => false)) {
      await userMenu.click();
    }

    await signOutTrigger.first().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
