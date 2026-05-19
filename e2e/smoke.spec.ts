import { test, expect, type Page } from "@playwright/test";

const TEST_USER_ID_KEY = "lens_user_id";

// Fetch the seeded test user id from the running server
let testUserId: string;
test.beforeAll(async ({ request }) => {
  const res = await request.post("/auth", { data: { name: "TestUser", pin: "0000" } });
  const body = await res.json();
  testUserId = body.id;
});

async function seedAuth(page: Page) {
  await page.goto("/login.html");
  await page.evaluate((id) => localStorage.setItem("lens_user_id", id), testUserId);
}

async function ensureModemLogSelected(page: Page) {
  await page.locator("#attachments .attachment-btn").filter({ hasText: "modem_log.txt" }).click();
  const menu = page.locator(".att-menu");
  const download = menu.locator("button").filter({ hasText: "Download to workspace" });
  const addToChat = menu.locator("button").filter({ hasText: "Add to chat" });
  if (await download.count()) {
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/attachment/att-1") && r.ok()),
      download.click(),
    ]);
  } else if (await addToChat.count()) {
    await addToChat.click();
  } else {
    await page.mouse.click(1, 1);
  }
  await expect(page.locator("#question-input")).toBeEnabled();
  await expect(page.locator("#context-bar")).toContainText("modem_log.txt");
}

test("adhoc session enables chat without files in context", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#tab-adhoc").click();
  await page.locator("#adhoc-title-input").fill("E2E adhoc chat");
  await page.locator("#adhoc-create-btn").click();
  await expect(page.locator("#question-input")).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator("#send-btn")).toBeEnabled();
});

test("adhoc upload shows global progress banner", async ({ page }) => {
  await seedAuth(page);
  await page.route("**/session/*/upload", async (route) => {
    await new Promise((r) => setTimeout(r, 800));
    await route.continue();
  });
  await page.goto("/");
  await page.locator("#tab-adhoc").click();
  await page.locator("#adhoc-title-input").fill("E2E upload test");
  await page.locator("#adhoc-files-input").setInputFiles({
    name: "tiny.log",
    mimeType: "text/plain",
    buffer: Buffer.from("e2e upload line\n"),
  });
  await page.locator("#adhoc-create-btn").click();
  await expect(page.locator("#upload-banner")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#upload-banner-text")).not.toBeEmpty();
});

test("home loads", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await expect(page.locator("#bug-id-input")).toBeVisible();
  await expect(page.locator("#load-bug-btn")).toBeVisible();
});

test("explorer bulk download and collapsed internals", async ({ page }) => {
  test.setTimeout(120_000);
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-title")).toContainText("IMS Registration Failure");

  await page.locator("#explorer-btn").click();
  await expect(page.locator("#explorer-drawer")).toHaveClass(/open/);

  await page.locator("#main").click();
  await expect(page.locator("#explorer-drawer")).not.toHaveClass(/open/);

  await page.locator("#explorer-btn").click();
  await expect(page.locator("#explorer-drawer")).toHaveClass(/open/);

  const internalsBody = page.locator(
    '.exp-collapsible-header:has-text("Workspace Internals") + .exp-collapsible-body'
  );
  await expect(internalsBody).toBeHidden();

  const bugDownloadAll = page.locator(".exp-section-header-row .exp-bulk-btn").first();
  await expect(bugDownloadAll).toBeEnabled();
  await bugDownloadAll.click();
  await expect(page.locator("#chat .msg.status").filter({ hasText: /Downloaded \d+ file/ })).toBeVisible({
    timeout: 90_000,
  });

  await page.locator('.exp-collapsible-header:has-text("Workspace Internals")').click();
  await expect(internalsBody).toBeVisible();
});

test("load bug shows details", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-title")).toContainText("IMS Registration Failure");
});

test("download enables chat", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-info")).toBeVisible();
  await ensureModemLogSelected(page);
});

test("analyze streams reply", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-info")).toBeVisible();
  await ensureModemLogSelected(page);
  await page.locator("#question-input").fill("What failed?");
  await page.locator("#send-btn").click();
  await expect(page.locator(".msg.assistant")).toContainText("E2E mock analysis", { timeout: 15_000 });
});

test("ls reply contains workspace path not skill paths", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-info")).toBeVisible();
  // download attachment so the question input is enabled
  await ensureModemLogSelected(page);
  await page.locator("#question-input").fill("ls");
  await page.locator("#send-btn").click();
  // stub echoes workspacePath for ls — must contain the bug ID, not skill paths
  await expect(page.locator(".msg.assistant")).toContainText("BUG-123", { timeout: 15_000 });
  await expect(page.locator(".msg.assistant")).not.toContainText("/app/skills");
});

test("analyze this uses downloaded attachment context", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-info")).toBeVisible();
  await ensureModemLogSelected(page);
  await page.locator("#question-input").fill("analyze this");
  await page.locator("#send-btn").click();
  await expect(page.locator(".msg.assistant")).toContainText("attachments/modem_log.txt", { timeout: 15_000 });
});

test("engineering log shows per-command tool_command lines", async ({ page }) => {
  await seedAuth(page);
  await page.goto("/");
  await page.locator("#bug-id-input").fill("BUG-123");
  await page.locator("#load-bug-btn").click();
  await expect(page.locator("#bug-info")).toBeVisible();
  await ensureModemLogSelected(page);
  await page.locator("#question-input").fill("__tool_command_test__");
  await page.locator("#send-btn").click();
  await expect(page.locator(".eng-log-line.cmd-ok")).toContainText("✓ echo ok", { timeout: 15_000 });
  await expect(page.locator(".eng-log-line.cmd-fail")).toContainText("✗ exit 1");
  await expect(page.locator(".eng-log.eng-log-has-failures .eng-log-failure-badge")).toBeVisible();
});

test("shared session: two tabs see same session and broadcast", async ({ browser }) => {
  // Two separate browser contexts (Tab A and Tab B)
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Seed auth for both
  await pageA.goto("/login.html");
  await pageA.evaluate((id) => localStorage.setItem("lens_user_id", id), testUserId);
  await pageB.goto("/login.html");
  await pageB.evaluate((id) => localStorage.setItem("lens_user_id", id), testUserId);

  // Tab A loads the bug
  await pageA.goto("/");
  await pageA.locator("#bug-id-input").fill("BUG-123");
  await pageA.locator("#load-bug-btn").click();
  await expect(pageA.locator("#bug-title")).toContainText("IMS Registration Failure");
  const sessionIdA = await pageA.evaluate(() => (window as any).currentSessionId);

  // Tab B loads the same bug — should get the same session id
  await pageB.goto("/");
  await pageB.locator("#bug-id-input").fill("BUG-123");
  await pageB.locator("#load-bug-btn").click();
  await expect(pageB.locator("#bug-title")).toContainText("IMS Registration Failure");
  const sessionIdB = await pageB.evaluate(() => (window as any).currentSessionId);

  expect(sessionIdA).toBe(sessionIdB);

  // Download attachment and send a question on Tab A
  await ensureModemLogSelected(pageA);
  await pageA.locator("#question-input").fill("What failed?");
  await pageA.locator("#send-btn").click();

  // Tab A should see its own reply
  await expect(pageA.locator(".msg.assistant")).toContainText("E2E mock analysis", { timeout: 15_000 });

  // Tab B should receive the question and the assistant reply via broadcast
  await expect(pageB.locator(".msg.user")).toContainText("What failed?", { timeout: 10_000 });
  await expect(pageB.locator(".msg.assistant")).toContainText("E2E mock analysis", { timeout: 15_000 });

  await ctxA.close();
  await ctxB.close();
});
