import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const app = process.env.TEXTUS_REPO || resolve("../Textus");
const port = Number(process.env.PLAYWRIGHT_PORT || 1574);
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  outputDir: "../../test-results/cloud-sync",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1180, height: 820 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    cwd: app,
    url: `http://127.0.0.1:${port}`,
    timeout: 60000,
    reuseExistingServer: true,
  },
});
