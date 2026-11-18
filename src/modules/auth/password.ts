import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>

const SALT_BYTES = 16
const KEY_BYTES = 64

/** Hash a password as "salt:hash" hex (random 16-byte salt, scrypt, 64-byte key). */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const hash = await scrypt(plain, salt, KEY_BYTES)
  return `${salt.toString("hex")}:${hash.toString("hex")}`
}

/**
 * Constant-time password check against a stored "salt:hash" string.
 * The key length comes from the stored hash, so timingSafeEqual never sees
 * unequal buffers; malformed storage simply fails the comparison.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(":")
    if (!saltHex || !hashHex) return false
    const salt = Buffer.from(saltHex, "hex")
    const expected = Buffer.from(hashHex, "hex")
    if (salt.length === 0 || expected.length === 0) return false

    const actual = await scrypt(plain, salt, expected.length)
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}
