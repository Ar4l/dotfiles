import { defineConfig } from "@playwright/test";

// Run through e2e/run.sh, which boots the throwaway daemon and sets these variables.
export default defineConfig({
  testDir: ".",
  workers: 1,
  timeout: 120_000,
  reporter: [["list", { printSteps: true }]],
  outputDir: process.env.VIM_OUTPUT,
  use: {
    baseURL: process.env.VIM_BASE,
    viewport: { width: 1400, height: 900 },
    // The app binds its shortcuts by platform, and the thread's keys are free on a Mac only:
    // elsewhere Ctrl+K opens the command center. Headless Chromium on Linux says it is a Mac.
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    trace: "retain-on-failure",
  },
});
