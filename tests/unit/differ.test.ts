import { describe, expect, it } from "vitest"
import { diffSpecs } from "../../src/core/differ.js"
import type { Change, ChangeKind } from "../../src/core/types.js"

type Op = Record<string, unknown>

const QUOTE_BODY = {
  type: "object",
  required: ["premium"],
  properties: { premium: { type: "number" } },
}

const PREMIUM_RESPONSE = {
  description: "ok",
  content: { "application/json": { schema: QUOTE_BODY } },
}

function spec(paths: Record<string, Record<string, Op>>) {
  return { openapi: "3.0.3", info: { title: "t", version: "1.0.0" }, paths }
}

function okOperation(response: unknown): Op {
  return { responses: { "200": response } }
}

function withParam(operation: Op, param: Op): Op {
  return { ...operation, parameters: [...((operation.parameters as Op[]) ?? []), param] }
}

function kinds(changes: Change[]): ChangeKind[] {
  return changes.map((change) => change.kind)
}

describe("diffSpecs", () => {
  it("returns [] for identical specs", () => {
    const s = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })
    expect(diffSpecs(s, structuredClone(s))).toEqual([])
  })

  it("ENDPOINT_ADDED and ENDPOINT_REMOVED", () => {
    const oldSpec = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })
    const newSpec = spec({
      "/quote": { get: okOperation(PREMIUM_RESPONSE) },
      "/refund": { post: okOperation(PREMIUM_RESPONSE) },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "ENDPOINT_ADDED",
        direction: "endpoint",
        method: "POST",
        path: "/refund",
        location: "POST /refund",
      },
    ])
    expect(diffSpecs(newSpec, oldSpec)).toEqual([
      {
        kind: "ENDPOINT_REMOVED",
        direction: "endpoint",
        method: "POST",
        path: "/refund",
        location: "POST /refund",
      },
    ])
  })

  it("METHOD_ADDED and METHOD_REMOVED", () => {
    const oldSpec = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })
    const newSpec = spec({
      "/quote": { get: okOperation(PREMIUM_RESPONSE), post: okOperation(PREMIUM_RESPONSE) },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "METHOD_ADDED",
        direction: "endpoint",
        method: "POST",
        path: "/quote",
        location: "POST /quote",
      },
    ])
    expect(diffSpecs(newSpec, oldSpec)).toEqual([
      {
        kind: "METHOD_REMOVED",
        direction: "endpoint",
        method: "POST",
        path: "/quote",
        location: "POST /quote",
      },
    ])
  })

  it("PARAM_ADDED records whether the new param is required", () => {
    const oldSpec = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })
    const newSpec = spec({
      "/quote": {
        get: withParam(okOperation(PREMIUM_RESPONSE), {
          name: "market",
          in: "query",
          required: true,
          schema: { type: "string" },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toMatchObject([
      {
        kind: "PARAM_ADDED",
        direction: "request",
        method: "GET",
        path: "/quote",
        location: "GET /quote › parameter market (query)",
        fieldPath: "query.market",
        required: true,
      },
    ])
  })

  it("PARAM_REMOVED", () => {
    const param = { name: "market", in: "query", schema: { type: "string" } }
    const oldSpec = spec({ "/quote": { get: withParam(okOperation(PREMIUM_RESPONSE), param) } })
    const newSpec = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })

    expect(diffSpecs(oldSpec, newSpec)).toMatchObject([
      {
        kind: "PARAM_REMOVED",
        direction: "request",
        location: "GET /quote › parameter market (query)",
        fieldPath: "query.market",
      },
    ])
  })

  it("PARAM_REQUIRED_CHANGED", () => {
    const oldSpec = spec({
      "/quote": {
        get: withParam(okOperation(PREMIUM_RESPONSE), {
          name: "market",
          in: "query",
          schema: { type: "string" },
        }),
      },
    })
    const newSpec = spec({
      "/quote": {
        get: withParam(okOperation(PREMIUM_RESPONSE), {
          name: "market",
          in: "query",
          required: true,
          schema: { type: "string" },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
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
    ])
  })

  it("PARAM_TYPE_CHANGED", () => {
    const oldSpec = spec({
      "/quote": {
        get: withParam(okOperation(PREMIUM_RESPONSE), {
          name: "id",
          in: "path",
          schema: { type: "string" },
        }),
      },
    })
    const newSpec = spec({
      "/quote": {
        get: withParam(okOperation(PREMIUM_RESPONSE), {
          name: "id",
          in: "path",
          schema: { type: "number" },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toMatchObject([
      { kind: "PARAM_TYPE_CHANGED", before: "string", after: "number", fieldPath: "path.id" },
    ])
  })

  it("FIELD_ADDED in a request body records whether the field is required", () => {
    const oldSpec = spec({
      "/quote": {
        post: {
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["premium"],
                  properties: { premium: { type: "number" } },
                },
              },
            },
          },
          responses: {},
        },
      },
    })
    const newSpec = spec({
      "/quote": {
        post: {
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["premium", "customer"],
                  properties: { premium: { type: "number" }, customer: { type: "string" } },
                },
              },
            },
          },
          responses: {},
        },
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "FIELD_ADDED",
        direction: "request",
        method: "POST",
        path: "/quote",
        location: "POST /quote › request body › body.customer",
        fieldPath: "body.customer",
        after: { type: "string" },
        required: true,
      },
    ])
  })

  it("FIELD_REMOVED", () => {
    const oldSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: { type: "object", properties: { premium: { type: "number" } } },
            },
          },
        }),
      },
    })
    const newSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: { type: "object", properties: {} },
            },
          },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toMatchObject([
      {
        kind: "FIELD_REMOVED",
        direction: "response",
        method: "GET",
        path: "/quote",
        location: "GET /quote › response 200 › body.premium",
        fieldPath: "body.premium",
      },
    ])
  })

  it("FIELD_TYPE_CHANGED", () => {
    const oldSpec = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })
    const newSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["premium"],
                properties: { premium: { type: "string" } },
              },
            },
          },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toMatchObject([
      {
        kind: "FIELD_TYPE_CHANGED",
        direction: "response",
        before: "number",
        after: "string",
        fieldPath: "body.premium",
      },
    ])
  })

  it("FIELD_REQUIRED_ADDED and FIELD_REQUIRED_REMOVED", () => {
    const optional = {
      description: "ok",
      content: {
        "application/json": {
          schema: { type: "object", properties: { premium: { type: "number" } } },
        },
      },
    }
    const required = {
      description: "ok",
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["premium"],
            properties: { premium: { type: "number" } },
          },
        },
      },
    }
    const oldSpec = spec({ "/quote": { get: okOperation(optional) } })
    const newSpec = spec({ "/quote": { get: okOperation(required) } })

    expect(kinds(diffSpecs(oldSpec, newSpec))).toEqual(["FIELD_REQUIRED_ADDED"])
    expect(diffSpecs(oldSpec, newSpec)[0]).toMatchObject({
      required: true,
      before: false,
      after: true,
      fieldPath: "body.premium",
    })

    expect(kinds(diffSpecs(newSpec, oldSpec))).toEqual(["FIELD_REQUIRED_REMOVED"])
    expect(diffSpecs(newSpec, oldSpec)[0]).toMatchObject({
      required: false,
      before: true,
      after: false,
    })
  })

  it("ENUM_VALUE_ADDED", () => {
    const oldSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { market: { type: "string", enum: ["motor", "health"] } },
              },
            },
          },
        }),
      },
    })
    const newSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { market: { type: "string", enum: ["motor", "health", "travel"] } },
              },
            },
          },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "ENUM_VALUE_ADDED",
        direction: "response",
        method: "GET",
        path: "/quote",
        location: "GET /quote › response 200 › body.market",
        fieldPath: "body.market",
        after: "travel",
      },
    ])
  })

  it("ENUM_VALUE_REMOVED", () => {
    const oldSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { market: { type: "string", enum: ["motor", "health"] } },
              },
            },
          },
        }),
      },
    })
    const newSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { market: { type: "string", enum: ["motor"] } },
              },
            },
          },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "ENUM_VALUE_REMOVED",
        direction: "response",
        method: "GET",
        path: "/quote",
        location: "GET /quote › response 200 › body.market",
        fieldPath: "body.market",
        before: "health",
      },
    ])
  })

  it("STATUS_CODE_ADDED", () => {
    const oldSpec = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })
    const newSpec = spec({
      "/quote": {
        get: {
          responses: {
            "200": PREMIUM_RESPONSE,
            "404": { description: "not found" },
          },
        },
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "STATUS_CODE_ADDED",
        direction: "response",
        method: "GET",
        path: "/quote",
        location: "GET /quote › response 404",
        after: "404",
      },
    ])
  })

  it("STATUS_CODE_REMOVED", () => {
    const oldSpec = spec({
      "/quote": {
        get: {
          responses: {
            "200": PREMIUM_RESPONSE,
            "400": { description: "bad request" },
          },
        },
      },
    })
    const newSpec = spec({ "/quote": { get: okOperation(PREMIUM_RESPONSE) } })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "STATUS_CODE_REMOVED",
        direction: "response",
        method: "GET",
        path: "/quote",
        location: "GET /quote › response 400",
        before: "400",
      },
    ])
  })

  it("detects a field removed deep inside nested objects", () => {
    const oldSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  quote: {
                    type: "object",
                    properties: {
                      customer: { type: "object", properties: { name: { type: "string" } } },
                    },
                  },
                },
              },
            },
          },
        }),
      },
    })
    const newSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  quote: {
                    type: "object",
                    properties: { customer: { type: "object", properties: {} } },
                  },
                },
              },
            },
          },
        }),
      },
    })

    expect(diffSpecs(oldSpec, newSpec)).toEqual([
      {
        kind: "FIELD_REMOVED",
        direction: "response",
        method: "GET",
        path: "/quote",
        location: "GET /quote › response 200 › body.quote.customer.name",
        fieldPath: "body.quote.customer.name",
        before: { type: "string" },
      },
    ])
  })

  it("detects a field removed inside array items", () => {
    const oldSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  customers: {
                    type: "array",
                    items: { type: "object", properties: { name: { type: "string" } } },
                  },
                },
              },
            },
          },
        }),
      },
    })
    const newSpec = spec({
      "/quote": {
        get: okOperation({
          description: "ok",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  customers: { type: "array", items: { type: "object", properties: {} } },
                },
              },
            },
          },
        }),
      },
    })

    expect(kinds(diffSpecs(oldSpec, newSpec))).toEqual(["FIELD_REMOVED"])
    expect(diffSpecs(oldSpec, newSpec)[0]).toMatchObject({
      fieldPath: "body.customers[].name",
      location: "GET /quote › response 200 › body.customers[].name",
    })
  })
})
