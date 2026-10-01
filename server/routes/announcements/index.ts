import { can, requireUser } from "../../lib/auth.js";
import { AnnouncementInput, createAnnouncement, feed, listAll } from "../../lib/announcements.js";
import { db } from "../../lib/db.js";
import { HttpError, methods, queryParam } from "../../lib/http.js";

// GET  /api/announcements: what the caller should see now (pinned first, with a read flag).
// GET  /api/announcements?manage=true: all of them, with status and read counts (admins).
// POST /api/announcements: post one (admins).
export default methods({
  GET: async (req, res) => {
    const user = await requireUser(req);
    if (queryParam(req, "manage") === "true") {
      if (!can(user, "announcements:write")) throw new HttpError(403, "Forbidden");
      return res.status(200).json(await listAll(db));
    }
    res.status(200).json(await feed(db, user));
  },
  POST: async (req, res) => {
    const user = await requireUser(req, "announcements:write");
    res.status(201).json(await createAnnouncement(db, user, AnnouncementInput.parse(req.body ?? {})));
  },
});
