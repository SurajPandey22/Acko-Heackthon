// Hand-written $ref resolver. No diff/ref libraries - AGENTS.md hard rule.

const CIRCULAR_MARKER = "x-circular-ref"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Follow a local JSON-pointer ref like "#/components/schemas/Quote" into
 * root. ~0 and ~1 escapes are unescaped per RFC 6901. Returns undefined for
 * anything we cannot follow (external refs, dangling pointers).
 */
function getLocalRef(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined

  const segments = ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"))

  let current: unknown = root
  for (const segment of segments) {
    if (!isPlainObject(current)) return undefined
    current = current[segment]
  }
  return current
}

/**
 * Fold resolved allOf parts into one schema: properties are merged (later
 * parts win on name clashes), required lists are unioned, every other key
 * is overwritten by later parts. The host object's own keys are merged last
 * so they win over the parts.
 */
function mergeAllOfParts(
  parts: Array<unknown>,
  host: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const part of [...parts, host]) {
    if (!isPlainObject(part)) continue
    for (const [key, value] of Object.entries(part)) {
      if (key === "properties" && isPlainObject(value)) {
        merged.properties = {
          ...((merged.properties as Record<string, unknown> | undefined) ?? {}),
          ...value,
        }
      } else if (key === "required" && Array.isArray(value)) {
        merged.required = [
          ...new Set([...((merged.required as string[] | undefined) ?? []), ...value]),
        ]
      } else {
        merged[key] = value
      }
    }
  }
  return merged
}

/**
 * Return a fresh copy of node with every local $ref replaced by the object
 * it points at. activeRefs holds the refs on the current expansion path:
 * a ref that is already being expanded is a cycle and becomes the marker
 * object instead of recursing forever.
 */
function resolveNode(node: unknown, root: unknown, activeRefs: Set<string>): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => resolveNode(item, root, activeRefs))
  }
  if (!isPlainObject(node)) {
    return node
  }

  const ref = node.$ref
  if (typeof ref === "string" && Object.keys(node).length === 1) {
    const target = getLocalRef(root, ref)
    if (target === undefined) {
      // External or unresolvable ref: keep it so nothing is silently lost.
      return { $ref: ref }
    }
    if (activeRefs.has(ref)) {
      return { [CIRCULAR_MARKER]: ref }
    }
    activeRefs.add(ref)
    const resolved = resolveNode(target, root, activeRefs)
    activeRefs.delete(ref)
    return resolved
  }

  const resolved: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    resolved[key] = resolveNode(value, root, activeRefs)
  }

  const allOf = resolved.allOf
  if (Array.isArray(allOf)) {
    delete resolved.allOf
    return mergeAllOfParts(allOf, resolved)
  }
  return resolved
}

/**
 * Resolve every local $ref in a spec into the object it references.
 * Pure: builds a new structure and never mutates the input.
 */
export function resolveSpec(spec: Record<string, unknown>): Record<string, unknown> {
  return resolveNode(spec, spec, new Set()) as Record<string, unknown>
}
