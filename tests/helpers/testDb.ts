import { fileURLToPath } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterAll, beforeAll, beforeEach } from "vitest"
import * as schema from "../../src/db/schema.js"

const migrationsFolder = fileURLToPath(new URL("../../src/db/migrations", import.meta.url))

let client: PGlite | undefined
let db: PgliteDatabase<typeof schema> | undefined

/**
 * Registers per-file hooks: one PGlite database with migrations applied in
 * beforeAll (spinning up PGlite is slow, so it must not happen per test),
 * every table truncated before each test so tests never share state, and
 * the client closed in afterAll. Call once per test file, then use getDb().
 */
export function initTestDb() {
  beforeAll(async () => {
    client = new PGlite()
    db = drizzle(client, { schema })
    await migrate(db, { migrationsFolder })
  })

  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await client?.close()
    client = undefined
    db = undefined
  })
}

/** The test file's database. Only valid between beforeAll and afterAll. */
export function getDb(): PgliteDatabase<typeof schema> {
  if (!db) {
    throw new Error("Test database is not ready - call initTestDb() in the test file")
  }
  return db
}

/**
 * Truncate every table with RESTART IDENTITY CASCADE. The migrator's own
 * table lives in the "drizzle" schema, so public tables are exactly ours.
 */
export async function resetDb() {
  if (!client) return
  const result = await client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  )
  const tables = result.rows.map((row) => row.tablename)
  if (tables.length === 0) return
  await client.query(
    `truncate table ${tables.map((name) => `"${name}"`).join(", ")} restart identity cascade`,
  )
}
