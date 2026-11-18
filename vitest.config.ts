import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // PGlite startup + migrations are slow, so integration tests get generous
    // timeouts; unit tests keep the defaults.
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
