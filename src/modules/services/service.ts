import { HttpError } from "../errors.js"
import { findServiceByName, insertService, type ServiceRow } from "./repository.js"

/**
 * Register a service. The name must be unique, so a repeat becomes a 409.
 */
export async function createService(
  db: Parameters<typeof findServiceByName>[0],
  input: { name: string; owner: string },
): Promise<ServiceRow> {
  const existing = await findServiceByName(db, input.name)
  if (existing) {
    throw new HttpError(409, "Service name already exists", { name: input.name })
  }
  return insertService(db, input)
}
