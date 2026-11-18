import { and, eq } from "drizzle-orm"
import { specVersions } from "../../db/schema.js"
import type { AppDatabase } from "../../db/types.js"

export interface SpecVersionRow {
  id: number
  serviceId: number
  version: string
  status: "draft" | "published" | "blocked"
  createdAt: Date
}

export async function insertSpecVersion(
  db: AppDatabase,
  input: { serviceId: number; version: string; rawSpec: string; spec: Record<string, unknown> },
): Promise<SpecVersionRow> {
  const [row] = await db.insert(specVersions).values(input).returning()
  return {
    id: row.id,
    serviceId: row.serviceId,
    version: row.version,
    status: row.status,
    createdAt: row.createdAt,
  }
}

export async function findSpecVersion(
  db: AppDatabase,
  serviceId: number,
  version: string,
): Promise<SpecVersionRow | null> {
  const [row] = await db
    .select({
      id: specVersions.id,
      serviceId: specVersions.serviceId,
      version: specVersions.version,
      status: specVersions.status,
      createdAt: specVersions.createdAt,
    })
    .from(specVersions)
    .where(and(eq(specVersions.serviceId, serviceId), eq(specVersions.version, version)))
    .limit(1)
  return row ?? null
}

export async function listSpecVersions(
  db: AppDatabase,
  serviceId: number,
): Promise<SpecVersionRow[]> {
  return db
    .select({
      id: specVersions.id,
      serviceId: specVersions.serviceId,
      version: specVersions.version,
      status: specVersions.status,
      createdAt: specVersions.createdAt,
    })
    .from(specVersions)
    .where(eq(specVersions.serviceId, serviceId))
    .orderBy(specVersions.id)
}

/** Mark a stored version published. Used by the seed; the publish gate module will replace this. */
export async function markSpecVersionPublished(db: AppDatabase, id: number): Promise<void> {
  await db.update(specVersions).set({ status: "published" }).where(eq(specVersions.id, id))
}
