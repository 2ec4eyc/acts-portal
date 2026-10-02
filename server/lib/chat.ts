// Chat with the school office: one thread per member (a student or a teacher), answered by any admin.
// The thread's owner is stored in conversations.student_id (named before teachers could chat), and
// last_sender_role "student" means "the member" either way. Messages live in
// Postgres; screens poll for new ones (after the last id they have), so no outside service is needed.
// Old messages are archived by an admin: downloaded as PDF + CSV, then removed (see purgeArchive).
import { and, asc, desc, eq, gt, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { DbOrTx } from "./academics.js";
import { can, type User } from "./auth.js";
import { HttpError } from "./http.js";
import { notify } from "./notifications.js";
import { getSetting } from "./settings.js";
import { auditLog, cohorts, conversations, messages, studentRecords, users } from "../db/schema.js";

export const MAX_MESSAGE = 4000;
const sender = alias(users, "sender");

type Conversation = typeof conversations.$inferSelect;
const isOffice = (user: Pick<User, "role">) => can(user, "chat:admin_inbox");

// Unread for one side: the latest message came from the other side after this side last read.
const unreadForOffice = (c: Pick<Conversation, "lastSenderRole" | "lastMessageAt" | "adminLastReadAt">) =>
  c.lastSenderRole === "student" && !!c.lastMessageAt && (!c.adminLastReadAt || c.lastMessageAt > c.adminLastReadAt);
const unreadForStudent = (c: Pick<Conversation, "lastSenderRole" | "lastMessageAt" | "studentLastReadAt">) =>
  c.lastSenderRole === "admin" && !!c.lastMessageAt && (!c.studentLastReadAt || c.lastMessageAt > c.studentLastReadAt);

async function chatEnabled(db: DbOrTx) {
  return (await getSetting(db, "features")).chat;
}

/** Accounts that can have a thread with the office. */
const MEMBER_ROLES = ["student", "teacher"] as const;
const isMemberRole = (role: string | undefined): role is (typeof MEMBER_ROLES)[number] => (MEMBER_ROLES as readonly string[]).includes(role ?? "");

/** A member's thread (student or teacher), created on first use. */
export async function getOrCreateConversation(db: DbOrTx, studentId: string) {
  const [member] = await db.select({ role: users.role }).from(users).where(eq(users.id, studentId));
  if (!isMemberRole(member?.role)) throw new HttpError(400, "studentId: not a student or teacher account");
  await db.insert(conversations).values({ studentId }).onConflictDoNothing();
  const [c] = await db.select().from(conversations).where(eq(conversations.studentId, studentId));
  return c;
}

/** The conversation, if this user may see it (its member, or the school office). */
async function conversationFor(db: DbOrTx, user: User, id: string, lock = false) {
  const q = db.select().from(conversations).where(eq(conversations.id, id));
  const [c] = lock ? await q.for("update") : await q;
  if (!c) throw new HttpError(404, "Conversation not found");
  if (c.studentId !== user.id && !isOffice(user)) throw new HttpError(403, "Forbidden");
  return c;
}

const shapeConversation = (c: Conversation, user: User) => ({
  id: c.id, studentId: c.studentId, status: c.status, lastMessageAt: c.lastMessageAt,
  unread: isOffice(user) ? unreadForOffice(c) : unreadForStudent(c),
});

/** A student's or teacher's own thread, plus whether they can write. */
export async function myConversation(db: DbOrTx, user: User) {
  if (!isMemberRole(user.role)) throw new HttpError(403, "Only students and teachers have a thread with the school office");
  const c = await getOrCreateConversation(db, user.id);
  return { ...shapeConversation(c, user), chatEnabled: await chatEnabled(db) };
}

export const InboxFilter = z.object({
  q: z.string().trim().max(100).optional(),
  unread: z.enum(["true", "false"]).optional(),
  status: z.enum(["open", "closed"]).optional(),
  role: z.enum(MEMBER_ROLES).optional(),
});

/** The school office's inbox: newest activity first, with a preview of the last message. */
export async function listConversations(db: DbOrTx, user: User, f: z.infer<typeof InboxFilter>) {
  const name = sql`(${users.firstName} || ' ' || ${users.lastName})`;
  const rows = await db.select({
    c: conversations, firstName: users.firstName, lastName: users.lastName, role: users.role, studentNo: studentRecords.studentNo, cohort: cohorts.name,
    last: sql<string | null>`(SELECT body FROM messages m WHERE m.conversation_id = ${conversations.id} ORDER BY m.id DESC LIMIT 1)`,
  }).from(conversations)
    .innerJoin(users, eq(users.id, conversations.studentId))
    .leftJoin(studentRecords, eq(studentRecords.userId, conversations.studentId))
    .leftJoin(cohorts, eq(cohorts.id, studentRecords.cohortId))
    .where(and(
      f.status ? eq(conversations.status, f.status) : undefined,
      f.role ? eq(users.role, f.role) : undefined,
      f.q ? or(ilike(name, `%${f.q}%`), ilike(studentRecords.studentNo, `%${f.q}%`)) : undefined,
      f.unread === "true" ? and(eq(conversations.lastSenderRole, "student"),
        or(isNull(conversations.adminLastReadAt), gt(conversations.lastMessageAt, conversations.adminLastReadAt))) : undefined,
    ))
    .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`, desc(conversations.createdAt))
    .limit(200);
  return rows.map(({ c, firstName, lastName, role, studentNo, cohort, last }) => ({
    ...shapeConversation(c, user), studentName: `${firstName} ${lastName}`, role, studentNo, cohort,
    lastSenderRole: c.lastSenderRole, preview: last ? last.slice(0, 140) : null,
  }));
}

/** Unread count for the sidebar badge: threads waiting for the office, or 0/1 for a member. */
export async function unreadCount(db: DbOrTx, user: User) {
  if (isOffice(user)) {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(conversations).where(and(
      eq(conversations.lastSenderRole, "student"),
      or(isNull(conversations.adminLastReadAt), gt(conversations.lastMessageAt, conversations.adminLastReadAt)),
    ));
    return r.n;
  }
  const [c] = await db.select().from(conversations).where(eq(conversations.studentId, user.id));
  return c && unreadForStudent(c) ? 1 : 0;
}

export const MessageQuery = z.object({
  after: z.coerce.number().int().min(0).optional(),
  before: z.coerce.number().int().min(1).optional(),
});

/** Newest 50 (default), older ones (`before`), or only new ones since the last poll (`after`). */
export async function listMessages(db: DbOrTx, user: User, conversationId: string, q: z.infer<typeof MessageQuery>) {
  const c = await conversationFor(db, user, conversationId);
  const page = q.after !== undefined ? 200 : 50;
  const rows = await db.select({ m: messages, firstName: sender.firstName, lastName: sender.lastName })
    .from(messages).leftJoin(sender, eq(sender.id, messages.senderId))
    .where(and(
      eq(messages.conversationId, c.id),
      q.after !== undefined ? gt(messages.id, q.after) : undefined,
      q.before !== undefined ? lt(messages.id, q.before) : undefined,
    ))
    .orderBy(q.after !== undefined ? asc(messages.id) : desc(messages.id))
    .limit(page + 1);
  const more = rows.length > page;
  const list = rows.slice(0, page);
  if (q.after === undefined) list.reverse();
  return {
    messages: list.map(({ m, firstName, lastName }) => ({
      id: m.id, body: m.body, createdAt: m.createdAt,
      senderName: firstName ? `${firstName} ${lastName}` : "Deleted account",
      fromOffice: m.senderId !== c.studentId, mine: m.senderId === user.id,
    })),
    // For a normal or "before" page: are there older ones? For "after": did the poll hit its cap?
    more,
  };
}

export const SendInput = z.strictObject({ body: z.string().trim().min(1).max(MAX_MESSAGE) });

/**
 * Adds a message. Students write only in their own open thread while chat is switched on; the office
 * can always write. The other side is notified once per burst (not for every message).
 */
export async function sendMessage(db: DbOrTx, user: User, conversationId: string, body: string) {
  const c = await conversationFor(db, user, conversationId, true);
  const office = isOffice(user);
  if (!office) {
    if (user.id !== c.studentId) throw new HttpError(403, "Forbidden");
    if (!(await chatEnabled(db))) throw new HttpError(403, "Chat is turned off");
    if (c.status === "closed") throw new HttpError(409, "This conversation is closed");
  }
  const [m] = await db.insert(messages).values({ conversationId: c.id, senderId: user.id, body }).returning();
  await db.update(conversations).set({
    lastMessageAt: m.createdAt, lastSenderRole: office ? "admin" : "student",
    ...(office ? { adminLastReadAt: m.createdAt } : { studentLastReadAt: m.createdAt }),
  }).where(eq(conversations.id, c.id));

  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
  if (office && !unreadForStudent(c)) {
    await notify(db, [{ userId: c.studentId, kind: "message", link: "messages", title: "New message from the school office", body: preview, data: { conversationId: c.id } }]);
  } else if (!office && !unreadForOffice(c)) {
    const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "admin"), eq(users.status, "active")));
    await notify(db, admins.map((a) => ({
      userId: a.id, kind: "message" as const, link: "messages", data: { conversationId: c.id },
      title: `Message from ${user.firstName} ${user.lastName}${user.role === "teacher" ? " (Teacher)" : ""}`, body: preview,
    })));
  }
  return { id: m.id, createdAt: m.createdAt };
}

export async function markRead(db: DbOrTx, user: User, conversationId: string) {
  const c = await conversationFor(db, user, conversationId);
  await db.update(conversations).set(isOffice(user) ? { adminLastReadAt: sql`now()` } : { studentLastReadAt: sql`now()` })
    .where(eq(conversations.id, c.id));
}

export async function setStatus(db: DbOrTx, conversationId: string, status: "open" | "closed") {
  const [c] = await db.update(conversations).set({ status }).where(eq(conversations.id, conversationId)).returning();
  if (!c) throw new HttpError(404, "Conversation not found");
  return c.status;
}

// ---------- archive ----------
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
/** Messages sent before the start of this day (Manila) are archived. */
export const ArchiveQuery = z.object({ before: isoDate });
const cutoff = (before: string) => {
  const d = new Date(`${before}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "before: not a valid date");
  if (d.getTime() > Date.now()) throw new HttpError(400, "before: can't be in the future");
  return d;
};

