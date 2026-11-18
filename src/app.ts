import express, { type Express } from "express"

/**
 * db is injected so integration tests can supply their own database
 * (e.g. PGlite) while production uses the shared pool from src/db/client.ts.
 */
export interface CreateAppOptions {
  db: unknown
}

// biome-ignore lint/correctness/noUnusedFunctionParameters: db is wired into module repositories in later tasks
export function createApp({ db }: CreateAppOptions): Express {
  const app = express()
  app.disable("x-powered-by")
  app.use(express.json())

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" })
  })

  return app
}
