// Which registered consumers are touched by which classified changes.
// Pure matching only - no DB, no Express.

import type { ClassifiedChange } from "./types.js"

/** What a consumer team registered: the endpoint and (optionally) the fields it uses. */
export interface Consumer {
  consumerName: string
  /** Uppercase or lowercase HTTP method, e.g. "GET". */
  method: string
  /** Path pattern as registered, e.g. "/policy/{id}". */
  path: string
  /** Fields used, e.g. ["quote.premium"]; empty/omitted = the whole endpoint. */
  fieldsUsed?: string[]
}

export interface ConsumerImpact {
  consumerName: string
  method: string
  path: string
  fieldsUsed: string[]
  breaking: ClassifiedChange[]
  warnings: ClassifiedChange[]
}

/** "/policy/{id}" → ["policy", "{id}"]. */ function pathSegments(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "")
}

function isTemplateSegment(segment: string): boolean {
  return segment.startsWith("{") && segment.endsWith("}")
}

/** Path templates match when segments are equal or both are {placeholders}. */
export function pathMatches(registered: string, changed: string): boolean {
  const a = pathSegments(registered)
  const b = pathSegments(changed)
  if (a.length !== b.length) return false
  return a.every((segment, index) => {
    if (segment === b[index]) return true
    return isTemplateSegment(segment) && isTemplateSegment(b[index])
  })
}

/** Drop the "body." prefix and array markers so "body.quote.premium" and "quote.premium" compare equal. */
function normaliseField(fieldPath: string): string {
  return fieldPath.replace(/^body\./, "").replace(/\[\]/g, "")
}

/**
 * Does a change to `changeField` touch a consumer that declared `consumerField`?
 * Matching is symmetric on the object tree: a change to an ancestor touches
 * consumers of its descendants ("quote" removed → "quote.premium" affected),
 * and a change to a descendant touches consumers of the ancestor ("premium"
 * type changed → consumer using "quote" affected). Siblings never match
 * ("quote.premium" vs "quote.rebate" → no).
 */
export function fieldTouches(changeField: string, consumerField: string): boolean {
  const changeCore = normaliseField(changeField)
  // "body" alone means the whole message was added or removed.
  if (changeCore === "body" || changeCore === "") return true

  const changeTokens = changeCore.split(".")
  const consumerTokens = normaliseField(consumerField).split(".")
  const shared = Math.min(changeTokens.length, consumerTokens.length)
  return changeTokens.slice(0, shared).every((token, index) => token === consumerTokens[index])
}

function affectsConsumer(change: ClassifiedChange, consumer: Consumer): boolean {
  if (!pathMatches(consumer.path, change.path)) return false

  // A removed path item kills every method's consumers on that path.
  if (change.kind === "ENDPOINT_REMOVED") return true

  if (change.method !== "" && change.method.toUpperCase() !== consumer.method.toUpperCase()) {
    return false
  }

  // A removed method hits every consumer of that endpoint, fields or not.
  if (change.kind === "METHOD_REMOVED") return true

  // Status-code changes touch the whole response, so all of its consumers.
  if (change.fieldPath === undefined) return true

  const fields = consumer.fieldsUsed ?? []
  if (fields.length === 0) return true
  return fields.some((field) => fieldTouches(change.fieldPath ?? "", field))
}

/**
 * For every consumer registration touched by at least one non-safe change,
 * return the breaking and warning changes that touch what it uses.
 * Safe changes never appear here.
 */
export function findImpact(
  classified: ClassifiedChange[],
  consumers: Consumer[],
): ConsumerImpact[] {
  const impacts: ConsumerImpact[] = []

  for (const consumer of consumers) {
    const breaking: ClassifiedChange[] = []
    const warnings: ClassifiedChange[] = []
    for (const change of classified) {
      if (change.severity === "safe") continue
      if (!affectsConsumer(change, consumer)) continue
      if (change.severity === "breaking") breaking.push(change)
      else warnings.push(change)
    }
    if (breaking.length > 0 || warnings.length > 0) {
      impacts.push({
        consumerName: consumer.consumerName,
        method: consumer.method.toUpperCase(),
        path: consumer.path,
        fieldsUsed: consumer.fieldsUsed ?? [],
        breaking,
        warnings,
      })
    }
  }

  return impacts
}
