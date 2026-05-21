import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  testIgnore: ["**/live.spec.ts"],
  use: {
    baseURL: "http://localhost:3099",
  },
  webServer: {
    // Build the React UI first so e2e/server.ts (via createApp) serves
    // frontend/dist instead of the retired static/ bundle.
    command:
      "npm run ui:build && DATA_DIR=./e2e/.data PORT=3099 npx tsx e2e/server.ts",
    url: "http://localhost:3099",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
