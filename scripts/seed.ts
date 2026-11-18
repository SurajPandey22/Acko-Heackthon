// Seed demo data: services, published v1 specs (from tests/fixtures) and
// consumer registrations. Idempotent - a second run creates nothing.
// Run with: npm run seed

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { AppDatabase } from "../src/db/types.js"
import { consumerExists, insertConsumer } from "../src/modules/consumers/repository.js"
import { findServiceByName, insertService } from "../src/modules/services/repository.js"
import { findSpecVersion, markSpecVersionPublished } from "../src/modules/specs/repository.js"
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
  servicesCreated: number
  versionsUploaded: number
  consumersRegistered: number
}

/**
 * Ensure every service exists with a published 1.0.0 spec and every
 * consumer registration exists. Existing rows are left untouched.
 */
export async function seed(db: AppDatabase): Promise<SeedSummary> {
  const summary: SeedSummary = { servicesCreated: 0, versionsUploaded: 0, consumersRegistered: 0 }
  const fixturesDir = fileURLToPath(new URL("../tests/fixtures", import.meta.url))

  for (const definition of SERVICES) {
    let service = await findServiceByName(db, definition.name)
    if (!service) {
      service = await insertService(db, { name: definition.name, owner: definition.owner })
      summary.servicesCreated += 1
    }

    const existing = await findSpecVersion(db, service.id, "1.0.0")
    if (!existing) {
      const text = readFileSync(join(fixturesDir, definition.specFile), "utf8")
      const created = await uploadSpecVersion(db, definition.name, {
        text,
        filename: definition.specFile,
      })
      // v1 has no predecessor, so there is nothing to block on; the publish
      // gate module will take over this step when it exists.
      await markSpecVersionPublished(db, created.id)
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
  const { db } = await import("../src/db/client.js")
  const summary = await seed(db)

  if (
    summary.servicesCreated === 0 &&
    summary.versionsUploaded === 0 &&
    summary.consumersRegistered === 0
  ) {
    console.log("Nothing to do - database already seeded.")
    return
  }
  console.log(
    `Seeded: ${summary.servicesCreated} services, ${summary.versionsUploaded} spec versions published, ${summary.consumersRegistered} consumer registrations.`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main()
}
