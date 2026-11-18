import { loadSpec } from "../../core/loader.js"
import { HttpError } from "../errors.js"
import type { ServiceRow } from "../services/repository.js"
import { findServiceByName } from "../services/repository.js"
import { findSpecVersion, insertSpecVersion, type SpecVersionRow } from "./repository.js"

interface UploadInput {
  text: string
  filename?: string
}

/**
 * Load, validate and store a new draft spec version for a service.
 * Errors map to: 404 unknown service, 400 invalid spec / no version,
 * 409 duplicate version.
 */
export async function uploadSpecVersion(
  db: Parameters<typeof findServiceByName>[0],
  serviceName: string,
  input: UploadInput,
): Promise<SpecVersionRow> {
  const service: ServiceRow | null = await findServiceByName(db, serviceName)
  if (!service) {
    throw new HttpError(404, "Service not found", { name: serviceName })
  }

  const loaded = await loadSpec(input.text, input.filename)
  if (!loaded.ok) {
    throw new HttpError(400, "Invalid spec", loaded.errors)
  }

  const info = loaded.spec.info as { version?: unknown } | undefined
  const version = typeof info?.version === "string" ? info.version : undefined
  if (!version) {
    throw new HttpError(400, "Spec has no info.version", { path: "/info/version" })
  }

  const existing = await findSpecVersion(db, service.id, version)
  if (existing) {
    throw new HttpError(409, "Version already exists", { version })
  }

  return insertSpecVersion(db, {
    serviceId: service.id,
    version,
    rawSpec: input.text,
    spec: loaded.spec,
  })
}
