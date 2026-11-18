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

/** Whether a change affects requests, responses, or the endpoint map itself. */
export type ChangeDirection = "request" | "response" | "endpoint"

/** Kind of raw difference found by the differ. Severity is decided later, by the classifier. */
export type ChangeKind =
  | "ENDPOINT_ADDED"
  | "ENDPOINT_REMOVED"
  | "METHOD_ADDED"
  | "METHOD_REMOVED"
  | "PARAM_ADDED"
  | "PARAM_REMOVED"
  | "PARAM_REQUIRED_CHANGED"
  | "PARAM_TYPE_CHANGED"
  | "FIELD_ADDED"
  | "FIELD_REMOVED"
  | "FIELD_TYPE_CHANGED"
  | "FIELD_REQUIRED_ADDED"
  | "FIELD_REQUIRED_REMOVED"
  | "ENUM_VALUE_ADDED"
  | "ENUM_VALUE_REMOVED"
  | "STATUS_CODE_ADDED"
  | "STATUS_CODE_REMOVED"

/** A raw difference between two resolved specs, before classification. */
export interface Change {
  kind: ChangeKind
  direction: ChangeDirection
  /** Uppercase HTTP method, or "" for endpoint-level changes. */
  method: string
  path: string
  /** Human-readable, e.g. "GET /quote › response 200 › body.quote.premium". */
  location: string
  /** Dotted path inside the message, e.g. "body.quote.premium", "body.customers[].name", "query.market". */
  fieldPath?: string
  before?: unknown
  after?: unknown
  /** For FIELD_ADDED / PARAM_ADDED / *_REQUIRED_*: whether it is required on the new side. */
  required?: boolean
}
