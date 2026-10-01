import { requireUser } from "../../lib/auth.js";
import { AnnouncementInput, deleteAnnouncement, updateAnnouncement } from "../../lib/announcements.js";
import { db } from "../../lib/db.js";
import { methods, uuidParam } from "../../lib/http.js";

// PATCH  /api/announcements/:id: edit, pin/unpin, reschedule or expire (admins).
// DELETE /api/announcements/:id (admins).
export default methods({
  PATCH: async (req, res) => {
    await requireUser(req, "announcements:write");
    const patch = AnnouncementInput.partial().parse(req.body ?? {});
    // .partial() keeps defaults; apply only what was sent.
    const sent = Object.fromEntries(Object.entries(patch).filter(([k]) => Object.hasOwn(req.body ?? {}, k)));
    res.status(200).json(await updateAnnouncement(db, uuidParam(req), sent));
  },
  DELETE: async (req, res) => {
    await requireUser(req, "announcements:write");
    await deleteAnnouncement(db, uuidParam(req));
    res.status(204).end();
  },
});
