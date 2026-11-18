# Plan – Contract Guard

This is my Gate 1 plan. If I change something later, I'll write it in DECISIONS.md instead of editing this.

## The problem (in my words)

Acko's services talk to each other through APIs. When one team changes its API – renames a field,
makes a parameter required, drops an endpoint – it usually doesn't know who's using it. The change
goes out and some other team's service breaks in production. Nobody can tell which changes are
safe, who uses what, or who approved the risky one.

Who uses this:

- **API owners** (e.g. the quote-api team) – want to know _before_ publishing if they'll break someone, and who.
- **Consumer teams** (e.g. mobile-app) – don't want to be broken without warning.
- **Platform leads** – want to see who approved what, and whether teams are actually protected.

What matters in the end: a breaking change should never reach a consumer without being caught,
explained, and either stopped or knowingly approved.

## Questions for the product owner

| #   | Question                                                                                | Answer | What I'll do if it's "your call"                                                                        |
| --- | --------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| 1   | Can a breaking change ever be published anyway? Who can approve that?                   | _TBD_  | Only with an approver's name and a reason, saved in history                                             |
| 2   | If a change is breaking but no registered consumer uses that part – block or allow?     | _TBD_  | Allow, but show a warning                                                                               |
| 3   | Is a new enum value in a **response** breaking?                                         | _TBD_  | Yes – a consumer may not know how to handle it                                                          |
| 4   | Is a new response status code breaking?                                                 | _TBD_  | Warning only                                                                                            |
| 5   | Is removing a request field or optional param breaking?                                 | _TBD_  | No – the server just ignores extra input                                                                |
| 6   | Do consumers register per endpoint or per field?                                        | _TBD_  | Per endpoint, with an optional list of fields (whatever the starter kit uses)                           |
| 7   | Do versions have to be semver? Should I read them from `info.version`?                  | _TBD_  | Read from `info.version`, unique per service                                                            |
| 8   | After the must-haves, what matters most – webhook alerts, CI check, or migration guide? | _TBD_  | CI check first, then webhook                                                                            |
| 9   | Do we need login? Who's allowed to publish a service's spec?                            | _TBD_  | Yes – username/password, only the owning team or an admin can upload/publish, anyone logged in can view |
| 10  | Do I need to compare `oneOf` / `anyOf` / `allOf`?                                       | _TBD_  | Merge `allOf`; treat `oneOf` / `anyOf` as one block, no deep compare                                    |

## What I looked at

- **oasdiff** – has a big list of breaking-change rules for OpenAPI. The main thing I took from it: the same change can be safe in a request and breaking in a response. I'll write my own rules table, not use the tool.
- **Buf** (protobuf) – every rule has an ID and a clear message. I'll do the same.
- **Confluent Schema Registry** – refuses a new schema if it isn't compatible. That's basically my publish gate.
- **Pact** – consumers declare what they use, and there's a "can I deploy?" check for CI. That's where my consumer registration and CI check ideas come from.
- **Optic / Bump.sh** – readable changelogs between API versions.

The one idea everything hangs on:
in a **request**, asking for _more_ breaks callers; in a **response**, giving _less_ breaks callers.

## Scope

Must-haves, in the order I'll build them:

1. Register services and owners
2. Upload specs (YAML/JSON, through API and UI), reject invalid ones with a clear error
3. Resolve `$ref` so I compare what the API actually does, not how the file is laid out
4. Diff two versions – endpoints, methods, params, request/response fields (nested + arrays), types, required, enums, status codes
5. Classify each change as breaking / warning / safe, with a reason in plain words
6. Consumers register what they use
7. Impact – which consumers get hit, by which changes
8. Publish gate – block if a consumer would break; save every attempt
9. Changelog between any two versions + publish history
10. UI, metrics, one-command start, README
11. Login / logout – I'll do this right after the publish flow works, so the core isn't at risk. It means history shows who _really_ published, and only the owning team can publish.

If I have time: CI check endpoint → webhook alerts to affected teams → admin override with approval.

Leaving out:

- Sign-up, password reset, SSO – I'll seed demo users. In real life this would be Acko's SSO.
- Deep `oneOf` / `anyOf` comparison – hard, and not worth it in 6 hours.
- Security schemes, response headers, callbacks – not in the must-haves.
- Swagger 2.0 – the kit is OpenAPI 3.
- AI migration guide – nice, but last.

## Breaking-change rules

| Change                          | In a request | In a response |
| ------------------------------- | ------------ | ------------- |
| Endpoint / method removed       | breaking     | breaking      |
| New **required** field or param | breaking     | safe          |
| New optional field or param     | safe         | safe          |
| Field or param removed          | safe         | breaking      |
| Optional → required             | breaking     | safe          |
| Required → optional             | safe         | breaking      |
| Type changed                    | breaking     | breaking      |
| Enum value added                | safe         | breaking (Q3) |
| Enum value removed              | breaking     | safe          |
| Success status code removed     | –            | breaking      |
| New status code                 | –            | warning (Q4)  |

Every change I report has a rule id, where it happened (e.g. `GET /quote › response 200 › body.quote.premium`),
how serious it is, and why.

## Design

One app (a modular monolith) plus PostgreSQL, started with `docker compose up`.
Microservices would be overkill for one person, 6 hours and this little data – and publishing
needs a single transaction, which is easy in one app.

