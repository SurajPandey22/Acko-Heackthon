import { validate as validateSpec } from "@apidevtools/swagger-parser"
import YAML from "yaml"
import type { LoadResult } from "./types.js"

type ParseOutcome = { ok: true; spec: unknown } | { ok: false; message: string }

/** Parse YAML or JSON text (detected by content, not file extension). */
function parseText(text: string, label: string): ParseOutcome {
  const trimmed = text.trim()
  if (trimmed === "") {
    return { ok: false, message: `${label}: the spec is empty` }
  }

  // JSON only when it looks like JSON; YAML (a superset) is the fallback so
  // detection works on content even when the extension lies.
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[")
  if (looksLikeJson) {
    try {
      return { ok: true, spec: JSON.parse(trimmed) }
    } catch {
      // fall through to YAML before giving up
    }
  }

  try {
    return { ok: true, spec: YAML.parse(trimmed) }
  } catch (error) {
    const firstLine = String((error as Error).message).split("\n")[0]
    if (looksLikeJson) {
      try {
        JSON.parse(trimmed)
      } catch (jsonError) {
        return { ok: false, message: `${label}: invalid JSON - ${(jsonError as Error).message}` }
      }
    }
    return { ok: false, message: `${label}: invalid YAML - ${firstLine}` }
  }
}

interface FieldErrors {
  errors: Array<{ message: string; path?: string }>
}

/** Validate a parsed document as OpenAPI 3.x. Cheap shape checks give clear messages. */
async function checkOpenApi3(spec: unknown, label: string): Promise<FieldErrors | undefined> {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) {
    return {
      errors: [
        { message: `${label}: the spec must be an object (a mapping), not a list or scalar` },
      ],
    }
  }

  const doc = spec as Record<string, unknown>

  if ("swagger" in doc && !("openapi" in doc)) {
    return {
      errors: [
        {
          message: `${label}: Swagger 2.0 is not supported - Contract Guard requires OpenAPI 3.x (a top-level "openapi" field, e.g. "3.0.3")`,
          path: "/openapi",
        },
      ],
    }
  }

  const version = doc.openapi
  if (typeof version !== "string") {
    return {
      errors: [
        {
          message: `${label}: not an OpenAPI document - the top-level "openapi" field with a string version (e.g. "3.0.3") is required`,
          path: "/openapi",
        },
      ],
    }
  }

  if (!version.startsWith("3")) {
    return {
      errors: [
        {
          message: `${label}: unsupported OpenAPI version "${version}" - Contract Guard supports OpenAPI 3.x only`,
          path: "/openapi",
        },
      ],
    }
  }

  try {
    // validate() only - no dereference, and it can mutate its input, so it
    // gets a deep copy; the caller's parsed spec stays exactly as uploaded.
    await validateSpec(structuredClone(doc) as unknown as Parameters<typeof validateSpec>[0])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { errors: [{ message: `${label}: invalid OpenAPI - ${message}` }] }
  }

  return undefined
}

/**
 * Load a spec from YAML or JSON text. The optional filename is used only to
 * label error messages, never to decide how to parse.
 * Pure: no DB, no Express, no filesystem.
 */
export async function loadSpec(text: string, filename?: string): Promise<LoadResult> {
  const label = filename ?? "spec"

  const parsed = parseText(text, label)
  if (!parsed.ok) {
    return { ok: false, errors: [{ message: parsed.message }] }
  }

  const fieldErrors = await checkOpenApi3(parsed.spec, label)
  if (fieldErrors) {
    return { ok: false, errors: fieldErrors.errors }
  }

  return { ok: true, spec: parsed.spec as Record<string, unknown> }
}
