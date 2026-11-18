import type { RequestHandler } from "express"
import multer from "multer"

/** Uploads are capped at 1 MB, in memory only (nothing touches disk). */
export const MAX_UPLOAD_BYTES = 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
})

/**
 * Multipart uploads go through multer: single optional file in the "spec"
 * field, held in memory. Oversized files abort with Multer's LIMIT_FILE_SIZE
 * error, which the central error handler turns into 413.
 */
export const specUpload: RequestHandler = upload.single("spec")
