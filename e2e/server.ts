import { mkdirSync } from "fs";

const dataDir = process.env.DATA_DIR ?? "./e2e/.data";
mkdirSync(dataDir, { recursive: true });

const port = Number(process.env.PORT ?? 3099);
const { createApp } = await import("../src/app.js");
const { MockBugTracker } = await import("../src/services/bugTracker.js");
const { StubAgentRunner } = await import("./stubAgentRunner.js");

createApp(new MockBugTracker(), new StubAgentRunner()).listen(port, () => {
  console.log(`E2E server listening on port ${port}`);
});
