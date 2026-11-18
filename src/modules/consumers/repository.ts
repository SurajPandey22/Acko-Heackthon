import { and, eq } from "drizzle-orm"
import { consumers, services } from "../../db/schema.js"
import type { AppDatabase } from "../../db/types.js"

export interface ConsumerRow {
  id: number
  consumerName: string
  method: string
  path: string
  fieldsUsed: string[]
  service: string
}

export async function insertConsumer(
  db: AppDatabase,
  input: {
    consumerName: string
    serviceId: number
    method: string
    path: string
    fieldsUsed: string[]
  },
): Promise<{ id: number }> {
  const [row] = await db.insert(consumers).values(input).returning()
  return { id: row.id }
}

/** Exact-match duplicate check: same consumer, service, method and path. */
export async function consumerExists(
  db: AppDatabase,
  key: { consumerName: string; serviceId: number; method: string; path: string },
): Promise<boolean> {
  const [row] = await db
    .select({ id: consumers.id })
    .from(consumers)
    .where(
      and(
        eq(consumers.consumerName, key.consumerName),
        eq(consumers.serviceId, key.serviceId),
        eq(consumers.method, key.method),
        eq(consumers.path, key.path),
      ),
    )
    .limit(1)
  return row !== undefined
}

export async function listConsumers(db: AppDatabase, serviceId?: number): Promise<ConsumerRow[]> {
  return db
    .select({
      id: consumers.id,
      consumerName: consumers.consumerName,
      method: consumers.method,
      path: consumers.path,
      fieldsUsed: consumers.fieldsUsed,
      service: services.name,
    })
    .from(consumers)
    .innerJoin(services, eq(consumers.serviceId, services.id))
    .where(serviceId === undefined ? undefined : eq(consumers.serviceId, serviceId))
    .orderBy(consumers.id)
}
