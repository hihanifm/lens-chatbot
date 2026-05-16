import { mkdirSync } from "fs";

const dataDir = process.env.DATA_DIR ?? "./e2e/.data";
mkdirSync(dataDir, { recursive: true });

const port = Number(process.env.PORT ?? 3099);
const { createApp } = await import("../src/app.js");
const { MockBugTracker } = await import("../src/services/bugTracker.js");
const { StubAgentRunner } = await import("./stubAgentRunner.js");

// Seed a fixed test user so e2e tests can bypass the login gate
const { users } = await import("../src/db.js");
export const E2E_USER = { name: "TestUser", pin: "0000", id: "" };
const existing = users.getByName(E2E_USER.name);
if (existing) {
  E2E_USER.id = existing.id;
} else {
  const { createHash } = await import("crypto");
  const pinHash = createHash("sha256").update(E2E_USER.pin).digest("hex");
  const created = users.create(E2E_USER.name, pinHash);
  E2E_USER.id = created.id;
}
console.log(`E2E test user: ${E2E_USER.name} id=${E2E_USER.id}`);

createApp(new MockBugTracker(), new StubAgentRunner()).listen(port, () => {
  console.log(`E2E server listening on port ${port}`);
});
