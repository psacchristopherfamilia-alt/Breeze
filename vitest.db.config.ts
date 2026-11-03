import { defineConfig } from "vitest/config";

/** Tests contra Postgres real: `pnpm test:db` (necesita `supabase start` o TEST_DATABASE_URL). */
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["tests/db/support/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