export async function archiveSummary(db: DbOrTx, before: string) {
  const at = cutoff(before);
  const [old] = await db.select({
    messages: sql<number>`count(*)::int`, conversations: sql<number>`count(DISTINCT ${messages.conversationId})::int`,
    bytes: sql<number>`coalesce(sum(octet_length(${messages.body})), 0)::bigint`,
    first: sql<string | null>`min(${messages.createdAt})`,
  }).from(messages).where(lt(messages.createdAt, at));
  const [all] = await db.select({ messages: sql<number>`count(*)::int` }).from(messages);
  const size = (await db.execute(sql`SELECT pg_total_relation_size('messages') AS bytes`)).rows[0] as { bytes: string };
  return {
    before, olderMessages: old.messages, olderConversations: old.conversations, olderBytes: Number(old.bytes),
    oldestAt: old.first, totalMessages: all.messages, totalBytes: Number(size.bytes),
  };
}

export const ExportQuery = ArchiveQuery.extend({ afterId: z.coerce.number().int().min(0).default(0) });
const EXPORT_PAGE = 2000;

/** Messages before the cutoff, oldest id first, a page at a time (`afterId` = last id received). */
export async function exportArchive(db: DbOrTx, q: z.infer<typeof ExportQuery>) {
  const at = cutoff(q.before);
  const student = alias(users, "student");
  const rows = await db.select({
    id: messages.id, createdAt: messages.createdAt, body: messages.body, conversationId: messages.conversationId,
    studentId: conversations.studentId, studentFirst: student.firstName, studentLast: student.lastName, memberRole: student.role,
    studentNo: studentRecords.studentNo, senderId: messages.senderId, senderFirst: sender.firstName, senderLast: sender.lastName,
  }).from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(student, eq(student.id, conversations.studentId))
    .leftJoin(studentRecords, eq(studentRecords.userId, conversations.studentId))
    .leftJoin(sender, eq(sender.id, messages.senderId))
    .where(and(lt(messages.createdAt, at), gt(messages.id, q.afterId)))
    .orderBy(asc(messages.id)).limit(EXPORT_PAGE + 1);
  const page = rows.slice(0, EXPORT_PAGE);
  return {
    messages: page.map((r) => ({
      id: r.id, createdAt: r.createdAt, body: r.body, conversationId: r.conversationId,
      studentName: `${r.studentFirst} ${r.studentLast}`, studentNo: r.studentNo, memberRole: r.memberRole,
      senderName: r.senderFirst ? `${r.senderFirst} ${r.senderLast}` : "Deleted account",
      fromOffice: r.senderId !== r.studentId,
    })),
    nextAfterId: rows.length > EXPORT_PAGE ? page[page.length - 1].id : null,
  };
}

