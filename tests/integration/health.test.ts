import request from "supertest"
import { describe, expect, it } from "vitest"
import { createApp } from "../../src/app.js"

// /health must not touch the database, so an empty object stands in for it here.
const app = createApp({ db: {} })

describe("GET /health", () => {
  it("responds 200 with { status: ok }", async () => {
    const res = await request(app).get("/health")

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: "ok" })
  })
})