```
 Browser (pages) ──┐
 CI / curl (API) ──┤──► routes ──► modules (auth, services, specs, consumers, publish, metrics)
                   │                   │                          │
                   │                   ▼                          ▼
                   │     core (pure logic, no DB)           db (Drizzle) ──► PostgreSQL
                   │     load → resolve → diff → classify → impact
                   └──────────────────────────────────────────────────► webhook receiver (kit)
```

What happens when someone publishes:
read the file → check it's valid OpenAPI → resolve `$ref` → diff against the last published
version → classify → match consumers → publish or block → save the attempt.

Keeping `core` free of database and HTTP code means I can test the important logic on its own.

**Stack:** Node.js + TypeScript, Express, zod, PostgreSQL 16 with Drizzle, `yaml`,
`swagger-parser` (only to validate), EJS pages with Pico.css, Vitest + Supertest + PGlite for tests,
Docker Compose, `express-session` + `connect-pg-simple` for login.

Why SQL and not something like MongoDB: the data is connected (service → versions → consumers →
publish attempts). Impact needs joins, publishing needs a transaction, and constraints stop bad
data. The spec itself is a document, so it goes in a `jsonb` column.

**Login:**

- Sessions stored in Postgres, not JWT – so logout actually ends the session, and it fits server-rendered pages.
- Passwords hashed with `scrypt` (built into Node) with a salt.
- Cookie is `httpOnly`, `sameSite=lax`, `secure` in production; new session id on login.
- Two roles: `admin` (platform lead, can do anything) and `member` (belongs to a team; can only publish their team's services).
- Who published comes from the logged-in user, never from the request body.
- Wrong username or wrong password give the same message.

## Data model

```
users             id, username (unique), password_hash, role (admin|member), team, created_at
session           sid, sess, expire            ← handled by connect-pg-simple
services          id, name (unique), owner (team), created_at
spec_versions     id, service_id, version, raw_spec, spec (jsonb),
                  status (draft|published|blocked), created_at
                  unique (service_id, version)
consumers         id, consumer_name, service_id, method, path, fields_used (jsonb)
publish_attempts  id, spec_version_id, attempted_by, result (published|blocked),
                  reason, breaking_count, changes (jsonb), created_at
```

I don't store diffs – I work them out when needed. The only copy is the snapshot saved with each
publish attempt, so history doesn't change later.

## API

| Method     | Path                                      | What it does                       |
| ---------- | ----------------------------------------- | ---------------------------------- |
| POST       | `/api/auth/login`                         | Log in (401 if wrong)              |
| POST       | `/api/auth/logout`                        | Log out                            |
| GET        | `/api/auth/me`                            | Who am I                           |
| POST / GET | `/api/services`                           | Add / list services                |
| POST       | `/api/services/:name/versions`            | Upload a spec (saved as draft)     |
| GET        | `/api/services/:name/versions`            | List versions                      |
| GET        | `/api/services/:name/diff?from=&to=`      | Changes + changelog                |
| POST / GET | `/api/consumers`                          | Register / list what consumers use |
| GET        | `/api/services/:name/versions/:v/impact`  | Who would break, and why           |
| POST       | `/api/services/:name/versions/:v/publish` | Publish → 200 ok / 409 blocked     |
| GET        | `/api/services/:name/history`             | All publish attempts               |
| GET        | `/api/metrics`                            | Numbers for the dashboard          |
| POST       | `/api/check`                              | (if time) CI check                 |

Everything except login and `/health` needs you to be logged in. Upload and publish also need
you to be in the owning team, or an admin (403 otherwise).

## Screens

1. **Login**
2. **Services** – name, owner, latest version, how many consumers
3. **Service page** – versions and their status, upload form, consumers
4. **Diff** – pick two versions, see changes grouped by endpoint (red / yellow / green) with reasons
5. **Impact & publish** – who gets hit by what, and a Publish button
6. **History** – every publish attempt and who did it
7. **Metrics**

Every page shows who's logged in and a Logout button.

## How I'll test it

- **Unit** (no DB): `$ref` resolver (nested, circular), differ (one test per kind of change, nested objects, arrays), classifier (every rule, plus "same change, request vs response"), impact matching, password hashing.
- **Integration** (API + DB, using PGlite): bad spec → 400 with a message; same version twice → 409; breaking publish → blocked and saved; safe publish → goes through. Login works / wrong password → 401 / not logged in → 401 / logout works / other team → 403 / history shows the real user.
- **Acceptance**: load the starter kit's specs (3 services × 4 versions) and consumers, and check every problem planted in them gets caught and blocked for the right consumers.

## Metrics

On the dashboard:

- breaking changes caught before they reached production
- % of publish attempts blocked, per service
- consumers protected
- overrides (if I build them)

For Contract Guard itself:

- planted problems in the kit caught: X out of Y
- number of tests, and coverage of `core`

## Timeline

| Time      | What                                                       |
| --------- | ---------------------------------------------------------- |
| 1:15–1:45 | Repo setup, Docker Compose, DB tables                      |
| 1:45–3:30 | Loader, resolver, differ, classifier + unit tests → Gate 2 |
| 3:30–4:30 | Consumers, impact, publish, history + integration tests    |
| 4:30–4:55 | Login / logout, roles, protecting routes                   |
| 4:55–5:20 | Pages                                                      |
| 5:20–5:30 | Metrics, acceptance tests                                  |
| 5:30–6:00 | README, REVIEW.md, transcripts, demo prep                  |

Commit at least every 45 minutes.
