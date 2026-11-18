import { HttpError } from "../errors.js"
import { findServiceByName } from "../services/repository.js"
import { type ConsumerRow, consumerExists, insertConsumer } from "./repository.js"

export interface RegisterConsumerInput {
  consumerName: string
  service: string
  method: string
  path: string
  fieldsUsed: string[]
}

/**
 * Register what a consumer uses on a service. The service must exist (404)
 * and the exact registration must be new (409).
 */
export async function registerConsumer(
  db: Parameters<typeof findServiceByName>[0],
  input: RegisterConsumerInput,
): Promise<ConsumerRow> {
  const target = await findServiceByName(db, input.service)
  if (!target) {
    throw new HttpError(404, "Service not found", { name: input.service })
  }

  const duplicate = await consumerExists(db, {
    consumerName: input.consumerName,
    serviceId: target.id,
    method: input.method,
    path: input.path,
  })
  if (duplicate) {
    throw new HttpError(409, "Consumer registration already exists", {
      consumerName: input.consumerName,
      service: input.service,
      method: input.method,
      path: input.path,
    })
  }

  const row = await insertConsumer(db, {
    consumerName: input.consumerName,
    serviceId: target.id,
    method: input.method,
    path: input.path,
    fieldsUsed: input.fieldsUsed,
  })
  return {
    id: row.id,
    consumerName: input.consumerName,
    method: input.method,
    path: input.path,
    fieldsUsed: input.fieldsUsed,
    service: target.name,
  }
}
