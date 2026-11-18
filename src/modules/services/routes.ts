import { Router } from "express"
import { z } from "zod"
import type { AppDatabase } from "../../db/types.js"
import { validationError } from "../errors.js"
import { listServices } from "./repository.js"
import { createService } from "./service.js"

const createServiceSchema = z.object({
  name: z.string({ error: "name is required" }).trim().min(1, "name is required"),
  owner: z.string({ error: "owner is required" }).trim().min(1, "owner is required"),
})

export function servicesRouter(db: AppDatabase): Router {
  const router = Router()

  router.post("/", async (req, res) => {
    const parsed = createServiceSchema.safeParse(req.body)
    if (!parsed.success) throw validationError(parsed.error)
    const service = await createService(db, parsed.data)
    res.status(201).json(service)
  })

  router.get("/", async (_req, res) => {
    res.json(await listServices(db))
  })

  return router
}
