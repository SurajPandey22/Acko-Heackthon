import { describe, expect, it } from "vitest"
import { classify } from "../../src/core/classifier.js"
import { fieldTouches, findImpact, pathMatches } from "../../src/core/impact.js"
import type { Change, Consumer } from "../../src/core/types.js"

function changeOf(
  fixture: Partial<Change> & Pick<Change, "kind" | "method" | "path" | "location">,
) {
  const [classified] = classify([fixture as Change])
  return classified
}

const TYPE_CHANGED_PREMIUM = () =>
  changeOf({
    kind: "FIELD_TYPE_CHANGED",
    direction: "response",
    method: "GET",
    path: "/policy/{policyId}",
    location: "GET /policy/{policyId} › response 200 › body.status",
    fieldPath: "body.status",
    before: "string",
    after: "number",
  })

describe("pathMatches", () => {
  it("matches identical templates with different placeholder names", () => {
    expect(pathMatches("/policy/{id}", "/policy/{policyId}")).toBe(true)
  })

  it("does not match different segment counts or different literals", () => {
    expect(pathMatches("/policy/{id}", "/policy/{id}/items")).toBe(false)
    expect(pathMatches("/policy/{id}", "/claims/{id}")).toBe(false)
    expect(pathMatches("/policy/{id}", "/policy/active")).toBe(false)
  })
})

describe("fieldTouches", () => {
  it("matches the same field with and without the body. prefix", () => {
    expect(fieldTouches("body.quote.premium", "quote.premium")).toBe(true)
    expect(fieldTouches("body.quote.premium", "body.quote.premium")).toBe(true)
  })

  it("a change to a parent touches consumers of its children", () => {
    expect(fieldTouches("body.quote", "quote.premium")).toBe(true)
    expect(fieldTouches("body.customers", "customers[].name")).toBe(true)
  })

  it("a change to a child touches consumers of the parent too", () => {
    expect(fieldTouches("body.quote.premium", "quote")).toBe(true)
    expect(fieldTouches("body.customers[].name", "customers")).toBe(true)
  })

  it("sibling fields never touch", () => {
    expect(fieldTouches("body.quote.premium", "quote.rebate")).toBe(false)
  })

  it("unrelated fields never touch", () => {
    expect(fieldTouches("body.customer.name", "quote.premium")).toBe(false)
  })

  it("removing the whole body touches any field consumer", () => {
    expect(fieldTouches("body", "quote.premium")).toBe(true)
  })
})

