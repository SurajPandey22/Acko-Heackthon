import session from "express-session"
import request from "supertest"
import { describe, expect, it } from "vitest"
import { seed } from "../../scripts/seed.js"
import { createApp } from "../../src/app.js"
import { getDb, initTestDb } from "../helpers/testDb.js"

initTestDb()

const PASSWORD = "correct-horse-battery"

/** Seed users and build an app with a fresh MemoryStore. */
async function seededApp() {
  const db = getDb()
  await seed(db, { demoPassword: PASSWORD })
  return createApp({ db, sessionStore: new session.MemoryStore() })
}

describe("session configuration", () => {
  it("fails fast when SESSION_SECRET is missing in production", () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    delete process.env.SESSION_SECRET
    try {
      expect(() => createApp({ db: getDb(), sessionStore: new session.MemoryStore() })).toThrow(
        /SESSION_SECRET/,
      )
    } finally {
      process.env.NODE_ENV = previous
      delete process.env.SESSION_SECRET
    }
  })
})

describe("POST /api/auth/login", () => {
  it("logs in and returns the user without password data", async () => {
    const app = await seededApp()

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "quote-dev", password: PASSWORD })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: expect.any(Number),
      username: "quote-dev",
      role: "member",
      team: "quote-team",
    })
    expect(JSON.stringify(res.body)).not.toMatch(/password/i)
    // A session cookie was set with the expected name.
    expect(res.headers["set-cookie"][0]).toMatch(/^cg\.sid=/)
  })

  it("rejects a wrong password with 401", async () => {
    const app = await seededApp()

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "quote-dev", password: "wrong" })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe("Invalid username or password")
  })

  it("rejects an unknown user with the same 401 message", async () => {
    const app = await seededApp()

    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ username: "quote-dev", password: "wrong" })
    const unknownUser = await request(app)
      .post("/api/auth/login")
      .send({ username: "ghost-user", password: "whatever" })

    expect(unknownUser.status).toBe(401)
    expect(unknownUser.body.error).toBe(wrongPassword.body.error)
  })

  it("rejects a malformed body with 400", async () => {
    const app = await seededApp()

    const res = await request(app).post("/api/auth/login").send({ username: "quote-dev" })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/validation/i)
  })
})

describe("GET /api/auth/me", () => {
  it("returns the logged-in user", async () => {
    const app = await seededApp()
    const agent = request.agent(app)
    await agent.post("/api/auth/login").send({ username: "admin", password: PASSWORD })

    const res = await agent.get("/api/auth/me")

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ username: "admin", role: "admin", team: "platform" })
  })

  it("returns 401 when not logged in", async () => {
    const app = await seededApp()

    const res = await request(app).get("/api/auth/me")

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/not logged in/i)
  })
})

describe("POST /api/auth/logout", () => {
  it("destroys the session; /me then answers 401", async () => {
    const app = await seededApp()
    const agent = request.agent(app)
    await agent.post("/api/auth/login").send({ username: "claims-dev", password: PASSWORD })
    expect((await agent.get("/api/auth/me")).status).toBe(200)

    const logout = await agent.post("/api/auth/logout")

    expect(logout.status).toBe(204)
    const me = await agent.get("/api/auth/me")
    expect(me.status).toBe(401)
  })

  it("answers 204 even without a session", async () => {
    const app = await seededApp()

    const res = await request(app).post("/api/auth/logout")

    expect(res.status).toBe(204)
  })
})
