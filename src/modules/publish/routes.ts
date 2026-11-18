import { Router } from "express"
import { z } from "zod"
import type { AppDatabase } from "../../db/types.js"
import { HttpError, validationError } from "../errors.js"
import { diffVersions, getHistory, getImpact, publishVersion } from "./service.js"

const attemptedBySchema = z.object({
  attemptedBy: z
    .string({ error: "attemptedBy is required" })
    .trim()
    .min(1, "attemptedBy is required"),
})

export function publishRouter(db: AppDatabase): Router {
  const router = Router()

  router.get<{ name: string; v: string }>("/:name/versions/:v/impact", async (req, res) => {
    res.json(await getImpact(db, req.params.name, req.params.v))
  })

  router.post<{ name: string; v: string }>("/:name/versions/:v/publish", async (req, res) => {
    const parsed = attemptedBySchema.safeParse(req.body)
    if (!parsed.success) throw validationError(parsed.error)

    const outcome = await publishVersion(db, req.params.name, req.params.v, parsed.data.attemptedBy)
    if (outcome.result === "blocked") {
      res.status(409).json({
        result: outcome.result,
        reasons: outcome.reasons,
        affected: outcome.affected,
        summary: outcome.summary,
      })
      return
    }
    res.json({
      result: outcome.result,
      ...(outcome.warning === undefined ? {} : { warning: outcome.warning }),
      affected: outcome.affected,
      summary: outcome.summary,
    })
  })

  router.get<{ name: string }>("/:name/history", async (req, res) => {
    res.json(await getHistory(db, req.params.name))
  })

  router.get<{ name: string }>("/:name/diff", async (req, res) => {
    const from = req.query.from
    const to = req.query.to
    if (typeof from !== "string" || typeof to !== "string" || from === "" || to === "") {
      throw new HttpError(400, "Both from and to versions are required")
    }
    res.json(await diffVersions(db, req.params.name, from, to))
  })

  return router
}
