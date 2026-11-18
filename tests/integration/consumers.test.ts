import request from "supertest"
import { describe, expect, it } from "vitest"
import { seed } from "../../scripts/seed.js"
import { createApp } from "../../src/app.js"
import { getDb, initTestDb } from "../helpers/testDb.js"

initTestDb()

describe("POST /api/consumers", () => {
  it("registers a consumer and uppercases the method", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "quote-api", owner: "quote-team" })

    const res = await request(app)
      .post("/api/consumers")
      .send({
        consumerName: "mobile-app",
        service: "quote-api",
        method: "get",
        path: "/quote",
        fieldsUsed: ["premium"],
      })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      consumerName: "mobile-app",
      service: "quote-api",
      method: "GET",
      path: "/quote",
      fieldsUsed: ["premium"],
    })
  })

  it("defaults fieldsUsed to an empty list", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "quote-api", owner: "quote-team" })

    const res = await request(app)
      .post("/api/consumers")
      .send({ consumerName: "whole-api", service: "quote-api", method: "GET", path: "/quote" })

    expect(res.status).toBe(201)
    expect(res.body.fieldsUsed).toEqual([])
  })

  it("rejects an unknown service with 404", async () => {
    const app = createApp({ db: getDb() })

    const res = await request(app).post("/api/consumers").send({
      consumerName: "mobile-app",
      service: "ghost-api",
      method: "GET",
      path: "/quote",
    })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })

  it("rejects an invalid body with 400 and details", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "quote-api", owner: "quote-team" })

    const res = await request(app).post("/api/consumers").send({
      consumerName: "mobile-app",
      service: "quote-api",
      method: "BREW",
      path: "quote",
    })

    expect(res.status).toBe(400)
    expect(res.body.details).toEqual([
      { path: "method", message: "method must be a valid HTTP verb" },
      { path: "path", message: "path must start with /" },
    ])
  })

  it("rejects an exact duplicate registration with 409", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "quote-api", owner: "quote-team" })
    const registration = {
      consumerName: "mobile-app",
      service: "quote-api",
      method: "GET",
      path: "/quote",
    }
    await request(app).post("/api/consumers").send(registration)

    const res = await request(app).post("/api/consumers").send(registration)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already exists/i)
  })
})

describe("GET /api/consumers", () => {
  it("lists all consumers when no filter is given", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "quote-api", owner: "q" })
    await request(app).post("/api/services").send({ name: "claims-api", owner: "c" })
    await request(app).post("/api/consumers").send({
      consumerName: "mobile-app",
      service: "quote-api",
      method: "GET",
      path: "/quote",
    })
    await request(app).post("/api/consumers").send({
      consumerName: "payments-svc",
      service: "claims-api",
      method: "POST",
      path: "/claims",
    })

    const res = await request(app).get("/api/consumers")

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body.map((row: { consumerName: string }) => row.consumerName)).toEqual([
      "mobile-app",
      "payments-svc",
    ])
  })

  it("filters by service", async () => {
    const app = createApp({ db: getDb() })
    await request(app).post("/api/services").send({ name: "quote-api", owner: "q" })
    await request(app).post("/api/services").send({ name: "claims-api", owner: "c" })
    await request(app).post("/api/consumers").send({
      consumerName: "mobile-app",
      service: "quote-api",
      method: "GET",
      path: "/quote",
    })
    await request(app).post("/api/consumers").send({
      consumerName: "payments-svc",
      service: "claims-api",
      method: "POST",
      path: "/claims",
    })

    const res = await request(app).get("/api/consumers?service=claims-api")

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ consumerName: "payments-svc", service: "claims-api" })
  })

  it("rejects an unknown service filter with 404", async () => {
    const app = createApp({ db: getDb() })

    const res = await request(app).get("/api/consumers?service=ghost-api")

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/not found/i)
  })
})

describe("seed", () => {
  it("seeds services, published versions and consumers, and is idempotent", async () => {
    const db = getDb()
    const app = createApp({ db })

    const first = await seed(db)
    expect(first).toEqual({ servicesCreated: 3, versionsUploaded: 3, consumersRegistered: 5 })

    const servicesAfterFirst = await request(app).get("/api/services")
    const consumersAfterFirst = await request(app).get("/api/consumers")

    const second = await seed(db)
    expect(second).toEqual({ servicesCreated: 0, versionsUploaded: 0, consumersRegistered: 0 })

    const servicesAfterSecond = await request(app).get("/api/services")
    const consumersAfterSecond = await request(app).get("/api/consumers")
    expect(servicesAfterSecond.body).toEqual(servicesAfterFirst.body)
    expect(consumersAfterSecond.body).toEqual(consumersAfterFirst.body)

    // Every seeded service has exactly one published 1.0.0.
    for (const service of servicesAfterSecond.body) {
      const versions = await request(app).get(`/api/services/${service.name}/versions`)
      expect(versions.body).toHaveLength(1)
      expect(versions.body[0]).toMatchObject({ version: "1.0.0", status: "published" })
    }

    // Consumer registrations are realistic and field-scoped.
    const mobileQuote = consumersAfterSecond.body.find(
      (row: { consumerName: string; path: string }) =>
        row.consumerName === "mobile-app" && row.path === "/quote",
    )
    expect(mobileQuote).toMatchObject({
      service: "quote-api",
      method: "GET",
      fieldsUsed: ["premium", "quoteId"],
    })
  })
})
