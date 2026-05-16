import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  testIgnore: ["**/live.spec.ts"],
  use: {
    baseURL: "http://localhost:3099",
  },
  webServer: {
    command: "DATA_DIR=./e2e/.data PORT=3099 npx tsx e2e/server.ts",
    url: "http://localhost:3099",
    reuseExistingServer: !process.env.CI,
  },
});
