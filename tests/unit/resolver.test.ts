import { describe, expect, it } from "vitest"
import { resolveSpec } from "../../src/core/resolver.js"

const quoteSchema = {
  type: "object",
  required: ["premium"],
  properties: { premium: { type: "number" } },
}

const customerSchema = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" } },
}

/** Reach GET /xxx's 200 JSON schema in a resolved spec. */
function ok200Schema(resolved: Record<string, unknown>, path: string) {
  const paths = resolved.paths as Record<string, Record<string, never>>
  const get = paths[path]?.get as { responses: Record<string, Record<string, unknown>> }
  const ok = get.responses["200"] as { content: Record<string, { schema: unknown }> }
  return ok.content["application/json"].schema
}

function specWithSchemas(schemas: Record<string, unknown>, responseSchema: unknown) {
  return {
    openapi: "3.0.3",
    info: { title: "t", version: "1.0.0" },
    paths: {
      "/quote": {
        get: {
          responses: {
            "200": {
              description: "ok",
              content: { "application/json": { schema: responseSchema } },
            },
          },
        },
      },
    },
    components: { schemas },
  }
}

describe("resolveSpec", () => {
  it("replaces a simple $ref with the referenced schema", () => {
    const spec = specWithSchemas({ Quote: quoteSchema }, { $ref: "#/components/schemas/Quote" })

    const resolved = resolveSpec(spec)

    const schema = ok200Schema(resolved, "/quote")
    expect(schema).toEqual(quoteSchema)
    expect(schema).not.toHaveProperty("$ref")
  })

  it("resolves refs nested inside a resolved schema", () => {
    const quoteWithCustomer = {
      ...quoteSchema,
      properties: {
        ...quoteSchema.properties,
        customer: { $ref: "#/components/schemas/Customer" },
      },
    }
    const spec = specWithSchemas(
      { Quote: quoteWithCustomer, Customer: customerSchema },
      { $ref: "#/components/schemas/Quote" },
    )

    const resolved = resolveSpec(spec)

    const schema = ok200Schema(resolved, "/quote") as {
      properties: { customer: Record<string, unknown> }
    }
    expect(schema.properties.customer).toEqual(customerSchema)
  })

  it("resolves refs inside array items", () => {
    const spec = specWithSchemas(
      { Quote: quoteSchema },
      {
        type: "array",
        items: { $ref: "#/components/schemas/Quote" },
      },
    )

    const resolved = resolveSpec(spec)

    const schema = ok200Schema(resolved, "/quote") as { items: Record<string, unknown> }
    expect(schema.items).toEqual(quoteSchema)
  })

  it("breaks circular refs with an x-circular-ref marker instead of looping", () => {
    const nodeSchema = {
      type: "object",
      properties: { child: { $ref: "#/components/schemas/Node" } },
    }
    const spec = specWithSchemas({ Node: nodeSchema }, { $ref: "#/components/schemas/Node" })

    const resolved = resolveSpec(spec)

    const schema = ok200Schema(resolved, "/quote") as {
      properties: { child: Record<string, unknown> }
    }
    expect(schema.properties.child).toEqual({
      "x-circular-ref": "#/components/schemas/Node",
    })
  })

  it("expands the same shared schema everywhere (sharing is not circularity)", () => {
    const nodeSchema = {
      type: "object",
      properties: { child: { $ref: "#/components/schemas/Node" } },
    }
    const spec = {
      ...specWithSchemas({ Node: nodeSchema }, { $ref: "#/components/schemas/Node" }),
      paths: {
        "/a": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": { schema: { $ref: "#/components/schemas/Node" } },
                },
              },
            },
          },
        },
        "/b": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": { schema: { $ref: "#/components/schemas/Node" } },
                },
              },
            },
          },
        },
      },
    }

    const resolved = resolveSpec(spec)

    const a = ok200Schema(resolved, "/a") as { type: string }
    const b = ok200Schema(resolved, "/b") as { type: string }
    // Both occurrences resolve to the full Node; the marker only appears at
    // the recursive position inside each.
    expect(a.type).toBe("object")
    expect(b.type).toBe("object")
  })

  it("merges allOf (including refs inside it) into one schema", () => {
    const base = {
      type: "object",
      required: ["a"],
      properties: { a: { type: "string" } },
    }
    const extra = {
      required: ["b"],
      properties: { b: { type: "number" } },
    }
    const spec = specWithSchemas(
      {
        Base: base,
        Extra: extra,
        Extended: {
          allOf: [{ $ref: "#/components/schemas/Base" }, { $ref: "#/components/schemas/Extra" }],
          description: "extended",
        },
      },
      { $ref: "#/components/schemas/Extended" },
    )

    const resolved = resolveSpec(spec)

    expect(ok200Schema(resolved, "/quote")).toEqual({
      type: "object",
      description: "extended",
      required: ["a", "b"],
      properties: { a: { type: "string" }, b: { type: "number" } },
    })
  })

  it("an inline spec and a $ref spec describing the same API resolve equal", () => {
    const inlineQuote = structuredClone(quoteSchema)
    const specInline = {
      openapi: "3.0.3",
      info: { title: "t", version: "1.0.0" },
      paths: {
        "/quote": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: inlineQuote } },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Quote: structuredClone(quoteSchema),
          Customer: structuredClone(customerSchema),
        },
      },
    }
    const specWithRefs = {
      openapi: "3.0.3",
      info: { title: "t", version: "1.0.0" },
      paths: {
        "/quote": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": { schema: { $ref: "#/components/schemas/Quote" } },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Quote: structuredClone(quoteSchema),
          Customer: structuredClone(customerSchema),
        },
      },
    }
    const before = structuredClone(specWithRefs)

    expect(resolveSpec(specWithRefs)).toEqual(specInline)
    // The input must not be mutated.
    expect(specWithRefs).toEqual(before)
    expect(JSON.stringify(specWithRefs)).toContain('"$ref"')
  })
})
