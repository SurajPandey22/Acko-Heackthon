// The "Breaking-change rules" table from AGENTS.md, expressed as data:
// one rule object per row (plus the safe additions/removals), each with an
// id, a matcher, a fixed severity and a plain-English reason builder.
// Unknown change kinds must never classify as "safe".

import type { Change, ClassifiedChange, Severity } from "./types.js"

interface Rule {
  id: string
  matches: (change: Change) => boolean
  severity: Severity
  reason: (change: Change) => string
}

/** "body.quote.premium" → "quote.premium"; params keep their "in." prefix. */
function readableField(change: Change): string {
  return (change.fieldPath ?? "").replace(/^body\./, "")
}

/** "query.market" → "market (query)". */
function paramLabel(change: Change): string {
  const fieldPath = change.fieldPath ?? ""
  const dot = fieldPath.indexOf(".")
  if (dot <= 0) return fieldPath
  return `${fieldPath.slice(dot + 1)} (${fieldPath.slice(0, dot)})`
}

/** The status code embedded in a location like "GET /quote › response 200 › ...". */
function responseCode(change: Change): string {
  const match = change.location.match(/› response ([^\s›]+)/)
  return match ? match[1] : ""
}

function isSuccessCode(code: string): boolean {
  return /^2(\d\d|XX)$/i.test(code)
}

