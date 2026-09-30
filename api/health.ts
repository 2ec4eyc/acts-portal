import { sql } from "drizzle-orm";
import { db } from "../server/lib/db.js";
import { methods } from "../server/lib/http.js";

// GET /api/health: confirms the function runs and can reach the database.
export default methods({
  GET: async (_req, res) => {
    await db.execute(sql`select 1`);
    res.status(200).json({ ok: true });
  },
});
