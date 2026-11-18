import { Router } from "express"
import { z } from "zod"
import type { AppDatabase } from "../../db/types.js"
import { HttpError, validationError } from "../errors.js"
import { findServiceByName } from "../services/repository.js"
import { listConsumers } from "./repository.js"
import { registerConsumer } from "./service.js"

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const

const registerSchema = z.object({
  consumerName: z
    .string({ error: "consumerName is required" })
    .trim()
    .min(1, "consumerName is required"),
  service: z.string({ error: "service is required" }).trim().min(1, "service is required"),
  // Accept any case on input, always store uppercase.
  method: z
    .string({ error: "method is required" })
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(HTTP_METHODS, { error: "method must be a valid HTTP verb" })),
  path: z
    .string({ error: "path is required" })
    .trim()
    .min(1, "path is required")
    .regex(/^\//, "path must start with /"),
  fieldsUsed: z.array(z.string().trim().min(1)).default([]),
})

export function consumersRouter(db: AppDatabase): Router {
  const router = Router()

  router.post("/", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) throw validationError(parsed.error)
    const consumer = await registerConsumer(db, parsed.data)
    res.status(201).json(consumer)
  })

  router.get("/", async (req, res) => {
    const serviceName = req.query.service
    if (typeof serviceName === "string" && serviceName !== "") {
      const service = await findServiceByName(db, serviceName)
      if (!service) throw new HttpError(404, "Service not found", { name: serviceName })
      res.json(await listConsumers(db, service.id))
      return
    }
    res.json(await listConsumers(db))
  })

  return router
}