export const PurgeInput = z.strictObject({ before: isoDate, expectedCount: z.number().int().min(1) });

/**
 * Removes the messages before the cutoff once the admin has downloaded them. Refuses if the number
 * changed since the download (so nothing is removed that isn't in the files). Recorded in the audit log.
 */
export async function purgeArchive(db: DbOrTx, user: User, input: z.infer<typeof PurgeInput>) {
  const at = cutoff(input.before);
  await db.execute(sql`LOCK TABLE messages IN SHARE ROW EXCLUSIVE MODE`);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(lt(messages.createdAt, at));
  if (n !== input.expectedCount) {
    throw new HttpError(409, `There are now ${n} messages before ${input.before}, not ${input.expectedCount}. Download the archive again first.`);
  }
  const removed = await db.delete(messages).where(lt(messages.createdAt, at)).returning({ conversationId: messages.conversationId });
  await db.insert(auditLog).values({
    actorId: user.id, action: "chat.archived", entity: "chat", entityId: input.before,
    data: { before: input.before, messages: removed.length, conversations: new Set(removed.map((r) => r.conversationId)).size },
  });
  return { removed: removed.length };
}

/** For tests and the inbox: start (or open) a thread with a student or teacher. */
export async function startConversation(db: DbOrTx, studentId: string) {
  const c = await getOrCreateConversation(db, studentId);
  return c.id;
}
