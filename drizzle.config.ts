import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  // Only used by `drizzle-kit migrate/push`; `generate` needs no connection.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://guard:guard@localhost:5432/contract_guard",
  },
})
