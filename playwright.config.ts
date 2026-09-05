import { defineConfig } from "@playwright/test";

/**
 * The GPU gate. Runs the built gallery in the installed Google Chrome with
 * WebGPU enabled, on this machine's real GPU. Hosted CI has no usable adapter,
 * so this suite is local only (`pnpm test:e2e`); set HUI_HEADED=1 to watch it.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel: "chrome",
    headless: process.env.HUI_HEADED !== "1",
    viewport: { width: 1600, height: 1000 },
    launchOptions: {
      args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--enable-features=Vulkan"],
    },
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
