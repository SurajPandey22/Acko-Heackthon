// Core domain types. Everything here is pure: no DB, no Express.

/** Severity of a classified change. Unknown kinds must never be "safe". */
export type Severity = "breaking" | "warning" | "safe"

/**
 * Where a change was found, e.g.
 * "GET /quote › response 200 › body.quote.premium"
 */
export interface ChangeLocation {
  /** HTTP method, uppercase (e.g. "GET"). */
  method: string
  /** Path pattern from the spec (e.g. "/quote"). */
  path: string
  /** Optional pinpoint inside the operation, e.g. "response 200 › body.quote.premium". */
  detail?: string
}

/** A single reported difference between two resolved specs. */
export interface SpecChange {
  /** Stable rule identifier, e.g. "response.enum-value-added". */
  ruleId: string
  location: ChangeLocation
  severity: Severity
  /** Plain-English explanation for humans. */
  reason: string
}

/** The load outcome for a spec upload. */
export type LoadResult =
  | { ok: true; spec: Record<string, unknown> }
  | { ok: false; errors: Array<{ message: string; path?: string }> }
