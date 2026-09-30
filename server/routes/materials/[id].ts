import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods, uuidParam } from "../../lib/http.js";
import { assertCanManage, getVisibleMaterial } from "../../lib/materials.js";
import { materials } from "../../db/schema.js";

const Patch = z.strictObject({ archived: z.boolean() });

// GET    /api/materials/:id: file details.
// PATCH  /api/materials/:id { archived }: archive or restore (uploader or admin).
// DELETE /api/materials/:id: delete permanently (uploader or admin).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    res.status(200).json(await getVisibleMaterial(db, user, uuidParam(req)));
  },
  PATCH: async (req, res) => {
    const user = await requireUser(req);
    const id = uuidParam(req);
    const { archived } = Patch.parse(req.body ?? {});
    await assertCanManage(db, user, id);
    await db.update(materials).set({ archivedAt: archived ? new Date() : null }).where(eq(materials.id, id));
    res.status(200).json(await getVisibleMaterial(db, user, id));
  },
  DELETE: async (req, res) => {
    const user = await requireUser(req);
    const id = uuidParam(req);
    await assertCanManage(db, user, id);
    await db.delete(materials).where(eq(materials.id, id));
    res.status(204).end();
  },
});
