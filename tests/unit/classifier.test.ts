import { describe, expect, it } from "vitest"
import { classify, rules, summarize } from "../../src/core/classifier.js"
import type { Change, ClassifiedChange, Severity } from "../../src/core/types.js"

type ChangeFixture = Pick<Change, "kind" | "direction" | "method" | "path" | "location"> &
  Partial<Change>

function classifiedOf(fixture: ChangeFixture): ClassifiedChange {
  const [result] = classify([fixture as Change])
  return result
}

/** One row per rule: fixture → expected rule id and severity. */
const RULE_CASES: Array<[string, ChangeFixture, string, Severity]> = [
  [
    "endpoint added",
    {
      kind: "ENDPOINT_ADDED",
      direction: "endpoint",
      method: "",
      path: "/refund",
      location: "/refund",
    },
    "endpoint.added",
    "safe",
  ],
  [
    "endpoint removed",
    {
      kind: "ENDPOINT_REMOVED",
      direction: "endpoint",
      method: "POST",
      path: "/refund",
      location: "POST /refund",
    },
    "endpoint.removed",
    "breaking",
  ],
  [
    "method added",
    {
      kind: "METHOD_ADDED",
      direction: "endpoint",
      method: "POST",
      path: "/quote",
      location: "POST /quote",
    },
    "method.added",
    "safe",
  ],
  [
    "method removed",
    {
      kind: "METHOD_REMOVED",
      direction: "endpoint",
      method: "POST",
      path: "/quote",
      location: "POST /quote",
    },
    "method.removed",
    "breaking",
  ],
  [
    "required param added",
    {
      kind: "PARAM_ADDED",
      direction: "request",
      method: "GET",
      path: "/quote",
      location: "GET /quote › parameter market (query)",
      fieldPath: "query.market",
      required: true,
    },
    "param.added.required",
    "breaking",
  ],
  [
    "optional param added",
    {
      kind: "PARAM_ADDED",
      direction: "request",
      method: "GET",
      path: "/quote",
      location: "GET /quote › parameter market (query)",
      fieldPath: "query.market",
      required: false,
    },
    "param.added.optional",
    "safe",
  ],
  [
    "param removed",
    {
      kind: "PARAM_REMOVED",
      direction: "request",
      method: "GET",
      path: "/quote",
      location: "GET /quote › parameter market (query)",
      fieldPath: "query.market",
    },
    "param.removed",
    "safe",
  ],
  [
    "param optional → required",
    {
      kind: "PARAM_REQUIRED_CHANGED",
      direction: "request",
      method: "GET",
      path: "/quote",
      location: "GET /quote › parameter market (query)",
      fieldPath: "query.market",
      before: false,
      after: true,
      required: true,
    },
    "param.required.now-required",
    "breaking",
  ],
  [
    "param required → optional",
    {
      kind: "PARAM_REQUIRED_CHANGED",
      direction: "request",
      method: "GET",
      path: "/quote",
      location: "GET /quote › parameter market (query)",
      fieldPath: "query.market",
      before: true,
      after: false,
      required: false,
    },
    "param.required.now-optional",
    "safe",
  ],
  [
    "param type changed",
    {
      kind: "PARAM_TYPE_CHANGED",
      direction: "request",
      method: "GET",
      path: "/quote/{id}",
      location: "GET /quote/{id} › parameter id (path)",
      fieldPath: "path.id",
      before: "string",
      after: "number",
    },
    "param.type.changed",
    "breaking",
  ],
  [
    "required field added to request",
    {
      kind: "FIELD_ADDED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.customer",
      fieldPath: "body.customer",
      required: true,
    },
    "field.added.request.required",
    "breaking",
  ],
  [
    "optional field added to request",
    {
      kind: "FIELD_ADDED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.note",
      fieldPath: "body.note",
      required: false,
    },
    "field.added.request.optional",
    "safe",
  ],
  [
    "field added to response",
    {
      kind: "FIELD_ADDED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.currency",
      fieldPath: "body.currency",
    },
    "field.added.response",
    "safe",
  ],
  [
    "field removed from request",
    {
      kind: "FIELD_REMOVED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.note",
      fieldPath: "body.note",
    },
    "field.removed.request",
    "safe",
  ],
  [
    "field removed from response",
    {
      kind: "FIELD_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.quote.premium",
      fieldPath: "body.quote.premium",
    },
    "field.removed.response",
    "breaking",
  ],
  [
    "request field type changed",
    {
      kind: "FIELD_TYPE_CHANGED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.premium",
      fieldPath: "body.premium",
      before: "number",
      after: "string",
    },
    "field.type.changed.request",
    "breaking",
  ],
  [
    "response field type changed",
    {
      kind: "FIELD_TYPE_CHANGED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.premium",
      fieldPath: "body.premium",
      before: "number",
      after: "string",
    },
    "field.type.changed.response",
    "breaking",
  ],
  [
    "request field became required",
    {
      kind: "FIELD_REQUIRED_ADDED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.premium",
      fieldPath: "body.premium",
      before: false,
      after: true,
      required: true,
    },
    "field.required.added.request",
    "breaking",
  ],
  [
    "response field became always-present",
    {
      kind: "FIELD_REQUIRED_ADDED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.premium",
      fieldPath: "body.premium",
      before: false,
      after: true,
      required: true,
    },
    "field.required.added.response",
    "safe",
  ],
  [
    "request field became optional",
    {
      kind: "FIELD_REQUIRED_REMOVED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.premium",
      fieldPath: "body.premium",
      before: true,
      after: false,
      required: false,
    },
    "field.required.removed.request",
    "safe",
  ],
  [
    "response field no longer guaranteed",
    {
      kind: "FIELD_REQUIRED_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.premium",
      fieldPath: "body.premium",
      before: true,
      after: false,
      required: false,
    },
    "field.required.removed.response",
    "breaking",
  ],
  [
    "enum value added to request",
    {
      kind: "ENUM_VALUE_ADDED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.market",
      fieldPath: "body.market",
      after: "travel",
    },
    "enum.value.added.request",
    "safe",
  ],
  [
    "enum value added to response",
    {
      kind: "ENUM_VALUE_ADDED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.market",
      fieldPath: "body.market",
      after: "travel",
    },
    "enum.value.added.response",
    "breaking",
  ],
  [
    "enum value removed from request",
    {
      kind: "ENUM_VALUE_REMOVED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.market",
      fieldPath: "body.market",
      before: "health",
    },
    "enum.value.removed.request",
    "breaking",
  ],
  [
    "enum value removed from response",
    {
      kind: "ENUM_VALUE_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.market",
      fieldPath: "body.market",
      before: "health",
    },
    "enum.value.removed.response",
    "safe",
  ],
  [
    "status code added",
    {
      kind: "STATUS_CODE_ADDED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 404",
      after: "404",
    },
    "status.added",
    "warning",
  ],
  [
    "success status removed",
    {
      kind: "STATUS_CODE_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200",
      before: "200",
    },
    "status.removed.success",
    "breaking",
  ],
  [
    "non-success status removed",
    {
      kind: "STATUS_CODE_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 400",
      before: "400",
    },
    "status.removed.other",
    "warning",
  ],
]

