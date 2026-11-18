import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { loadSpec } from "../../src/core/loader.js"

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url))
const quoteYaml = readFileSync(`${fixtures}/quote-api-v1.yaml`, "utf8")
const quoteJson = readFileSync(`${fixtures}/quote-api-v1.json`, "utf8")

describe("loadSpec", () => {
  it("accepts a valid OpenAPI YAML spec", async () => {
    const result = await loadSpec(quoteYaml, "quote-api-v1.yaml")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.spec.openapi).toBe("3.0.3")
      expect(result.spec.info).toMatchObject({ title: "Quote API", version: "1.0.0" })
    }
  })

  it("accepts a valid OpenAPI JSON spec and parses it identically to YAML", async () => {
    const fromJson = await loadSpec(quoteJson, "quote-api-v1.json")
    const fromYaml = await loadSpec(quoteYaml, "quote-api-v1.yaml")

    expect(fromJson.ok).toBe(true)
    expect(fromJson.ok && fromJson.spec).toEqual(fromYaml.ok && fromYaml.spec)
  })

  it("detects JSON by content even with a .yaml extension", async () => {
    const result = await loadSpec(quoteJson, "quote-api-v1.json.renamed.yaml")

    expect(result.ok).toBe(true)
  })

  it("returns the original spec with $refs intact (no dereferencing)", async () => {
    const result = await loadSpec(quoteYaml, "quote-api-v1.yaml")

    expect(result.ok).toBe(true)
    if (result.ok) {
      const paths = result.spec.paths as Record<string, unknown>
      const get = (paths["/quote"] as Record<string, unknown>).get as Record<string, unknown>
      const responses = get.responses as Record<string, unknown>
      const ok200 = responses["200"] as {
        content: Record<string, { schema: { $ref: string } }>
      }

      expect(ok200.content["application/json"].schema.$ref).toBe(
        "#/components/schemas/QuoteResponse",
      )
    }
  })

  it("rejects broken YAML with a clear message", async () => {
    const broken = quoteYaml.replace("title: Quote API", "title: [Quote API")

    const result = await loadSpec(broken, "broken.yaml")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toContain("broken.yaml")
      expect(result.errors[0].message).toMatch(/invalid yaml/i)
    }
  })

  it("rejects valid YAML that is not an OpenAPI document", async () => {
    const notOpenApi = "app: contract-guard\nqueue: rabbitmq\nreplicas: 3\n"

    const result = await loadSpec(notOpenApi, "config.yaml")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0].message).toMatch(/openapi/i)
      expect(result.errors[0].path).toBe("/openapi")
    }
  })

  it("rejects Swagger 2.0 with a clear message", async () => {
    const swagger2 = {
      swagger: "2.0",
      info: { title: "Quote API", version: "1.0.0" },
      paths: {},
    }

    const result = await loadSpec(JSON.stringify(swagger2), "swagger2.json")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0].message).toMatch(/swagger 2\.0/i)
      expect(result.errors[0].message).toMatch(/openapi 3/i)
    }
  })

  it("rejects an empty spec", async () => {
    const result = await loadSpec("   \n", "empty.yaml")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0].message).toMatch(/empty/i)
    }
  })
})
