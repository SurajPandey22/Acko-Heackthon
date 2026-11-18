import { migrate } from "drizzle-orm/node-postgres/migrator"
import { createApp } from "./app.js"
import { db } from "./db/client.js"

const port = Number(process.env.PORT ?? 3000)
// Migrations live in src/db/migrations and are applied relative to the
// project root (the Dockerfile copies them into the runtime image too).
const migrationsFolder = "src/db/migrations"

try {
  await migrate(db, { migrationsFolder })
  createApp({ db }).listen(port, () => {
    console.log(`contract-guard listening on http://localhost:${port}`)
  })
} catch (error) {
  console.error("Failed to start contract-guard:", error)
  process.exitCode = 1
}
