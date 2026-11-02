import type { staffUsers } from "../db/schema";

export function publicStaff(row: typeof staffUsers.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    active: row.active,
    mfaEnabled: Boolean(row.totpSecret),
    createdAt: row.createdAt,
  };
}
