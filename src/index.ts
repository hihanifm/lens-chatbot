import { config as dotenv } from "dotenv";
import { existsSync } from "fs";
dotenv({ path: existsSync(".env") ? ".env" : ".env.example" });
import { createApp, hashPin } from "./app.js";
import { MockBugTracker } from "./services/bugTracker.js";
import { ClineCoreAgentRunner } from "./agent/clineCoreAgentRunner.js";
import { settings } from "./db.js";
import { log } from "./logger.js";

// Swap MockBugTracker → InternalBugTracker when API is ready
const app = createApp(new MockBugTracker(), new ClineCoreAgentRunner());

if (process.env.ADMIN_PIN && !settings.getAdminPinHash()) {
  hashPin(process.env.ADMIN_PIN).then((hash) => settings.setAdminPinHash(hash));
} else if (!settings.getAdminPinHash()) {
  const defaultPin = "admin";
  log.warn("server:admin-pin-default", { hint: `No ADMIN_PIN set — using default PIN "${defaultPin}". Set ADMIN_PIN in .env to change it.` });
  hashPin(defaultPin).then((hash) => settings.setAdminPinHash(hash));
}

const port = process.env.PORT ?? 3000;
const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
app.listen(port, () => log.info("server:listening", { port, publicUrl }));
