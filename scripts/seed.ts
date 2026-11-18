// Seed demo data: users, services, published v1 specs (from tests/fixtures)
// and consumer registrations. Idempotent - a second run creates nothing.
// Run with: npm run seed

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { AppDatabase } from "../src/db/types.js"
import { hashPassword } from "../src/modules/auth/password.js"
import { insertUser, userExists } from "../src/modules/auth/repository.js"
import { consumerExists, insertConsumer } from "../src/modules/consumers/repository.js"
import { publishVersion } from "../src/modules/publish/service.js"
import { findServiceByName, insertService } from "../src/modules/services/repository.js"
import { findSpecVersion } from "../src/modules/specs/repository.js"
import { uploadSpecVersion } from "../src/modules/specs/service.js"

interface ServiceDefinition {
  name: string
  owner: string
  specFile: string
}

const SERVICES: ServiceDefinition[] = [
  { name: "quote-api", owner: "quote-team", specFile: "quote-api-v1.yaml" },
  { name: "policy-api", owner: "policy-team", specFile: "policy-api-v1.yaml" },
  { name: "claims-api", owner: "claims-team", specFile: "claims-api-v1.yaml" },
]

const CONSUMER_REGISTRATIONS = [
  {
    consumerName: "mobile-app",
    service: "quote-api",
    method: "GET",
    path: "/quote",
    fieldsUsed: ["premium", "quoteId"],
  },
  {
    consumerName: "mobile-app",
    service: "policy-api",
    method: "GET",
    path: "/policy/{policyId}",
    fieldsUsed: ["status", "premium"],
  },
  {
    consumerName: "partner-portal",
    service: "policy-api",
    method: "POST",
    path: "/policy",
    fieldsUsed: ["policyId"],
  },
  {
    consumerName: "payments-svc",
    service: "claims-api",
    method: "POST",
    path: "/claims",
    fieldsUsed: ["claimId", "status"],
  },
  {
    consumerName: "notifications-svc",
    service: "claims-api",
    method: "GET",
    path: "/claims/{claimId}",
    fieldsUsed: ["status"],
  },
]

export interface SeedSummary {
  usersCreated: number
  servicesCreated: number
  versionsUploaded: number
  consumersRegistered: number
}

const DEMO_USERS = [
  { username: "admin", role: "admin" as const, team: "platform" },
  { username: "quote-dev", role: "member" as const, team: "quote-team" },
  { username: "claims-dev", role: "member" as const, team: "claims-team" },
]

export interface SeedOptions {
  /** Password for the demo users. Comes from DEMO_PASSWORD via the CLI. */
  demoPassword: string
}

/**
 * Ensure the demo users, every service with a published 1.0.0 spec, and every
 * consumer registration exist. Existing rows are left untouched.
 */
export async function seed(db: AppDatabase, { demoPassword }: SeedOptions): Promise<SeedSummary> {
  const summary: SeedSummary = {
    usersCreated: 0,
    servicesCreated: 0,
    versionsUploaded: 0,
    consumersRegistered: 0,
  }
  const fixturesDir = fileURLToPath(new URL("../tests/fixtures", import.meta.url))

  for (const user of DEMO_USERS) {
    if (!(await userExists(db, user.username))) {
      await insertUser(db, {
        username: user.username,
        passwordHash: await hashPassword(demoPassword),
        role: user.role,
        team: user.team,
      })
      summary.usersCreated += 1
    }
  }

  for (const definition of SERVICES) {
    let service = await findServiceByName(db, definition.name)
    if (!service) {
      service = await insertService(db, { name: definition.name, owner: definition.owner })
      summary.servicesCreated += 1
    }

    const existing = await findSpecVersion(db, service.id, "1.0.0")
    if (!existing) {
      const text = readFileSync(join(fixturesDir, definition.specFile), "utf8")
      await uploadSpecVersion(db, definition.name, {
        text,
        filename: definition.specFile,
      })
      // v1 has no predecessor, so the publish gate lets it through and
      // records the attempt like any other publish.
      await publishVersion(db, definition.name, "1.0.0", "seed")
      summary.versionsUploaded += 1
    }
  }

  for (const registration of CONSUMER_REGISTRATIONS) {
    const service = await findServiceByName(db, registration.service)
    if (!service) {
      throw new Error(`Seed bug: service ${registration.service} is missing after seeding`)
    }
    const exists = await consumerExists(db, {
      consumerName: registration.consumerName,
      serviceId: service.id,
      method: registration.method,
      path: registration.path,
    })
    if (!exists) {
      await insertConsumer(db, {
        consumerName: registration.consumerName,
        serviceId: service.id,
        method: registration.method,
        path: registration.path,
        fieldsUsed: registration.fieldsUsed,
      })
      summary.consumersRegistered += 1
    }
  }

  return summary
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile()
  } catch {
    // No .env file - rely on the process environment.
  }
  const demoPassword = process.env.DEMO_PASSWORD
  if (!demoPassword) {
    console.error("DEMO_PASSWORD is not set - copy .env.example to .env first.")
    process.exitCode = 1
    return
  }
  const { db } = await import("../src/db/client.js")
  const summary = await seed(db, { demoPassword })

  if (
    summary.usersCreated === 0 &&
    summary.servicesCreated === 0 &&
    summary.versionsUploaded === 0 &&
    summary.consumersRegistered === 0
  ) {
    console.log("Nothing to do - database already seeded.")
    return
  }
  console.log(
    `Seeded: ${summary.usersCreated} users, ${summary.servicesCreated} services, ${summary.versionsUploaded} spec versions published, ${summary.consumersRegistered} consumer registrations.`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main()
}
