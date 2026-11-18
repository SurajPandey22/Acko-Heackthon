import type { Request } from "express"
import { Router } from "express"
import type { AppDatabase } from "../../db/types.js"
import { HttpError } from "../errors.js"
import { findServiceByName } from "../services/repository.js"
import { listSpecVersions } from "./repository.js"
import { uploadSpecVersion } from "./service.js"
import { specUpload } from "./upload.js"

/** The spec text and its filename from a multer multipart or raw-text upload. */
function readSpecUpload(req: Request): { text: string; filename?: string } {
  const file = req.file
  if (file) {
    return {
      text: file.buffer.toString("utf8"),
      ...(file.originalname ? { filename: file.originalname } : {}),
    }
  }

  if (typeof req.body === "string") {
    return { text: req.body }
  }
  if (req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
    // Parsed by express.json() - reload it as text for the shared loader.
    return { text: JSON.stringify(req.body) }
  }

  throw new HttpError(400, 'Send the spec as a multipart file field "spec" or a text body')
}

export function specsRouter(db: AppDatabase): Router {
  const router = Router()

  router.get<{ name: string }>("/:name/versions", async (req, res) => {
    const service = await findServiceByName(db, req.params.name)
    if (!service) throw new HttpError(404, "Service not found", { name: req.params.name })
    res.json(await listSpecVersions(db, service.id))
  })

  router.post<{ name: string }>("/:name/versions", specUpload, async (req, res) => {
    const upload = readSpecUpload(req)
    const created = await uploadSpecVersion(db, req.params.name, upload)
    res.status(201).json(created)
  })

  return router
}
