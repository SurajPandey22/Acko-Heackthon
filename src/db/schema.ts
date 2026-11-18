import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core"

export const userRoleEnum = pgEnum("user_role", ["admin", "member"])
export const specStatusEnum = pgEnum("spec_status", ["draft", "published", "blocked"])
export const publishResultEnum = pgEnum("publish_result", ["published", "blocked"])

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  team: text("team").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  owner: text("owner").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const specVersions = pgTable(
  "spec_versions",
  {
    id: serial("id").primaryKey(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id),
    version: text("version").notNull(),
    rawSpec: text("raw_spec").notNull(),
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull(),
    status: specStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("spec_versions_service_version_unique").on(table.serviceId, table.version)],
)

export const consumers = pgTable("consumers", {
  id: serial("id").primaryKey(),
  consumerName: text("consumer_name").notNull(),
  serviceId: integer("service_id")
    .notNull()
    .references(() => services.id),
  method: text("method").notNull(),
  path: text("path").notNull(),
  fieldsUsed: jsonb("fields_used").$type<string[]>().notNull().default([]),
})

export const publishAttempts = pgTable("publish_attempts", {
  id: serial("id").primaryKey(),
  specVersionId: integer("spec_version_id")
    .notNull()
    .references(() => specVersions.id),
  attemptedBy: text("attempted_by").notNull(),
  result: publishResultEnum("result").notNull(),
  reason: text("reason"),
  breakingCount: integer("breaking_count").notNull().default(0),
  changes: jsonb("changes").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
