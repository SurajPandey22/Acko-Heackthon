import { eq } from "drizzle-orm"
import { services } from "../../db/schema.js"
import type { AppDatabase } from "../../db/types.js"

export interface ServiceRow {
  id: number
  name: string
  owner: string
  createdAt: Date
}

export async function insertService(
  db: AppDatabase,
  input: { name: string; owner: string },
): Promise<ServiceRow> {
  const [row] = await db.insert(services).values(input).returning()
  return row
}

export async function findServiceByName(db: AppDatabase, name: string): Promise<ServiceRow | null> {
  const [row] = await db.select().from(services).where(eq(services.name, name)).limit(1)
  return row ?? null
}

export async function listServices(db: AppDatabase): Promise<ServiceRow[]> {
  return db.select().from(services).orderBy(services.id)
}
