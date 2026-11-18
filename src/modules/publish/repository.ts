import { and, desc, eq, ne } from "drizzle-orm"
import { publishAttempts, specVersions } from "../../db/schema.js"
import type { AppDatabase } from "../../db/types.js"

export type VersionStatus = "draft" | "published" | "blocked"

export interface PublishAttemptRow {
  id: number
  version: string
  attemptedBy: string
  result: "published" | "blocked"
  reason: string | null
  breakingCount: number
  changes: unknown[]
  createdAt: Date
}

export async function insertPublishAttempt(
  db: AppDatabase,
  input: {
    specVersionId: number
    attemptedBy: string
    result: "published" | "blocked"
    reason: string | null
    breakingCount: number
    changes: unknown[]
  },
): Promise<number> {
  const [row] = await db.insert(publishAttempts).values(input).returning()
  return row.id
}

export async function updateVersionStatus(
  db: AppDatabase,
  id: number,
  status: VersionStatus,
): Promise<void> {
  await db.update(specVersions).set({ status }).where(eq(specVersions.id, id))
}

/** The newest published version of a service, excluding one id. */
export async function latestPublishedVersion(
  db: AppDatabase,
  serviceId: number,
  excludeId: number,
): Promise<{ id: number; version: string; spec: Record<string, unknown> } | null> {
  const [row] = await db
    .select({
      id: specVersions.id,
      version: specVersions.version,
      spec: specVersions.spec,
    })
    .from(specVersions)
    .where(
      and(
        eq(specVersions.serviceId, serviceId),
        eq(specVersions.status, "published"),
        ne(specVersions.id, excludeId),
      ),
    )
    .orderBy(desc(specVersions.id))
    .limit(1)
  return row ?? null
}

/** All publish attempts for a service, newest first. */
export async function listPublishAttempts(
  db: AppDatabase,
  serviceId: number,
): Promise<PublishAttemptRow[]> {
  return db
    .select({
      id: publishAttempts.id,
      version: specVersions.version,
      attemptedBy: publishAttempts.attemptedBy,
      result: publishAttempts.result,
      reason: publishAttempts.reason,
      breakingCount: publishAttempts.breakingCount,
      changes: publishAttempts.changes,
      createdAt: publishAttempts.createdAt,
    })
    .from(publishAttempts)
    .innerJoin(specVersions, eq(publishAttempts.specVersionId, specVersions.id))
    .where(eq(specVersions.serviceId, serviceId))
    .orderBy(desc(publishAttempts.id))
}
