import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userState = pgTable("user_state", {
  id: text().primaryKey(),
  state: jsonb().notNull(),
  revision: integer().default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