export const rules: Rule[] = [
  {
    id: "endpoint.added",
    matches: (c) => c.kind === "ENDPOINT_ADDED",
    severity: "safe",
    reason: (c) => `New endpoint ${c.location} was added; existing consumers are unaffected.`,
  },
  {
    id: "endpoint.removed",
    matches: (c) => c.kind === "ENDPOINT_REMOVED",
    severity: "breaking",
    reason: (c) => `Endpoint ${c.path} was removed; existing callers will get 404 responses.`,
  },
  {
    id: "method.added",
    matches: (c) => c.kind === "METHOD_ADDED",
    severity: "safe",
    reason: (c) => `New method ${c.method} on ${c.path}; existing callers are unaffected.`,
  },
  {
    id: "method.removed",
    matches: (c) => c.kind === "METHOD_REMOVED",
    severity: "breaking",
    reason: (c) =>
      `${c.method} ${c.path} was removed; callers using it will get 404 or 405 responses.`,
  },
  {
    id: "param.added.required",
    matches: (c) => c.kind === "PARAM_ADDED" && c.required === true,
    severity: "breaking",
    reason: (c) =>
      `Parameter ${paramLabel(c)} is now required on ${c.method} ${c.path}; callers not sending it will be rejected.`,
  },
  {
    id: "param.added.optional",
    matches: (c) => c.kind === "PARAM_ADDED",
    severity: "safe",
    reason: (c) =>
      `Optional parameter ${paramLabel(c)} was added to ${c.method} ${c.path}; callers that ignore it are unaffected.`,
  },
  {
    id: "param.removed",
    matches: (c) => c.kind === "PARAM_REMOVED",
    severity: "safe",
    reason: (c) =>
      `Parameter ${paramLabel(c)} no longer appears on ${c.method} ${c.path}; the server will ignore it if callers still send it.`,
  },
  {
    id: "param.required.now-required",
    matches: (c) => c.kind === "PARAM_REQUIRED_CHANGED" && c.after === true,
    severity: "breaking",
    reason: (c) =>
      `Parameter ${paramLabel(c)} changed from optional to required on ${c.method} ${c.path}; callers not sending it will be rejected.`,
  },
  {
    id: "param.required.now-optional",
    matches: (c) => c.kind === "PARAM_REQUIRED_CHANGED" && c.after === false,
    severity: "safe",
    reason: (c) =>
      `Parameter ${paramLabel(c)} changed from required to optional on ${c.method} ${c.path}; existing callers are unaffected.`,
  },
  {
    id: "param.type.changed",
    matches: (c) => c.kind === "PARAM_TYPE_CHANGED",
    severity: "breaking",
    reason: (c) =>
      `Parameter ${paramLabel(c)} changed type from ${String(c.before)} to ${String(c.after)} on ${c.method} ${c.path}; callers sending the old type will fail validation.`,
  },
  {
    id: "field.added.request.required",
    matches: (c) => c.kind === "FIELD_ADDED" && c.direction === "request" && c.required === true,
    severity: "breaking",
    reason: (c) =>
      `Field ${readableField(c)} is now required in the request body of ${c.method} ${c.path}; callers not sending it will be rejected.`,
  },
  {
    id: "field.added.request.optional",
    matches: (c) => c.kind === "FIELD_ADDED" && c.direction === "request",
    severity: "safe",
    reason: (c) =>
      `Optional field ${readableField(c)} was added to the request body of ${c.method} ${c.path}; callers that ignore it are unaffected.`,
  },
  {
    id: "field.added.response",
    matches: (c) => c.kind === "FIELD_ADDED" && c.direction === "response",
    severity: "safe",
    reason: (c) =>
      `Field ${readableField(c)} was added to the ${responseCode(c)} response of ${c.method} ${c.path}; consumers reading known fields are unaffected.`,
  },
  {
    id: "field.removed.request",
    matches: (c) => c.kind === "FIELD_REMOVED" && c.direction === "request",
    severity: "safe",
    reason: (c) =>
      `Field ${readableField(c)} no longer appears in the request body of ${c.method} ${c.path}; existing calls keep working, but callers should stop sending it.`,
  },
  {
    id: "field.removed.response",
    matches: (c) => c.kind === "FIELD_REMOVED" && c.direction === "response",
    severity: "breaking",
    reason: (c) =>
      `Field ${readableField(c)} was removed from the ${responseCode(c)} response; callers reading it will break.`,
  },
  {
    id: "field.type.changed.request",
    matches: (c) => c.kind === "FIELD_TYPE_CHANGED" && c.direction === "request",
    severity: "breaking",
    reason: (c) =>
      `Field ${readableField(c)} changed type from ${String(c.before)} to ${String(c.after)} in the request body of ${c.method} ${c.path}; callers sending the old type will fail.`,
  },
  {
    id: "field.type.changed.response",
    matches: (c) => c.kind === "FIELD_TYPE_CHANGED" && c.direction === "response",
    severity: "breaking",
    reason: (c) =>
      `Field ${readableField(c)} changed type from ${String(c.before)} to ${String(c.after)} in the ${responseCode(c)} response; callers expecting the old type will break.`,
  },
  {
    id: "field.required.added.request",
    matches: (c) => c.kind === "FIELD_REQUIRED_ADDED" && c.direction === "request",
    severity: "breaking",
    reason: (c) =>
      `Field ${readableField(c)} is now required in the request body of ${c.method} ${c.path}; callers omitting it will be rejected.`,
  },
  {
    id: "field.required.added.response",
    matches: (c) => c.kind === "FIELD_REQUIRED_ADDED" && c.direction === "response",
    severity: "safe",
    reason: (c) =>
      `Field ${readableField(c)} is now always present in the ${responseCode(c)} response; consumers are unaffected.`,
  },
  {
    id: "field.required.removed.request",
    matches: (c) => c.kind === "FIELD_REQUIRED_REMOVED" && c.direction === "request",
    severity: "safe",
    reason: (c) =>
      `Field ${readableField(c)} is no longer required in the request body of ${c.method} ${c.path}; existing callers are unaffected.`,
  },
  {
    id: "field.required.removed.response",
    matches: (c) => c.kind === "FIELD_REQUIRED_REMOVED" && c.direction === "response",
    severity: "breaking",
    reason: (c) =>
      `Field ${readableField(c)} is no longer guaranteed in the ${responseCode(c)} response; callers reading it may not receive it.`,
  },
  {
    id: "enum.value.added.request",
    matches: (c) => c.kind === "ENUM_VALUE_ADDED" && c.direction === "request",
    severity: "safe",
    reason: (c) =>
      `Value ${JSON.stringify(c.after)} was added to ${readableField(c)} in requests; existing callers are unaffected.`,
  },
  {
    id: "enum.value.added.response",
    matches: (c) => c.kind === "ENUM_VALUE_ADDED" && c.direction === "response",
    severity: "breaking",
    reason: (c) =>
      `Value ${JSON.stringify(c.after)} was added to ${readableField(c)} in the ${responseCode(c)} response; consumers may not recognise it.`,
  },
  {
    id: "enum.value.removed.request",
    matches: (c) => c.kind === "ENUM_VALUE_REMOVED" && c.direction === "request",
    severity: "breaking",
    reason: (c) =>
      `Value ${JSON.stringify(c.before)} is no longer accepted for ${readableField(c)}; callers sending it will be rejected.`,
  },
  {
    id: "enum.value.removed.response",
    matches: (c) => c.kind === "ENUM_VALUE_REMOVED" && c.direction === "response",
    severity: "safe",
    reason: (c) =>
      `Value ${JSON.stringify(c.before)} will no longer appear in ${readableField(c)} responses; consumers keep working.`,
  },
  {
    id: "status.added",
    matches: (c) => c.kind === "STATUS_CODE_ADDED",
    severity: "warning",
    reason: (c) =>
      `New response status ${String(c.after)} on ${c.method} ${c.path}; check that consumers handle it.`,
  },
  {
    id: "status.removed.success",
    matches: (c) => c.kind === "STATUS_CODE_REMOVED" && isSuccessCode(String(c.before)),
    severity: "breaking",
    reason: (c) =>
      `Success response ${String(c.before)} was removed from ${c.method} ${c.path}; callers will no longer receive it.`,
  },
  {
    id: "status.removed.other",
    matches: (c) => c.kind === "STATUS_CODE_REMOVED",
    severity: "warning",
    reason: (c) =>
      `Response status ${String(c.before)} was removed from ${c.method} ${c.path}; consumers relying on it should review.`,
  },
]

/** First matching rule wins; no match (unknown kind) → warning, never safe. */
export function classify(changes: Change[]): ClassifiedChange[] {
  return changes.map((change) => {
    const rule = rules.find((candidate) => candidate.matches(change))
    if (!rule) {
      return {
        ...change,
        ruleId: "unknown.kind",
        severity: "warning",
        reason: `Change ${change.kind} at ${change.location} is not covered by a known rule; treat it as a warning until reviewed.`,
      }
    }
    return {
      ...change,
      ruleId: rule.id,
      severity: rule.severity,
      reason: rule.reason(change),
    }
  })
}

/** Counts per severity. */
export function summarize(classified: ClassifiedChange[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { breaking: 0, warning: 0, safe: 0 }
  for (const change of classified) {
    counts[change.severity] += 1
  }
  return counts
}
