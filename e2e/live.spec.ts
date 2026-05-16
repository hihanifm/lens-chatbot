import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("analyze streams live LLM reply", async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-title")).toContainText("IMS Registration Failure");
  await expect(page.locator("#bug-info")).toBeVisible();

  await page.locator("#attachments .attachment-btn").filter({ hasText: "modem_log.txt" }).click();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/attachment/att-1") && r.ok()),
    page.locator(".att-menu").getByRole("button", { name: "Download to workspace" }).click(),
  ]);
  await expect(page.locator("#question-input")).toBeEnabled();
  await page.locator("#attachments .attachment-btn").filter({ hasText: "modem_log.txt" }).click();
  await page.locator(".att-menu").getByRole("button", { name: "Add to chat" }).click();

  await page.locator("#question-input").fill("What error appears in the modem log?");
  await page.locator("#send-btn").click();

  const assistant = page.locator(".msg.assistant");
  await expect(assistant).toBeVisible({ timeout: 180_000 });
  await expect(page.locator(".msg.error")).toHaveCount(0);
  await expect(assistant).not.toHaveClass(/streaming/, { timeout: 180_000 });
  await expect
    .poll(async () => (await assistant.textContent())?.trim().length ?? 0)
    .toBeGreaterThan(30);

  const text = await assistant.textContent();
  // Soft check: model engaged with log topic; failure means off-topic, not infra.
  expect(text).toMatch(/modem|DNS|registration|timeout|IMS|log/i);
});
