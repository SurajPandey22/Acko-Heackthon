import { HttpError } from "../errors.js"
import { verifyPassword } from "./password.js"
import { findUserByUsername } from "./repository.js"
import type { SessionUser } from "./session.js"

/**
 * Check credentials. Unknown user and wrong password fail identically so
 * the error never reveals which usernames exist.
 */
export async function authenticate(
  db: Parameters<typeof findUserByUsername>[0],
  credentials: { username: string; password: string },
): Promise<SessionUser> {
  const user = await findUserByUsername(db, credentials.username)
  const ok = user !== null && (await verifyPassword(credentials.password, user.passwordHash))
  if (!user || !ok) {
    throw new HttpError(401, "Invalid username or password")
  }
  return { id: user.id, username: user.username, role: user.role, team: user.team }
}
