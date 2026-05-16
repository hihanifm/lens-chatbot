import { createApp } from "../src/app.js";
import { MockBugTracker } from "../src/services/bugTracker.js";
import { StubAgentRunner } from "./stubAgentRunner.js";

const port = Number(process.env.PORT ?? 3099);
createApp(new MockBugTracker(), new StubAgentRunner()).listen(port, () => {
  console.log(`E2E server listening on port ${port}`);
});
