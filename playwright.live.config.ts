import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "live.spec.ts",
  timeout: 180_000,
  globalSetup: "./e2e/global-setup.live.ts",
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command:
      "DATA_DIR=./e2e/.live-data PORT=3100 LLM_BASE_URL=http://127.0.0.1:11434/v1 npx tsx e2e/liveServer.ts",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
  },
});
