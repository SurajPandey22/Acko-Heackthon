import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema.js"

// Load .env for local runs. Docker compose supplies its own environment and
// the container has no .env file, so this is a no-op there.
try {
  process.loadEnvFile()
} catch {
  // No .env file present - fall back to the process environment only.
}

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env (or export DATABASE_URL), e.g. postgres://guard:guard@localhost:5432/contract_guard",
    )
  }
  return url
}

// Single app-wide pool. The connection is opened lazily on the first query,
// so the server can start even while Postgres is still coming up.
export const pool = new Pool({ connectionString: readDatabaseUrl() })
export const db = drizzle(pool, { schema })
