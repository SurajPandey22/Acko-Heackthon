import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "../../src/modules/auth/password.js"

describe("password hashing", () => {
  it("verifies the correct password", async () => {
    const stored = await hashPassword("correct-horse-battery")
    await expect(verifyPassword("correct-horse-battery", stored)).resolves.toBe(true)
  })

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct-horse-battery")
    await expect(verifyPassword("wrong-password", stored)).resolves.toBe(false)
  })

  it("salts randomly, so two hashes of the same password differ", async () => {
    const first = await hashPassword("same-secret")
    const second = await hashPassword("same-secret")

    expect(first).not.toBe(second)
    // ...but both still verify.
    await expect(verifyPassword("same-secret", first)).resolves.toBe(true)
    await expect(verifyPassword("same-secret", second)).resolves.toBe(true)
  })

  it("stores salt and hash as hex separated by a colon", async () => {
    const stored = await hashPassword("anything")

    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/)
  })

  it("fails safely on malformed storage", async () => {
    await expect(verifyPassword("pw", "not-a-valid-hash")).resolves.toBe(false)
    await expect(verifyPassword("pw", "")).resolves.toBe(false)
  })
})
