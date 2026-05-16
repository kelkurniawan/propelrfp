import { test as setup, expect } from "@playwright/test";
import path from "path";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

/**
 * Logs in with TEST_USER_EMAIL + TEST_USER_PASSWORD and saves the auth cookie
 * to tests/.auth/user.json. All other test projects depend on this running first.
 *
 * Required env vars (in .env.test or shell):
 *   TEST_USER_EMAIL    — email of a pre-existing test account
 *   TEST_USER_PASSWORD — password for that account
 */
setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Set TEST_USER_EMAIL and TEST_USER_PASSWORD before running Playwright tests."
    );
  }

  await page.goto("/login");

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Wait until we land on the dashboard (auth guard redirects here on success)
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
