import connectPgSimple from "connect-pg-simple"
import express, { type Express, type NextFunction, type Request, type Response } from "express"
import session from "express-session"
import type { AppDatabase } from "./db/types.js"
import { authRouter } from "./modules/auth/routes.js"
import { SESSION_COOKIE_NAME } from "./modules/auth/session.js"
import { consumersRouter } from "./modules/consumers/routes.js"
import { HttpError } from "./modules/errors.js"
import { publishRouter } from "./modules/publish/routes.js"
import { servicesRouter } from "./modules/services/routes.js"
import { specsRouter } from "./modules/specs/routes.js"
import { MAX_UPLOAD_BYTES } from "./modules/specs/upload.js"

export interface CreateAppOptions {
  /** Injected so tests can supply their own database (e.g. PGlite). */
  db: AppDatabase
  /** Injected session store (tests use MemoryStore; the app uses Postgres). */
  sessionStore?: session.Store
}

const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required when NODE_ENV=production")
  }
  return "dev-only-insecure-secret"
}

/** Postgres-backed session store (table created on first use). */
function pgSessionStore(): session.Store {
  const PGStore = connectPgSimple(session)
  return new PGStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
  })
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

export function createApp({ db, sessionStore }: CreateAppOptions): Express {
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

  // Server-side sessions: Postgres store in production, injected store in tests.
  app.use(
    session({
      name: SESSION_COOKIE_NAME,
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      store: sessionStore ?? pgSessionStore(),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: SESSION_MAX_AGE_MS,
      },
    }),
  )

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  app.use("/api/auth", authRouter(db))
  app.use("/api/services", servicesRouter(db))
  app.use("/api/services", specsRouter(db))
  app.use("/api/services", publishRouter(db))
  app.use("/api/consumers", consumersRouter(db))

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
