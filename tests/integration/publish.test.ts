import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"
import type { AppDatabase } from "../../src/db/types.js"
import { publishVersion } from "../../src/modules/publish/service.js"
import { getDb, initTestDb } from "../helpers/testDb.js"

initTestDb()

const fixtures = fileURLToPath(new URL("../fixtures", import.meta.url))
const readFixture = (file: string) => readFileSync(`${fixtures}/${file}`, "utf8")

type App = ReturnType<typeof createApp>

/** Fresh service with a published v1 and a mobile-app consumer on GET /quote. */
async function setupQuoteService(app: App): Promise<void> {
  await request(app).post("/api/services").send({ name: "quote-api", owner: "quote-team" })
  await request(app)
    .post("/api/services/quote-api/versions")
    .attach("spec", Buffer.from(readFixture("quote-api-v1.yaml")), { filename: "v1.yaml" })
  await request(app)
    .post("/api/services/quote-api/versions/1.0.0/publish")
    .send({ attemptedBy: "seed" })
  await request(app)
    .post("/api/consumers")
    .send({
      consumerName: "mobile-app",
      service: "quote-api",
      method: "GET",
      path: "/quote",
      fieldsUsed: ["premium", "quoteId"],
    })
}

async function uploadV2(app: App, fixture: string): Promise<void> {
  const res = await request(app)
    .post("/api/services/quote-api/versions")
    .attach("spec", Buffer.from(readFixture(fixture)), { filename: fixture })
  if (res.status !== 201)
    throw new Error(`fixture upload failed: ${res.status} ${JSON.stringify(res.body)}`)
}

describe("GET .../impact", () => {
  it("shows the breaking change and the consumer it affects", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)
    await uploadV2(app, "quote-api-v2-breaking.yaml")

    const res = await request(app).get("/api/services/quote-api/versions/2.0.0/impact")

    expect(res.status).toBe(200)
    const typeChange = res.body.changes.find(
      (change: { kind: string }) => change.kind === "FIELD_TYPE_CHANGED",
    )
    expect(typeChange).toMatchObject({
      ruleId: "field.type.changed.response",
      severity: "breaking",
      location: "GET /quote › response 200 › body.premium",
      before: "number",
      after: "string",
    })
    expect(res.body.summary).toMatchObject({ breaking: 1 })
    expect(res.body.affected).toHaveLength(1)
    expect(res.body.affected[0]).toMatchObject({ consumerName: "mobile-app" })
    expect(res.body.affected[0].breaking.length).toBeGreaterThan(0)
  })
})

