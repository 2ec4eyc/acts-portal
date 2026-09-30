import type { VercelRequest, VercelResponse } from "@vercel/node";
import attendance from "./attendance/index.js";
import gradesBulk from "./grades/bulk.js";
import grades from "./grades/index.js";
import health from "./health.js";
import material from "./materials/[id].js";
import materialFile from "./materials/[id]/file.js";
import materials from "./materials/index.js";
import me from "./me.js";
import offering from "./offerings/[id].js";
import offeringRestore from "./offerings/[id]/restore.js";
import offerings from "./offerings/index.js";
import user from "./users/[id].js";
import userHistory from "./users/[id]/history.js";
import usersArchive from "./users/archive.js";
import usersCleanup from "./users/cleanup.js";
import usersEnroll from "./users/enroll.js";
import users from "./users/index.js";
import usersRestore from "./users/restore.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;

// The whole API is served by one Vercel Function (api/index.ts, via a rewrite in vercel.json), which keeps
// deployments within plan function limits and shares one warm database pool. ":name" segments
// become req.query.name. Static segments win over dynamic ones.
const ROUTES: [pattern: string, handler: Handler][] = [
  ["health", health],
  ["me", me],
  ["users", users],
  ["users/archive", usersArchive],
  ["users/restore", usersRestore],
  ["users/enroll", usersEnroll],
  ["users/cleanup", usersCleanup],
  ["users/:id", user],
  ["users/:id/history", userHistory],
  ["offerings", offerings],
  ["offerings/:id", offering],
  ["offerings/:id/restore", offeringRestore],
  ["grades", grades],
  ["grades/bulk", gradesBulk],
  ["attendance", attendance],
  ["materials", materials],
  ["materials/:id", material],
  ["materials/:id/file", materialFile],
];

/** Finds the handler for a path like "users/abc/history", preferring static segments. */
export function matchRoute(path: string): { handler: Handler; params: Record<string, string> } | null {
  const parts = path.split("/").filter(Boolean);
  let best: { handler: Handler; params: Record<string, string>; score: number } | null = null;
  for (const [pattern, handler] of ROUTES) {
    const segments = pattern.split("/");
    if (segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let score = 0;
    const ok = segments.every((seg, i) => {
      if (seg.startsWith(":")) { params[seg.slice(1)] = decodeURIComponent(parts[i]); return true; }
      score++;
      return seg === parts[i];
    });
    if (ok && (!best || score > best.score)) best = { handler, params, score };
  }
  return best && { handler: best.handler, params: best.params };
}

/** Dispatches an /api request. `path` is the part after "/api/". */
export async function dispatch(path: string, req: VercelRequest, res: VercelResponse) {
  const match = matchRoute(path);
  if (!match) return res.status(404).json({ error: "Not found" });
  // Drop the rewrite's own parameters (Vercel also adds `path`, a copy of `__path`).
  const { __path, ...query } = req.query;
  if (query.path === __path) delete query.path;
  // Replace (not mutate) the query object: Express recomputes req.query on each access.
  Object.defineProperty(req, "query", { value: { ...query, ...match.params }, writable: true, configurable: true });
  return match.handler(req, res);
}
