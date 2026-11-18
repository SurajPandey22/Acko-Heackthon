// Hand-written differ between two RESOLVED specs. No diff libraries - AGENTS.md
// hard rule. It reports raw changes only; breaking/safe is the classifier's job.

import type { Change, ChangeDirection, ChangeKind } from "./types.js"

type Json = Record<string, unknown>

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"]

interface OperationContext {
  method: string
  path: string
}

interface FieldContext {
  direction: ChangeDirection
  /** Human-readable prefix, e.g. "GET /quote › response 200". */
  locationBase: string
  /** Dotted path so far, e.g. "body.quote". */
  fieldPath: string
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Schema "type" as a comparable string (OpenAPI allows a list of types). */
function schemaType(schema: Json): string | undefined {
  const type = schema.type
  if (typeof type === "string") return type
  if (Array.isArray(type)) return type.map(String).join("|")
  return undefined
}

/**
 * Type treating a schema without "type" but with "properties" as an implicit
 * object, so explicit and implicit objects compare equal.
 */
function effectiveType(schema: Json): string | undefined {
  const type = schemaType(schema)
  if (type) return type
  if ("properties" in schema) return "object"
  return undefined
}

function requiredNames(schema: Json): Set<string> {
  const required = schema.required
  return new Set(
    Array.isArray(required) ? required.filter((x): x is string => typeof x === "string") : [],
  )
}

function enumValues(schema: Json): unknown[] | undefined {
  return Array.isArray(schema.enum) ? schema.enum : undefined
}

function schemaOfParam(param: Json): Json {
  return isObject(param.schema) ? param.schema : {}
}

/** The JSON body schema of a content map, or undefined when absent. */
function jsonSchemaOf(content: unknown): Json | undefined {
  if (!isObject(content)) return undefined
  const json = content["application/json"]
  if (isObject(json) && isObject(json.schema)) return json.schema
  return undefined
}

function fieldChange(
  kind: ChangeKind,
  ctx: FieldContext,
  op: OperationContext,
  extra: { before?: unknown; after?: unknown; required?: boolean },
): Change {
  return {
    kind,
    direction: ctx.direction,
    method: op.method,
    path: op.path,
    location: `${ctx.locationBase} › ${ctx.fieldPath}`,
    fieldPath: ctx.fieldPath,
    ...extra,
  }
}

export function diffSpecs(
  oldSpec: Record<string, unknown>,
  newSpec: Record<string, unknown>,
): Change[] {
  const changes: Change[] = []
  diffPaths(oldSpec.paths, newSpec.paths, changes)
  return changes
}

function diffPaths(oldPaths: unknown, newPaths: unknown, changes: Change[]): void {
  const oldP = isObject(oldPaths) ? oldPaths : {}
  const newP = isObject(newPaths) ? newPaths : {}

  for (const [path, newItem] of Object.entries(newP)) {
    if (!(path in oldP)) {
      changes.push(endpointChange("ENDPOINT_ADDED", path, newItem))
      continue
    }
    diffPathItem(oldP[path], newItem, path, changes)
  }
  for (const [path, oldItem] of Object.entries(oldP)) {
    if (!(path in newP)) {
      changes.push(endpointChange("ENDPOINT_REMOVED", path, oldItem))
    }
  }
}

function endpointChange(kind: ChangeKind, path: string, pathItem: unknown): Change {
  const method = isObject(pathItem) ? firstMethodOf(pathItem) : ""
  return {
    kind,
    direction: "endpoint",
    method,
    path,
    location: method ? `${method} ${path}` : path,
  }
}

function firstMethodOf(pathItem: Json): string {
  for (const method of HTTP_METHODS) {
    if (method in pathItem) return method.toUpperCase()
  }
  return ""
}

function operationsOf(pathItem: unknown): Map<string, Json> {
  const operations = new Map<string, Json>()
  if (!isObject(pathItem)) return operations
  for (const method of HTTP_METHODS) {
    const operation = pathItem[method]
    if (isObject(operation)) operations.set(method, operation)
  }
  return operations
}

function diffPathItem(oldItem: unknown, newItem: unknown, path: string, changes: Change[]): void {
  const oldOps = operationsOf(oldItem)
  const newOps = operationsOf(newItem)

  for (const [method, newOp] of newOps) {
    const oldOp = oldOps.get(method)
    if (!oldOp) {
      changes.push({
        kind: "METHOD_ADDED",
        direction: "endpoint",
        method: method.toUpperCase(),
        path,
        location: `${method.toUpperCase()} ${path}`,
      })
      continue
    }
    diffOperation(oldItem, oldOp, newItem, newOp, { method: method.toUpperCase(), path }, changes)
  }
  for (const [method] of oldOps) {
    if (!newOps.has(method)) {
      changes.push({
        kind: "METHOD_REMOVED",
        direction: "endpoint",
        method: method.toUpperCase(),
        path,
        location: `${method.toUpperCase()} ${path}`,
      })
    }
  }
}

function diffOperation(
  oldPathItem: unknown,
  oldOp: Json,
  newPathItem: unknown,
  newOp: Json,
  op: OperationContext,
  changes: Change[],
): void {
  const base = `${op.method} ${op.path}`
  // Path-item level parameters apply to every operation in the item.
  const oldParams = [...paramsOf(oldPathItem), ...paramsOf(oldOp)]
  const newParams = [...paramsOf(newPathItem), ...paramsOf(newOp)]

  diffParameters(oldParams, newParams, op, base, changes)
  diffRequestBody(
    isObject(oldOp.requestBody) ? oldOp.requestBody : undefined,
    isObject(newOp.requestBody) ? newOp.requestBody : undefined,
    op,
    base,
    changes,
  )
  diffResponses(
    isObject(oldOp.responses) ? oldOp.responses : {},
    isObject(newOp.responses) ? newOp.responses : {},
    op,
    base,
    changes,
  )
}

function paramsOf(node: unknown): Json[] {
  if (!isObject(node) || !Array.isArray(node.parameters)) return []
  return node.parameters.filter(isObject)
}

function paramKey(param: Json): string {
  return `${String(param.in)}|${String(param.name)}`
}

function diffParameters(
  oldParams: Json[],
  newParams: Json[],
  op: OperationContext,
  base: string,
  changes: Change[],
): void {
  const oldByKey = new Map(oldParams.map((p) => [paramKey(p), p]))
  const newByKey = new Map(newParams.map((p) => [paramKey(p), p]))
  const locationOf = (param: Json) =>
    `${base} › parameter ${String(param.name)} (${String(param.in)})`

  for (const [key, param] of newByKey) {
    if (oldByKey.has(key)) continue
    changes.push({
      kind: "PARAM_ADDED",
      direction: "request",
      method: op.method,
      path: op.path,
      location: locationOf(param),
      fieldPath: `${String(param.in)}.${String(param.name)}`,
      after: param,
      required: param.required === true,
    })
  }
  for (const [key, param] of oldByKey) {
    if (newByKey.has(key)) continue
    changes.push({
      kind: "PARAM_REMOVED",
      direction: "request",
      method: op.method,
      path: op.path,
      location: locationOf(param),
      fieldPath: `${String(param.in)}.${String(param.name)}`,
      before: param,
    })
  }
  for (const [key, newParam] of newByKey) {
    const oldParam = oldByKey.get(key)
    if (!oldParam) continue

    const wasRequired = oldParam.required === true
    const isRequired = newParam.required === true
    if (wasRequired !== isRequired) {
      changes.push({
        kind: "PARAM_REQUIRED_CHANGED",
        direction: "request",
        method: op.method,
        path: op.path,
        location: locationOf(newParam),
        fieldPath: `${String(newParam.in)}.${String(newParam.name)}`,
        before: wasRequired,
        after: isRequired,
        required: isRequired,
      })
    }

    const oldType = schemaType(schemaOfParam(oldParam))
    const newType = schemaType(schemaOfParam(newParam))
    if (oldType !== newType) {
      changes.push({
        kind: "PARAM_TYPE_CHANGED",
        direction: "request",
        method: op.method,
        path: op.path,
        location: locationOf(newParam),
        fieldPath: `${String(newParam.in)}.${String(newParam.name)}`,
        before: oldType ?? null,
        after: newType ?? null,
      })
    }
  }
}

function diffRequestBody(
  oldBody: Json | undefined,
  newBody: Json | undefined,
  op: OperationContext,
  base: string,
  changes: Change[],
): void {
  const ctx: FieldContext = {
    direction: "request",
    locationBase: `${base} › request body`,
    fieldPath: "body",
  }
  const oldSchema = jsonSchemaOf(oldBody?.content)
  const newSchema = jsonSchemaOf(newBody?.content)

  if (oldSchema && newSchema) {
    diffSchema(oldSchema, newSchema, ctx, op, changes)
    return
  }
  if (newSchema && !oldSchema) {
    changes.push(
      fieldChange("FIELD_ADDED", ctx, op, {
        after: newSchema,
        required: newBody?.required === true,
      }),
    )
  } else if (oldSchema && !newSchema) {
    changes.push(fieldChange("FIELD_REMOVED", ctx, op, { before: oldSchema }))
  }
}

function diffResponses(
  oldResponses: Json,
  newResponses: Json,
  op: OperationContext,
  base: string,
  changes: Change[],
): void {
  for (const [code] of Object.entries(newResponses)) {
    if (!(code in oldResponses)) {
      changes.push({
        kind: "STATUS_CODE_ADDED",
        direction: "response",
        method: op.method,
        path: op.path,
        location: `${base} › response ${code}`,
        after: code,
      })
    }
  }
  for (const [code] of Object.entries(oldResponses)) {
    if (!(code in newResponses)) {
      changes.push({
        kind: "STATUS_CODE_REMOVED",
        direction: "response",
        method: op.method,
        path: op.path,
        location: `${base} › response ${code}`,
        before: code,
      })
    }
  }

  for (const [code, newResponse] of Object.entries(newResponses)) {
    const oldResponse = oldResponses[code]
    if (!oldResponse || !isObject(newResponse) || !isObject(oldResponse)) continue

    const ctx: FieldContext = {
      direction: "response",
      locationBase: `${base} › response ${code}`,
      fieldPath: "body",
    }
    const oldSchema = jsonSchemaOf(oldResponse.content)
    const newSchema = jsonSchemaOf(newResponse.content)

    if (oldSchema && newSchema) {
      diffSchema(oldSchema, newSchema, ctx, op, changes)
    } else if (newSchema && !oldSchema) {
      changes.push(fieldChange("FIELD_ADDED", ctx, op, { after: newSchema }))
    } else if (oldSchema && !newSchema) {
      changes.push(fieldChange("FIELD_REMOVED", ctx, op, { before: oldSchema }))
    }
  }
}

function diffSchema(
  oldSchema: Json,
  newSchema: Json,
  ctx: FieldContext,
  op: OperationContext,
  changes: Change[],
): void {
  const oldType = effectiveType(oldSchema)
  const newType = effectiveType(newSchema)
  if (oldType && newType && oldType !== newType) {
    // The whole shape changed; comparing properties across types is noise.
    changes.push(fieldChange("FIELD_TYPE_CHANGED", ctx, op, { before: oldType, after: newType }))
    return
  }

  diffEnum(oldSchema, newSchema, ctx, op, changes)

  const type = oldType ?? newType
  if (type === "object") diffProperties(oldSchema, newSchema, ctx, op, changes)
  if (type === "array") diffArrayItems(oldSchema, newSchema, ctx, op, changes)
}

function diffEnum(
  oldSchema: Json,
  newSchema: Json,
  ctx: FieldContext,
  op: OperationContext,
  changes: Change[],
): void {
  const oldEnum = enumValues(oldSchema)
  const newEnum = enumValues(newSchema)
  if (!oldEnum || !newEnum) return

  const oldKeys = new Set(oldEnum.map((value) => JSON.stringify(value)))
  const newKeys = new Set(newEnum.map((value) => JSON.stringify(value)))

  for (const value of newEnum) {
    if (!oldKeys.has(JSON.stringify(value))) {
      changes.push(fieldChange("ENUM_VALUE_ADDED", ctx, op, { after: value }))
    }
  }
  for (const value of oldEnum) {
    if (!newKeys.has(JSON.stringify(value))) {
      changes.push(fieldChange("ENUM_VALUE_REMOVED", ctx, op, { before: value }))
    }
  }
}

function diffProperties(
  oldSchema: Json,
  newSchema: Json,
  ctx: FieldContext,
  op: OperationContext,
  changes: Change[],
): void {
  const oldProps = isObject(oldSchema.properties) ? oldSchema.properties : {}
  const newProps = isObject(newSchema.properties) ? newSchema.properties : {}
  const oldRequired = requiredNames(oldSchema)
  const newRequired = requiredNames(newSchema)

  for (const name of Object.keys(newProps)) {
    const child: FieldContext = { ...ctx, fieldPath: `${ctx.fieldPath}.${name}` }
    if (!(name in oldProps)) {
      changes.push(
        fieldChange("FIELD_ADDED", child, op, {
          after: newProps[name],
          required: newRequired.has(name),
        }),
      )
    } else {
      const wasRequired = oldRequired.has(name)
      const isRequired = newRequired.has(name)
      if (wasRequired !== isRequired) {
        changes.push(
          fieldChange(isRequired ? "FIELD_REQUIRED_ADDED" : "FIELD_REQUIRED_REMOVED", child, op, {
            before: wasRequired,
            after: isRequired,
            required: isRequired,
          }),
        )
      }
    }
  }
  for (const name of Object.keys(oldProps)) {
    if (!(name in newProps)) {
      changes.push(
        fieldChange("FIELD_REMOVED", { ...ctx, fieldPath: `${ctx.fieldPath}.${name}` }, op, {
          before: oldProps[name],
        }),
      )
    }
  }
  for (const name of Object.keys(newProps)) {
    const oldProp = oldProps[name]
    const newProp = newProps[name]
    if (isObject(oldProp) && isObject(newProp)) {
      diffSchema(oldProp, newProp, { ...ctx, fieldPath: `${ctx.fieldPath}.${name}` }, op, changes)
    }
  }
}

function diffArrayItems(
  oldSchema: Json,
  newSchema: Json,
  ctx: FieldContext,
  op: OperationContext,
  changes: Change[],
): void {
  if (isObject(oldSchema.items) && isObject(newSchema.items)) {
    diffSchema(
      oldSchema.items,
      newSchema.items,
      { ...ctx, fieldPath: `${ctx.fieldPath}[]` },
      op,
      changes,
    )
  }
}
