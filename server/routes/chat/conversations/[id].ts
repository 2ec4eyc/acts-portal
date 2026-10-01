import { z } from "zod";
import { requireUser } from "../../../lib/auth.js";
import { setStatus } from "../../../lib/chat.js";
import { db } from "../../../lib/db.js";
import { methods, uuidParam } from "../../../lib/http.js";

// PATCH /api/chat/conversations/:id { status: "open" | "closed" }: the office closes or reopens a thread.
export default methods({
  PATCH: async (req, res) => {
    await requireUser(req, "chat:admin_inbox");
    const { status } = z.strictObject({ status: z.enum(["open", "closed"]) }).parse(req.body ?? {});
    res.status(200).json({ status: await setStatus(db, uuidParam(req), status) });
  },
});
