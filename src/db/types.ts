import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type { PgliteDatabase } from "drizzle-orm/pglite"
import type * as schema from "./schema.js"

/**
 * The database handle modules accept: the production client (node-postgres)
 * or the PGlite instance integration tests build. Both share Drizzle's
 * query API over the same schema.
 */
export type AppDatabase = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>
