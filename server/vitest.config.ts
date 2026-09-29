import { defineConfig } from "vitest/config";

// Each test starts its own in-memory PostgreSQL (PGlite, ~2 s) and signs
// in with scrypt, so the default 5 s limit is too tight on slower machines.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 30_000 },
});