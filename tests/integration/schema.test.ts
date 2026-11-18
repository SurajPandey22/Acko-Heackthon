import { expect, it } from "vitest"
import { services, specVersions } from "../../src/db/schema.js"
import { getDb, initTestDb } from "../helpers/testDb.js"

// One PGlite per file (beforeAll), truncated before each test, closed in afterAll.
initTestDb()

const aSpec = { openapi: "3.0.0", info: { title: "t", version: "1.0.0" }, paths: {} }

// Drizzle wraps driver errors in DrizzleQueryError, with the real Postgres
// error on .cause (message and/or 23505 unique-violation code).
function describeDbError(e: unknown): string {
  const err = e as { message?: string; cause?: { message?: string; code?: string } }
  return [err.message, err.cause?.message, err.cause?.code].filter(Boolean).join(" | ")
}

it("rejects a duplicate (service, version)", async () => {
  const db = getDb()
  const [service] = await db
    .insert(services)
    .values({ name: "quote-api", owner: "quote-team" })
    .returning()

  await db.insert(specVersions).values({
    serviceId: service.id,
    version: "1.0.0",
    rawSpec: JSON.stringify(aSpec),
    spec: aSpec,
  })

  const error = await db
    .insert(specVersions)
    .values({
      serviceId: service.id,
      version: "1.0.0",
      rawSpec: JSON.stringify(aSpec),
      spec: aSpec,
    })
    .then(
      () => null,
      (e) => e,
    )

  expect(error).toBeInstanceOf(Error)
  expect(describeDbError(error)).toMatch(/duplicate key|23505/i)
})

it("allows the same version under a different service", async () => {
  const db = getDb()
  const [a, b] = await db
    .insert(services)
    .values([
      { name: "quote-api", owner: "quote-team" },
      { name: "policy-api", owner: "policy-team" },
    ])
    .returning()

  await db.insert(specVersions).values([
    { serviceId: a.id, version: "1.0.0", rawSpec: "{}", spec: {} },
    { serviceId: b.id, version: "1.0.0", rawSpec: "{}", spec: {} },
  ])

  // beforeEach truncated, so only this test's rows are visible.
  const rows = await db.select().from(specVersions)
  expect(rows).toHaveLength(2)
})