describe("findImpact", () => {
  it("matches consumers through path templates", () => {
    const change = TYPE_CHANGED_PREMIUM()
    const consumers: Consumer[] = [
      { consumerName: "mobile-app", method: "GET", path: "/policy/{id}" },
      { consumerName: "billing", method: "GET", path: "/claims/{id}" },
    ]

    const impact = findImpact([change], consumers)

    expect(impact.map((entry) => entry.consumerName)).toEqual(["mobile-app"])
    expect(impact[0].breaking).toEqual([change])
    expect(impact[0].warnings).toEqual([])
  })

  it("a consumer using a parent field is affected by changes to its children, but not to siblings", () => {
    const premiumChange = changeOf({
      kind: "FIELD_TYPE_CHANGED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.quote.premium",
      fieldPath: "body.quote.premium",
      before: "number",
      after: "string",
    })
    const consumers: Consumer[] = [
      { consumerName: "uses-parent", method: "GET", path: "/quote", fieldsUsed: ["quote"] },
      { consumerName: "uses-sibling", method: "GET", path: "/quote", fieldsUsed: ["quote.rebate"] },
    ]

    const impact = findImpact([premiumChange], consumers)

    expect(impact.map((entry) => entry.consumerName)).toEqual(["uses-parent"])
  })

  it("a parent-field removal affects a child-field consumer but not unrelated ones", () => {
    const change = changeOf({
      kind: "FIELD_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.quote",
      fieldPath: "body.quote",
    })
    const consumers: Consumer[] = [
      { consumerName: "reads-child", method: "GET", path: "/quote", fieldsUsed: ["quote.premium"] },
      { consumerName: "reads-other", method: "GET", path: "/quote", fieldsUsed: ["customer.name"] },
      { consumerName: "reads-all", method: "GET", path: "/quote" },
    ]

    const impact = findImpact([change], consumers)

    expect(impact.map((entry) => entry.consumerName)).toEqual(["reads-child", "reads-all"])
  })

  it("consumer fields written with the body. prefix still match", () => {
    const change = changeOf({
      kind: "FIELD_REMOVED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.quote.premium",
      fieldPath: "body.quote.premium",
    })

    const impact = findImpact(
      [change],
      [
        {
          consumerName: "prefixed",
          method: "GET",
          path: "/quote",
          fieldsUsed: ["body.quote.premium"],
        },
      ],
    )

    expect(impact).toHaveLength(1)
    expect(impact[0].consumerName).toBe("prefixed")
  })

  it("endpoint removal affects every consumer of that endpoint regardless of method or fields", () => {
    const change = changeOf({
      kind: "ENDPOINT_REMOVED",
      direction: "endpoint",
      method: "GET",
      path: "/quote",
      location: "GET /quote",
    })
    const consumers: Consumer[] = [
      { consumerName: "same-method", method: "GET", path: "/quote", fieldsUsed: ["premium"] },
      { consumerName: "other-method", method: "POST", path: "/quote", fieldsUsed: ["premium"] },
      { consumerName: "elsewhere", method: "GET", path: "/policy" },
    ]

    const impact = findImpact([change], consumers)

    expect(impact.map((entry) => entry.consumerName)).toEqual(["same-method", "other-method"])
  })

  it("method removal affects field-scoped consumers of that method", () => {
    const change = changeOf({
      kind: "METHOD_REMOVED",
      direction: "endpoint",
      method: "POST",
      path: "/quote",
      location: "POST /quote",
    })
    const consumers: Consumer[] = [
      { consumerName: "poster", method: "POST", path: "/quote", fieldsUsed: ["premium"] },
      { consumerName: "getter", method: "GET", path: "/quote" },
    ]

    expect(findImpact([change], consumers).map((e) => e.consumerName)).toEqual(["poster"])
  })

  it("a consumer not using the changed endpoint is not affected", () => {
    const change = TYPE_CHANGED_PREMIUM()

    expect(
      findImpact(
        [change],
        [
          { consumerName: "unrelated", method: "GET", path: "/claims" },
          { consumerName: "wrong-method", method: "POST", path: "/policy/{id}" },
        ],
      ),
    ).toEqual([])
  })

  it("changes on fields the consumer does not use do not touch it", () => {
    const change = changeOf({
      kind: "FIELD_TYPE_CHANGED",
      direction: "response",
      method: "GET",
      path: "/policy/{id}",
      location: "GET /policy/{id} › response 200 › body.premium",
      fieldPath: "body.premium",
      before: "number",
      after: "string",
    })

    expect(
      findImpact(
        [change],
        [
          {
            consumerName: "other-field",
            method: "GET",
            path: "/policy/{id}",
            fieldsUsed: ["status"],
          },
        ],
      ),
    ).toEqual([])
  })

  it("warnings go to their own bucket", () => {
    const warning = changeOf({
      kind: "STATUS_CODE_ADDED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 404",
      after: "404",
    })

    const impact = findImpact(
      [warning],
      [{ consumerName: "watcher", method: "GET", path: "/quote" }],
    )

    expect(impact[0].warnings).toEqual([warning])
    expect(impact[0].breaking).toEqual([])
  })

  it("safe changes never create impact", () => {
    const safe = changeOf({
      kind: "FIELD_ADDED",
      direction: "response",
      method: "GET",
      path: "/quote",
      location: "GET /quote › response 200 › body.currency",
      fieldPath: "body.currency",
    })

    expect(findImpact([safe], [{ consumerName: "anyone", method: "GET", path: "/quote" }])).toEqual(
      [],
    )
  })
})
