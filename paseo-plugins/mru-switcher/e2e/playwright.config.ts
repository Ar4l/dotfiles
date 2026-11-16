import { defineConfig } from "@playwright/test";

// Run through e2e/run.sh, which boots the throwaway daemon and sets these variables.
export default defineConfig({
  testDir: ".",
  workers: 1,
  timeout: 120_000,
  reporter: [["list", { printSteps: true }]],
  outputDir: process.env.MRU_OUTPUT,
  use: {
    baseURL: process.env.MRU_BASE,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
});
