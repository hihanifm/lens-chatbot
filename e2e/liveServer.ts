import { config as dotenv } from "dotenv";
import { existsSync, mkdirSync } from "fs";

dotenv({ path: existsSync(".env") ? ".env" : ".env.example" });

const dataDir = process.env.DATA_DIR ?? "./e2e/.live-data";
mkdirSync(dataDir, { recursive: true });

const port = Number(process.env.PORT ?? 3100);
const { createApp } = await import("../src/app.js");
const { MockBugTracker } = await import("../src/services/bugTracker.js");
const { ClineSdkAgentRunner } = await import("../src/agent/clineSdkRunner.js");

createApp(new MockBugTracker(), new ClineSdkAgentRunner()).listen(port, () => {
  console.log(`Live E2E server listening on port ${port}`);
});
