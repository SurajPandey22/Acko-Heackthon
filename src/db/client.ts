import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

// Single app-wide pool. The connection is opened lazily on the first query,
// so the server can start even while Postgres is still coming up.
export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool)
