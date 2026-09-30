import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dispatch } from "../server/routes/index.js";

// The single Vercel Function for the whole API. vercel.json rewrites /api/<path> to /api?__path=<path>;
// routes live in server/routes/.
export default function handler(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.__path;
  const path = Array.isArray(raw) ? raw.join("/") : raw ?? "";
  return dispatch(path, req, res);
}
