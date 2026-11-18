# AGENTS.md – Contract Guard

## Product

Contract Guard is an API contract registry. Teams publish versions of their OpenAPI 3 specs.
It resolves $ref, diffs versions, classifies each change as breaking / warning / safe with a
plain-English reason, shows which registered consumer services are affected, blocks unsafe
publishes, and keeps a changelog and publish history. Login/logout with roles. UI + metrics.
Starts with one command (docker compose up).

## Fixed stack (do not change; ask me before adding any dependency)

- Node.js 22, TypeScript (strict), Express, zod
- PostgreSQL 16, Drizzle ORM (node-postgres)
- yaml, @apidevtools/swagger-parser (validate() only)
- EJS + Pico.css (CDN)
- Vitest, Supertest, PGlite (integration tests)
- Biome, Docker Compose
- express-session + connect-pg-simple (sessions), node:crypto scrypt (password hashing)
- Architecture: modular monolith

## Structure

- src/core/ – pure functions, no DB, no Express: types, loader, resolver, differ, classifier, impact
- src/modules/<feature>/ – routes.ts, service.ts, repository.ts
  (auth, services, specs, consumers, publish, metrics)
- src/db/ – schema.ts, client.ts, migrations
- src/views/ – EJS pages
- tests/unit, tests/integration, tests/acceptance

## Hard rules

- Never use oasdiff, openapi-diff, deep-diff or any diff library. Resolver, differ, classifier and impact are hand-written.
- Classifier is a data table of rules, not a long if/else. Unknown change kinds default to "warning", never "safe".
- Breaking depends on direction: in requests "asking for more" breaks, in responses "giving less" breaks.
- Compare resolved specs, not file layout.
- Publish runs in one DB transaction.
- Auth: server-side sessions, never store plain passwords, never trust a user name from the request body – use the logged-in user.
- Small functions, clear names, comments only where needed. No secrets in code.
- Every core function has unit tests. Never claim something works unless a test proves it.
- After each task: run tests, summarise files changed and decisions made, suggest a commit message, and stop.

## Breaking-change rules

| Change                      | In a request | In a response |
| --------------------------- | ------------ | ------------- |
| Endpoint / method removed   | breaking     | breaking      |
| New required field or param | breaking     | safe          |
| New optional field or param | safe         | safe          |
| Field or param removed      | safe         | breaking      |
| Optional → required         | breaking     | safe          |
| Required → optional         | safe         | breaking      |
| Type changed                | breaking     | breaking      |
| Enum value added            | safe         | breaking      |
| Enum value removed          | breaking     | safe          |
| Success status code removed | –            | breaking      |
| New status code             | –            | warning       |

Every reported change has: ruleId, location (e.g. "GET /quote › response 200 › body.quote.premium"),
severity, reason.