describe("POST .../publish", () => {
  it("blocks a breaking change a consumer uses, and records the attempt", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)
    await uploadV2(app, "quote-api-v2-breaking.yaml")

    const res = await request(app)
      .post("/api/services/quote-api/versions/2.0.0/publish")
      .send({ attemptedBy: "quote-admin" })

    expect(res.status).toBe(409)
    expect(res.body.result).toBe("blocked")
    expect(res.body.reasons[0]).toMatch(/^mobile-app: /)
    expect(res.body.affected[0].consumerName).toBe("mobile-app")

    const versions = await request(app).get("/api/services/quote-api/versions")
    expect(versions.body.find((v: { version: string }) => v.version === "2.0.0")).toMatchObject({
      status: "blocked",
    })

    const history = await request(app).get("/api/services/quote-api/history")
    expect(history.body).toHaveLength(2) // v1 publish + blocked v2
    expect(history.body[0]).toMatchObject({
      version: "2.0.0",
      result: "blocked",
      attemptedBy: "quote-admin",
    })
    expect(history.body[0].breakingCount).toBe(1)
  })

  it("publishes a safe version and records the attempt", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)
    await uploadV2(app, "quote-api-v2-safe.yaml")

    const res = await request(app)
      .post("/api/services/quote-api/versions/2.0.0/publish")
      .send({ attemptedBy: "quote-admin" })

    expect(res.status).toBe(200)
    expect(res.body.result).toBe("published")
    expect(res.body.summary).toMatchObject({ breaking: 0, warning: 0, safe: 2 })

    const versions = await request(app).get("/api/services/quote-api/versions")
    expect(versions.body.find((v: { version: string }) => v.version === "2.0.0")).toMatchObject({
      status: "published",
    })

    const history = await request(app).get("/api/services/quote-api/history")
    expect(history.body[0]).toMatchObject({ version: "2.0.0", result: "published" })
  })

  it("allows a breaking change nobody uses, with a warning", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "lonely-api", owner: "team" })
    await request(app)
      .post("/api/services/lonely-api/versions")
      .attach("spec", Buffer.from(readFixture("quote-api-v1.yaml")), { filename: "v1.yaml" })
    await request(app)
      .post("/api/services/lonely-api/versions/1.0.0/publish")
      .send({ attemptedBy: "seed" })
    await request(app)
      .post("/api/services/lonely-api/versions")
      .attach("spec", Buffer.from(readFixture("quote-api-v2-breaking.yaml")), {
        filename: "v2.yaml",
      })

    const res = await request(app)
      .post("/api/services/lonely-api/versions/2.0.0/publish")
      .send({ attemptedBy: "quote-admin" })

    expect(res.status).toBe(200)
    expect(res.body.result).toBe("published")
    expect(res.body.warning).toMatch(/no registered consumer/i)

    const history = await request(app).get("/api/services/lonely-api/history")
    expect(history.body[0]).toMatchObject({
      result: "published",
      reason: expect.stringMatching(/no registered consumer/i),
      breakingCount: 1,
    })
  })

  it("rejects publishing an already published version with 409", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)

    const res = await request(app)
      .post("/api/services/quote-api/versions/1.0.0/publish")
      .send({ attemptedBy: "quote-admin" })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already published/i)
  })

  it("rolls the transaction back when recording the attempt fails", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)
    await uploadV2(app, "quote-api-v2-safe.yaml")
    const db: AppDatabase = getDb()

    // attemptedBy violates the NOT NULL constraint, failing mid-transaction.
    await expect(
      publishVersion(db, "quote-api", "2.0.0", undefined as unknown as string),
    ).rejects.toBeTruthy()

    // Rollback proof: status is still draft and no attempt was recorded.
    const versions = await request(app).get("/api/services/quote-api/versions")
    expect(versions.body.find((v: { version: string }) => v.version === "2.0.0")).toMatchObject({
      status: "draft",
    })
    const history = await request(app).get("/api/services/quote-api/history")
    expect(history.body).toHaveLength(1) // only the seed's v1 publish

    // The transaction left no damage - a correct publish still works.
    const retry = await request(app)
      .post("/api/services/quote-api/versions/2.0.0/publish")
      .send({ attemptedBy: "quote-admin" })
    expect(retry.status).toBe(200)
  })
})

describe("GET .../history", () => {
  it("lists attempts newest first", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)
    await uploadV2(app, "quote-api-v2-safe.yaml")
    await request(app)
      .post("/api/services/quote-api/versions/2.0.0/publish")
      .send({ attemptedBy: "quote-admin" })
    // The breaking v3 gets blocked, so it appears in history without changing state.
    await request(app)
      .post("/api/services/quote-api/versions")
      .attach(
        "spec",
        Buffer.from(readFixture("quote-api-v2-breaking.yaml").replace("2.0.0", "3.0.0")),
        {
          filename: "v3.yaml",
        },
      )
    await request(app)
      .post("/api/services/quote-api/versions/3.0.0/publish")
      .send({ attemptedBy: "quote-admin" })

    const res = await request(app).get("/api/services/quote-api/history")

    expect(
      res.body.map((row: { version: string; result: string }) => `${row.version}/${row.result}`),
    ).toEqual(["3.0.0/blocked", "2.0.0/published", "1.0.0/published"])
    expect(res.body[0].attemptedBy).toBe("quote-admin")
  })
})

describe("GET .../diff", () => {
  it("returns classified changes and a readable markdown changelog", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)
    await uploadV2(app, "quote-api-v2-breaking.yaml")

    const res = await request(app).get("/api/services/quote-api/diff?from=1.0.0&to=2.0.0")

    expect(res.status).toBe(200)
    expect(res.body.changes).toEqual([
      {
        kind: "FIELD_TYPE_CHANGED",
        direction: "response",
        method: "GET",
        path: "/quote",
        location: "GET /quote › response 200 › body.premium",
        fieldPath: "body.premium",
        before: "number",
        after: "string",
        ruleId: "field.type.changed.response",
        severity: "breaking",
        reason: expect.stringMatching(/premium changed type/),
      },
    ])
    expect(res.body.changelog).toContain("### GET /quote")
    expect(res.body.changelog).toContain("**breaking**")
    expect(res.body.changelog).toContain("premium")
  })

  it("requires both versions and 404s on unknown ones", async () => {
    const app = createApp({ db: getDb() })
    await setupQuoteService(app)

    const missing = await request(app).get("/api/services/quote-api/diff?from=1.0.0")
    expect(missing.status).toBe(400)

    const unknown = await request(app).get("/api/services/quote-api/diff?from=1.0.0&to=9.9.9")
    expect(unknown.status).toBe(404)
  })
})
