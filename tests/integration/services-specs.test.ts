import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"
import { getDb, initTestDb } from "../helpers/testDb.js"

initTestDb()

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url))
const quoteYaml = readFileSync(`${fixtures}/quote-api-v1.yaml`, "utf8")
const quoteJson = readFileSync(`${fixtures}/quote-api-v1.json`, "utf8")

describe("services", () => {
  it("creates a service", async () => {
    const app = createApp({ db: getDb() })

    const res = await request(app)
      .post("/api/services")
      .send({ name: "quote-api", owner: "quote-team" })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: "quote-api", owner: "quote-team" })
    expect(res.body.id).toBeGreaterThan(0)
  })

  it("rejects a duplicate service name with 409", async () => {
    const app = createApp({ db: getDb() })

    await request(app).post("/api/services").send({ name: "policy-api", owner: "policy-team" })
    const res = await request(app)
      .post("/api/services")
      .send({ name: "policy-api", owner: "other" })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/i)
  })

  it("rejects an invalid create with 400 and details", async () => {
    const app = createApp({ db: getDb() })

    const res = await request(app).post("/api/services").send({ owner: "no-name" })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/validation/i)
    expect(res.body.details).toEqual([{ path: "name", message: "name is required" }])
  })
})

describe("spec versions", () => {
  it("uploads a valid YAML spec as a multipart file", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "quote-api", owner: "quote-team" })

    const res = await request(app)
      .post("/api/services/quote-api/versions")
      .attach("spec", Buffer.from(quoteYaml), { filename: "quote-api-v1.yaml" })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ version: "1.0.0", status: "draft" })

    const list = await request(app).get("/api/services/quote-api/versions")
    expect(list.status).toBe(200)
    expect(list.body).toHaveLength(1)
    expect(list.body[0]).toMatchObject({ version: "1.0.0", status: "draft" })
  })

  it("uploads a valid JSON spec as a raw text body", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "claim-api", owner: "claims-team" })

    const res = await request(app)
      .post("/api/services/claim-api/versions")
      .set("Content-Type", "application/json")
      .send(quoteJson)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ version: "1.0.0", status: "draft" })
  })

  it("uploads a YAML spec sent as a plain text body", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "travel-api", owner: "travel-team" })

    const res = await request(app)
      .post("/api/services/travel-api/versions")
      .set("Content-Type", "text/yaml")
      .send(quoteYaml)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ version: "1.0.0", status: "draft" })
  })

  it("rejects an invalid spec with 400 and a clear message", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "broken-api", owner: "team" })

    const res = await request(app)
      .post("/api/services/broken-api/versions")
      .set("Content-Type", "text/yaml")
      .send("title: [not even openapi")

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid/i)
    expect(res.body.details[0].message).toMatch(/yaml/i)
  })

  it("rejects an oversized upload with 413", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "big-api", owner: "team" })

    // Just over the 1 MB limit, padded so it stays one line of YAML comment.
    const filler = `# ${"x".repeat(80)}\n`
    const oversized = filler.repeat(Math.ceil((1.1 * 1024 * 1024) / filler.length))

    const res = await request(app)
      .post("/api/services/big-api/versions")
      .set("Content-Type", "text/yaml")
      .send(oversized)

    expect(res.status).toBe(413)
    expect(res.body.error).toMatch(/too large/i)
    expect(res.body.details).toEqual({ limit: 1024 * 1024 })
  })

  it("rejects a duplicate version with 409", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "dup-api", owner: "team" })
    await request(app)
      .post("/api/services/dup-api/versions")
      .attach("spec", Buffer.from(quoteYaml), { filename: "v1.yaml" })

    const res = await request(app)
      .post("/api/services/dup-api/versions")
      .set("Content-Type", "text/yaml")
      .send(quoteYaml)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/version already exists/i)
    expect(res.body.details).toEqual({ version: "1.0.0" })
  })

  it("rejects a version upload for an unknown service with 404", async () => {
    const app = createApp({ db: getDb() })

    const res = await request(app)
      .post("/api/services/ghost-api/versions")
      .set("Content-Type", "text/yaml")
      .send(quoteYaml)

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  it("rejects a valid spec without info.version with 400", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "noversion-api", owner: "team" })

    const res = await request(app)
      .post("/api/services/noversion-api/versions")
      .set("Content-Type", "application/yaml")
      .send("openapi: 3.0.3\ninfo:\n  title: no version\npaths: {}\n")

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/invalid/i)
    expect(res.body.details[0].message).toMatch(/version/i)
  })
})

describe("unknown routes", () => {
  it("answers 404 JSON for unknown paths", async () => {
    const app = createApp({ db: getDb() })

    const res = await request(app).get("/api/nope")

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: "Not found" })
  })
})
