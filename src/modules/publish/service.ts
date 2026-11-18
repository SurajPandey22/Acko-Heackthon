import { classify, summarize } from "../../core/classifier.js"
import { diffSpecs } from "../../core/differ.js"
import { type Consumer, findImpact } from "../../core/impact.js"
import { resolveSpec } from "../../core/resolver.js"
import type { ClassifiedChange } from "../../core/types.js"
import type { AppDatabase } from "../../db/types.js"
import { listConsumers } from "../consumers/repository.js"
import { HttpError } from "../errors.js"
import { findServiceByName } from "../services/repository.js"
import { findSpecVersion } from "../specs/repository.js"
import {
  insertPublishAttempt,
  latestPublishedVersion,
  listPublishAttempts,
  type PublishAttemptRow,
  updateVersionStatus,
} from "./repository.js"

export interface ImpactReport {
  changes: ClassifiedChange[]
  summary: Record<"breaking" | "warning" | "safe", number>
  affected: Array<{
    consumerName: string
    method: string
    path: string
    fieldsUsed: string[]
    breaking: ClassifiedChange[]
    warnings: ClassifiedChange[]
  }>
}

interface Analysis extends ImpactReport {
  blockers: ImpactReport["affected"]
}

/** Load a stored version (404 when missing) together with its resolved spec tree. */
async function loadVersion(
  db: AppDatabase,
  serviceName: string,
  version: string,
): Promise<{
  serviceId: number
  row: NonNullable<Awaited<ReturnType<typeof findSpecVersion>>>
  resolved: Record<string, unknown>
}> {
  const service = await findServiceByName(db, serviceName)
  if (!service) throw new HttpError(404, "Service not found", { name: serviceName })
  const row = await findSpecVersion(db, service.id, version)
  if (!row) {
    throw new HttpError(404, "Version not found", { service: serviceName, version })
  }
  return { serviceId: service.id, row, resolved: resolveSpec(row.spec) }
}

/** Diff a version against the latest published one, classify, and match consumers. */
async function analyzeVersion(
  db: AppDatabase,
  serviceId: number,
  versionId: number,
  newResolved: Record<string, unknown>,
): Promise<Analysis> {
  const predecessor = await latestPublishedVersion(db, serviceId, versionId)
  if (!predecessor) {
    return {
      changes: [],
      summary: { breaking: 0, warning: 0, safe: 0 },
      affected: [],
      blockers: [],
    }
  }

  const classified = classify(diffSpecs(resolveSpec(predecessor.spec), newResolved))
  const registrations = await listConsumers(db, serviceId)
  const consumers: Consumer[] = registrations.map((row) => ({
    consumerName: row.consumerName,
    method: row.method,
    path: row.path,
    fieldsUsed: row.fieldsUsed,
  }))

  const affected = findImpact(classified, consumers)
  return {
    changes: classified,
    summary: summarize(classified),
    affected,
    blockers: affected.filter((entry) => entry.breaking.length > 0),
  }
}

/** GET .../impact – what would break if this version were published now. */
export async function getImpact(
  db: AppDatabase,
  serviceName: string,
  version: string,
): Promise<ImpactReport> {
  const { serviceId, row, resolved } = await loadVersion(db, serviceName, version)
  const analysis = await analyzeVersion(db, serviceId, row.id, resolved)
  const { changes, summary, affected } = analysis
  return { changes, summary, affected }
}

export type PublishOutcome =
  | {
      result: "blocked"
      reasons: string[]
      affected: Analysis["affected"]
      summary: Analysis["summary"]
      changes: ClassifiedChange[]
    }
  | {
      result: "published"
      warning?: string
      affected: Analysis["affected"]
      summary: Analysis["summary"]
      changes: ClassifiedChange[]
    }

/**
 * Decide the verdict, then record the attempt and flip the version status in
 * ONE transaction: a failure in either step leaves no attempt and no status
 * change.
 */
export async function publishVersion(
  db: AppDatabase,
  serviceName: string,
  version: string,
  attemptedBy: string,
): Promise<PublishOutcome> {
  const { serviceId, row: versionRow, resolved } = await loadVersion(db, serviceName, version)
  if (versionRow.status === "published") {
    throw new HttpError(409, "Version already published", { version })
  }

  const analysis = await analyzeVersion(db, serviceId, versionRow.id, resolved)
  const blocked = analysis.blockers.length > 0
  const result = blocked ? "blocked" : "published"

  let reason: string | null = null
  if (blocked) {
    reason = `Blocked: ${analysis.blockers.map((b) => b.consumerName).join(", ")} would break`
  } else if (analysis.summary.breaking > 0) {
    reason = "Published although breaking: no registered consumer uses the affected fields"
  }

  // The attempt insert and the status update succeed or fail together.
  await db.transaction(async (tx) => {
    await insertPublishAttempt(tx as Parameters<typeof insertPublishAttempt>[0], {
      specVersionId: versionRow.id,
      attemptedBy,
      result,
      reason,
      breakingCount: analysis.summary.breaking,
      changes: analysis.changes,
    })
    await updateVersionStatus(
      tx as Parameters<typeof updateVersionStatus>[0],
      versionRow.id,
      result,
    )
  })

  if (blocked) {
    const reasons = analysis.blockers.flatMap((blocker) =>
      blocker.breaking.map((change) => `${blocker.consumerName}: ${change.reason}`),
    )
    return {
      result: "blocked",
      reasons,
      affected: analysis.affected,
      summary: analysis.summary,
      changes: analysis.changes,
    }
  }

  return {
    result: "published",
    ...(analysis.summary.breaking > 0
      ? {
          warning: `Published with ${analysis.summary.breaking} breaking change(s): no registered consumer uses the affected fields`,
        }
      : {}),
    affected: analysis.affected,
    summary: analysis.summary,
    changes: analysis.changes,
  }
}

export async function getHistory(
  db: AppDatabase,
  serviceName: string,
): Promise<PublishAttemptRow[]> {
  const service = await findServiceByName(db, serviceName)
  if (!service) throw new HttpError(404, "Service not found", { name: serviceName })
  return listPublishAttempts(db, service.id)
}

/** Readable markdown changelog grouped by endpoint. */
export function changelogMarkdown(changes: ClassifiedChange[]): string {
  const groups = new Map<string, ClassifiedChange[]>()
  for (const change of changes) {
    const key = change.method === "" ? change.path : `${change.method} ${change.path}`
    const group = groups.get(key) ?? []
    group.push(change)
    groups.set(key, group)
  }

  const lines: string[] = []
  for (const [endpoint, endpointChanges] of groups) {
    lines.push(`### ${endpoint}`)
    for (const change of endpointChanges) {
      lines.push(`- **${change.severity}** \`${change.ruleId}\` — ${change.reason}`)
    }
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

/** GET .../diff?from=&to= – classified changes plus a markdown changelog. */
export async function diffVersions(
  db: AppDatabase,
  serviceName: string,
  from: string,
  to: string,
): Promise<{ changes: ClassifiedChange[]; changelog: string }> {
  const fromVersion = await loadVersion(db, serviceName, from)
  const toVersion = await loadVersion(db, serviceName, to)

  const classified = classify(diffSpecs(fromVersion.resolved, toVersion.resolved))
  return { changes: classified, changelog: changelogMarkdown(classified) }
}
