import type { Request } from "express"

/** The user shape kept in the session and returned by the auth endpoints. */
export interface SessionUser {
  id: number
  username: string
  role: "admin" | "member"
  team: string
}

export const SESSION_COOKIE_NAME = "cg.sid"

declare module "express-session" {
  interface SessionData {
    user?: SessionUser
  }
}

/** New session id on login (session-fixation defence), promisified. */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()))
  })
}

/** End the session server-side, promisified. */
export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()))
  })
}
