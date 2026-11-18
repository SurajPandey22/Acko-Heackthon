import { Router } from "express"
import { z } from "zod"
import type { AppDatabase } from "../../db/types.js"
import { HttpError, validationError } from "../errors.js"
import { authenticate } from "./service.js"
import { destroySession, regenerateSession, SESSION_COOKIE_NAME } from "./session.js"

const loginSchema = z.object({
  username: z.string({ error: "username is required" }).trim().min(1, "username is required"),
  password: z.string({ error: "password is required" }).min(1, "password is required"),
})

export function authRouter(db: AppDatabase): Router {
  const router = Router()

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) throw validationError(parsed.error)

    const user = await authenticate(db, parsed.data)
    // Fresh session id on every login, so a stolen pre-login cookie is useless.
    await regenerateSession(req)
    req.session.user = user
    res.json(user)
  })

  router.post("/logout", async (req, res) => {
    await destroySession(req)
    res.clearCookie(SESSION_COOKIE_NAME)
    res.status(204).end()
  })

  router.get("/me", (req, res) => {
    if (!req.session.user) throw new HttpError(401, "Not logged in")
    res.json(req.session.user)
  })

  return router
}
