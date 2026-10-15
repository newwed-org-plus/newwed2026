import { defineConfig } from "@playwright/test";

const captureRemoteBaselines = process.env.UPDATE_BASELINES === "1" && process.env.BASELINE_CAPTURE_TARGET !== "1";

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: { browserName: "chromium", colorScheme: "light", locale: "pt-BR", timezoneId: "America/Recife" },
  webServer: captureRemoteBaselines || process.env.VISUAL_BASE_URL ? undefined : {
    command: "npm run dev -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
