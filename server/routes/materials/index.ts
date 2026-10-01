import { z } from "zod";
import { requireUser } from "../../lib/auth.js";
import { db } from "../../lib/db.js";
import { methods, queryParam } from "../../lib/http.js";
import { getVisibleMaterial, listMaterials, MaterialUpload, uploadMaterial } from "../../lib/materials.js";

const Query = z.object({
  category: z.enum(["notes", "exams", "activity"]).optional(),
  offeringId: z.uuid().optional(),
  mine: z.enum(["true", "false"]).optional(),
  archived: z.enum(["true", "false", "all"]).default("false"),
});

// GET  /api/materials[?category=][&offeringId=][&mine=true][&archived=true|false|all]: file list
//      (no contents; download via /api/materials/:id/file). Students see active files of their courses.
// POST /api/materials: add a file (R2 key from upload-url, or base64 ≤ 800 KB without R2) or a link to
//      a course you teach (admins, president and VP: any course). The course's students are notified.
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    const q = Query.parse({
      category: queryParam(req, "category"), offeringId: queryParam(req, "offeringId"),
      mine: queryParam(req, "mine"), archived: queryParam(req, "archived"),
    });
    res.status(200).json(await listMaterials(db, user, {
      category: q.category, offeringId: q.offeringId, mine: q.mine === "true",
      archived: q.archived === "all" ? undefined : q.archived === "true",
    }));
  },
  POST: async (req, res) => {
    const user = await requireUser(req, "materials:write_own");
    const { id, notified } = await uploadMaterial(db, user, MaterialUpload.parse(req.body ?? {}));
    res.status(201).json({ ...(await getVisibleMaterial(db, user, id)), notified });
  },
});
