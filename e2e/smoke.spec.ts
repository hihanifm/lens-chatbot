import { test, expect } from "@playwright/test";

test("home loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#bug-id-input")).toBeVisible();
  await expect(page.locator("#load-bug-btn")).toBeVisible();
});

test("load bug shows details", async ({ page }) => {
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-title")).toContainText("IMS Registration Failure");
});

test("download enables chat", async ({ page }) => {
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-info")).toBeVisible();
  await page.locator("#attachments .attachment-btn").filter({ hasText: "modem_log.txt" }).click();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/attachment/att-1") && r.ok()),
    page.locator(".att-menu").getByRole("button", { name: "Download to workspace" }).click(),
  ]);
  await expect(page.locator("#question-input")).toBeEnabled();
});

test("analyze streams reply", async ({ page }) => {
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-info")).toBeVisible();
  await page.locator("#attachments .attachment-btn").filter({ hasText: "modem_log.txt" }).click();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/attachment/att-1") && r.ok()),
    page.locator(".att-menu").getByRole("button", { name: "Download to workspace" }).click(),
  ]);
  await expect(page.locator("#question-input")).toBeEnabled();
  await page.locator("#question-input").fill("What failed?");
  await page.locator("#send-btn").click();
  await expect(page.locator(".msg.assistant")).toContainText("E2E mock analysis", { timeout: 15_000 });
});
