import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas de extremo a extremo en el navegador, en modo prototipo (sin variables de Supabase).
 * Localmente: `pnpm test:e2e` (hace el build y arranca la app). En un sandbox con Chromium ya instalado,
 * usa PW_CHROMIUM_PATH=/opt/pw-browsers/chromium. En CI se instala con `playwright install chromium`.
 */
const PORT = 3200;
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath, args: ["--no-sandbox"] } : {},
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "movil", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Sin Supabase: la app usa datos de ejemplo.
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}` },
  },
});
