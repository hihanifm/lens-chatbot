import { config as dotenv } from "dotenv";
import { existsSync } from "fs";
dotenv({ path: existsSync(".env") ? ".env" : ".env.example" });
import { createApp } from "./app.js";
import { MockBugTracker } from "./services/bugTracker.js";
import { ClineSdkAgentRunner } from "./agent/clineSdkRunner.js";

// Swap MockBugTracker → InternalBugTracker when API is ready
const app = createApp(new MockBugTracker(), new ClineSdkAgentRunner());

const port = process.env.PORT ?? 3000;
const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
app.listen(port, () => console.log(`Lens chatbot listening on port ${port} → ${publicUrl}`));
