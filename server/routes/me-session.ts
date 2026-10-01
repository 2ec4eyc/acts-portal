import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "../lib/auth.js";
import { db } from "../lib/db.js";
import { methods } from "../lib/http.js";
import { users } from "../db/schema.js";

const Body = z.strictObject({ sessionId: z.uuid() });

// POST   /api/me/session { sessionId }: this browser becomes the account's active session; requests
//        from older sessions then get 401 "Session replaced" (they send it as the x-session-id header).
// DELETE /api/me/session: sign-out; clears the active session if it is this one.
export default methods({
  POST: async (req, res) => {
    // Signing in claims the session even if another one is active.
    const user = await requireUser(req, undefined, { allowReplacedSession: true });
    const { sessionId } = Body.parse(req.body ?? {});
    await db.update(users).set({ currentSessionId: sessionId }).where(eq(users.id, user.id));
    res.status(204).end();
  },
  DELETE: async (req, res) => {
    const user = await requireUser(req);
    const sessionId = req.headers["x-session-id"];
    if (typeof sessionId === "string") {
      await db.update(users).set({ currentSessionId: null })
        .where(and(eq(users.id, user.id), eq(users.currentSessionId, sessionId)));
    }
    res.status(204).end();
  },
});
