import { eq } from "drizzle-orm"
import { users } from "../../db/schema.js"
import type { AppDatabase } from "../../db/types.js"

export interface UserRow {
  id: number
  username: string
  passwordHash: string
  role: "admin" | "member"
  team: string
}

export async function insertUser(
  db: AppDatabase,
  input: { username: string; passwordHash: string; role: "admin" | "member"; team: string },
): Promise<{ id: number }> {
  const [row] = await db.insert(users).values(input).returning()
  return { id: row.id }
}

export async function findUserByUsername(
  db: AppDatabase,
  username: string,
): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  return row ?? null
}

export async function userExists(db: AppDatabase, username: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)
  return row !== undefined
}
