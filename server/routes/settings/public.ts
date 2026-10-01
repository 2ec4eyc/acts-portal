import { db } from "../../lib/db.js";
import { methods } from "../../lib/http.js";
import { getSetting } from "../../lib/settings.js";

// GET /api/settings/public: no sign-in. Only switches that are safe for anyone to see. Vercel's CDN
// caches it for a minute, so page loads don't each cost a database read.
export default methods({
  GET: async (_req, res) => {
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ features: await getSetting(db, "features") });
  },
});