describe("classify", () => {
  it("has one test case for every rule in the table", () => {
    const coveredIds = new Set(RULE_CASES.map(([, , ruleId]) => ruleId))
    for (const rule of rules) {
      expect(coveredIds.has(rule.id), `rule ${rule.id} has no test case`).toBe(true)
    }
  })

  it.each(RULE_CASES)("%s → %s (%s)", (_name, fixture, expectedRuleId, expectedSeverity) => {
    const result = classifiedOf(fixture)

    expect(result.ruleId).toBe(expectedRuleId)
    expect(result.severity).toBe(expectedSeverity)
    expect(result.reason).toMatch(/\S/)
  })

  it("gives the plain-English reason from the spec example", () => {
    const result = classifiedOf({
      kind: "FIELD_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.quote.premium",
      fieldPath: "body.quote.premium",
    })

    expect(result.reason).toBe(
      "Field quote.premium was removed from the 200 response; callers reading it will break.",
    )
  })

  it("classifies a required field added as breaking in a request", () => {
    const result = classifiedOf({
      kind: "FIELD_ADDED",
      direction: "request",
      method: "POST",
      path: "/quote",
      location: "POST /quote › request body › body.customer",
      fieldPath: "body.customer",
      required: true,
    })

    expect(result.severity).toBe("breaking")
  })

  it("classifies a required field added as safe in a response", () => {
    const result = classifiedOf({
      kind: "FIELD_ADDED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.quoteId",
      fieldPath: "body.quoteId",
      required: true,
    })

    expect(result.severity).toBe("safe")
  })

  it("classifies an unknown kind as warning, never safe", () => {
    const result = classifiedOf({
      kind: "SOMETHING_ENTIRELY_NEW",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote",
    } as unknown as ChangeFixture)

    expect(result.severity).toBe("warning")
    expect(result.ruleId).toBe("unknown.kind")
    expect(result.reason).toMatch(/not covered by a known rule/)
  })
})

describe("summarize", () => {
  it("counts changes per severity", () => {
    const classified = classify([
      {
        kind: "ENDPOINT_REMOVED",
        direction: "endpoint",
        method: "POST",
        path: "/r",
        location: "POST /r",
      },
      {
        kind: "METHOD_REMOVED",
        direction: "endpoint",
        method: "POST",
        path: "/q",
        location: "POST /q",
      },
      {
        kind: "STATUS_CODE_ADDED",
        direction: "response",
        method: "GET",
        path: "/q",
        location: "GET /q › response 404",
        after: "404",
      },
      {
        kind: "METHOD_ADDED",
        direction: "endpoint",
        method: "GET",
        path: "/q",
        location: "GET /q",
      },
      { kind: "ENDPOINT_ADDED", direction: "endpoint", method: "", path: "/n", location: "/n" },
    ])

    expect(summarize(classified)).toEqual({ breaking: 2, warning: 1, safe: 2 })
  })

  it("returns zero counts for no changes", () => {
    expect(summarize([])).toEqual({ breaking: 0, warning: 0, safe: 0 })
  })
})
