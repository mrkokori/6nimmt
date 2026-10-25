// Browser-Test (tests/smoke.spec.js) in echtem Chromium, weil nur ein echter
// Browser die Content-Security-Policy durchsetzt und WebRTC kann.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "smoke.spec.js",
  timeout: 180000,
  webServer: [
    { command: "node tests/static-server.js", port: 8787, reuseExistingServer: !process.env.CI },
    { command: "node tests/peer-server.js", url: "http://127.0.0.1:9000/health", reuseExistingServer: !process.env.CI }
  ],
  use: {
    baseURL: "http://localhost:8787",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--disable-features=LocalNetworkAccessChecks"]
    }
  }
});
