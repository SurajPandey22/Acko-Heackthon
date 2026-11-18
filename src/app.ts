import express, { type Express, type NextFunction, type Request, type Response } from "express"
import type { AppDatabase } from "./db/types.js"
import { consumersRouter } from "./modules/consumers/routes.js"
import { HttpError } from "./modules/errors.js"
import { servicesRouter } from "./modules/services/routes.js"
import { specsRouter } from "./modules/specs/routes.js"
import { MAX_UPLOAD_BYTES } from "./modules/specs/upload.js"

export interface CreateAppOptions {
  /** Injected so tests can supply their own database (e.g. PGlite). */
  db: AppDatabase
}

function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" })
}

function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    })
    return
  }
  // multer/body-parser size limits: multer sets code=LIMIT_FILE_SIZE,
  // body-parser's PayloadTooLargeError sets type=entity.too.large.
  if (typeof error === "object" && error !== null) {
    const payloadError = error as { code?: unknown; type?: unknown }
    const isTooLarge =
      payloadError.code === "LIMIT_FILE_SIZE" || payloadError.type === "entity.too.large"
    if (isTooLarge) {
      res.status(413).json({
        error: "Payload too large",
        details: { limit: MAX_UPLOAD_BYTES },
      })
      return
    }
  }
  console.error("Unhandled error:", error)
  res.status(500).json({ error: "Internal server error" })
}

export function createApp({ db }: CreateAppOptions): Express {
  const app = express()
  app.disable("x-powered-by")
  // Raw text/JSON bodies share the 1 MB upload cap; oversizes get 413.
  app.use(express.json({ limit: MAX_UPLOAD_BYTES }))
  app.use(
    express.text({
      type: ["text/*", "application/yaml", "application/x-yaml"],
      limit: MAX_UPLOAD_BYTES,
    }),
  )

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  app.use("/api/services", servicesRouter(db))
  app.use("/api/services", specsRouter(db))
  app.use("/api/consumers", consumersRouter(db))

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
