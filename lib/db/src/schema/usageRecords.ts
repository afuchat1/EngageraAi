import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usageRecordsTable = pgTable("usage_records", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  apiKeyId: integer("api_key_id"),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUsageRecordSchema = createInsertSchema(usageRecordsTable).omit({ id: true, createdAt: true });
export type InsertUsageRecord = z.infer<typeof insertUsageRecordSchema>;
export type UsageRecord = typeof usageRecordsTable.$inferSelect;
