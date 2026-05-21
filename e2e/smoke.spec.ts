import { test, expect, type Page } from "@playwright/test";

// Smoke suite for the React UI (frontend/). Drives the rewritten SPA: login is
// localStorage-seeded, routing is client-side, message bubbles carry
// data-testid hooks. The legacy DOM-coupled suite was retired with the rewrite.

let testUserId: string;
test.beforeAll(async ({ request }) => {
  const res = await request.post("/auth", { data: { name: "TestUser", pin: "0000" } });
  testUserId = (await res.json()).id;
});

// Seed the auth keys the React app hydrates from, then land on Home.
async function seedAndGoHome(page: Page) {
  await page.goto("/login");
  await page.evaluate((id) => {
    localStorage.setItem("lens_user_id", id);
    localStorage.setItem("lens_user_name", "TestUser");
  }, testUserId);
  await page.goto("/");
  await expect(page.locator("#adhoc-title-input")).toBeVisible({ timeout: 10_000 });
}

test("home loads after login", async ({ page }) => {
  await seedAndGoHome(page);
  await expect(page.locator("#bug-id-input")).toBeVisible();
  await expect(page.locator("#load-bug-btn")).toBeVisible();
  await expect(page.locator("#adhoc-create-btn")).toBeVisible();
});

test("adhoc session enables the composer", async ({ page }) => {
  await seedAndGoHome(page);
  await page.locator("#adhoc-title-input").fill("E2E adhoc chat");
  await page.locator("#adhoc-create-btn").click();
  await expect(page).toHaveURL(/\/session\//, { timeout: 10_000 });
  await expect(page.locator("#question-input")).toBeEnabled();
  await expect(page.locator("#send-btn")).toBeVisible();
});

test("loading a tracked bug opens its session", async ({ page }) => {
  await seedAndGoHome(page);
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page).toHaveURL(/\/session\//, { timeout: 10_000 });
  await expect(page.getByText("IMS Registration Failure")).toBeVisible({ timeout: 10_000 });
});

test("analyze streams an assistant reply", async ({ page }) => {
  await seedAndGoHome(page);
  await page.locator("#adhoc-title-input").fill("E2E analyze");
  await page.locator("#adhoc-create-btn").click();
  await expect(page.locator("#question-input")).toBeEnabled({ timeout: 10_000 });
  await page.locator("#question-input").fill("What failed?");
  await page.locator("#send-btn").click();
  await expect(page.getByTestId("assistant-msg")).toContainText("E2E mock analysis", {
    timeout: 15_000,
  });
});

test("files drawer opens and closes", async ({ page }) => {
  await seedAndGoHome(page);
  await page.locator("#adhoc-title-input").fill("E2E files");
  await page.locator("#adhoc-create-btn").click();
  await expect(page.locator("#question-input")).toBeEnabled({ timeout: 10_000 });

  await page.getByRole("button", { name: /Files/ }).click();
  await expect(page.locator("#explorer-drawer")).toBeVisible();

  await page.locator("#explorer-drawer").getByRole("button", { name: "Close" }).click();
  await expect(page.locator("#explorer-drawer")).toBeHidden();
});
