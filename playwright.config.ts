import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
    {
      command: "npm run preview -- --port 4173",
      url: "http://localhost:4173",
      reuseExistingServer: true,
    },
  ],
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 960 } } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], defaultBrowserType: "webkit" },
    },
    {
      name: "edge",
      use: { channel: "msedge", viewport: { width: 1366, height: 900 } },
    },
    ...(process.env.TEST_FIREFOX === "1"
      ? [
          {
            name: "firefox",
            use: {
              browserName: "firefox" as const,
              viewport: { width: 1280, height: 800 },
            },
          },
        ]
      : []),
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});
