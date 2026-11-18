import type { ZodError } from "zod"

/** Error carrying an HTTP status; the central handler turns it into JSON. */
export class HttpError extends Error {
  readonly status: number
  readonly details?: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

/** A zod failure becomes a 400 with per-field details. */
export function validationError(error: ZodError): HttpError {
  return new HttpError(
    400,
    "Validation failed",
    error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  )
}
