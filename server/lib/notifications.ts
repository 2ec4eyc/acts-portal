import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { notifications } from "../db/schema.js";

export type NewNotification = typeof notifications.$inferInsert;

export async function notify(db: DbOrTx, items: NewNotification[]) {
  if (items.length) await db.insert(notifications).values(items);
}

/** Newest first, with the unread count for the bell. */
export async function listNotifications(db: DbOrTx, userId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const where = and(eq(notifications.userId, userId), opts.unreadOnly ? isNull(notifications.readAt) : undefined);
  const items = await db.select().from(notifications).where(where)
    .orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(opts.limit ?? 30);
  const [{ unread }] = await db.select({ unread: count() }).from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { items, unread };
}

export const MarkRead = z.union([
  z.strictObject({ ids: z.array(z.number().int().positive()).min(1).max(200) }),
  z.strictObject({ all: z.literal(true) }),
]);

/** Marks some or all of the caller's own notifications read. */
export async function markRead(db: DbOrTx, userId: string, input: z.infer<typeof MarkRead>) {
  await db.update(notifications).set({ readAt: sql`now()` }).where(and(
    eq(notifications.userId, userId),
    isNull(notifications.readAt),
    "ids" in input ? inArray(notifications.id, input.ids) : undefined,
  ));
}
