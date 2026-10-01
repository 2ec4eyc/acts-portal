import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ZodError } from "zod";
import { inRequestTransaction } from "./db.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

/**
 * Holds a handler's response until its transaction has committed, so a client never sees success
 * for a change that was then rolled back.
 */
function deferredResponse(res: VercelResponse) {
  const steps: ((r: VercelResponse) => void)[] = [];
  const proxy = {
    status(code: number) { steps.push((r) => r.status(code)); return proxy; },
    setHeader(name: string, value: string | number | readonly string[]) { steps.push((r) => r.setHeader(name, value)); return proxy; },
    json(body: unknown) { steps.push((r) => r.json(body)); return proxy; },
    send(body: unknown) { steps.push((r) => r.send(body)); return proxy; },
    end() { steps.push((r) => r.end()); return proxy; },
  };
  return { res: proxy as unknown as VercelResponse, flush: () => steps.forEach((step) => step(res)) };
}

function sendError(res: VercelResponse, err: unknown) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return res.status(400).json({ error: `${issue.path.join(".") || "body"}: ${issue.message}` });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal error" });
}

/**
 * Routes by HTTP method and turns thrown errors into JSON responses. Requests that change data
 * (anything but GET) run in one database transaction: all of it is saved, or none of it, and the
 * audit trigger records the signed-in user as the actor (see db.ts).
 */
export function methods(handlers: Partial<Record<Method, Handler>>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const handler = handlers[req.method as Method];
    if (!handler) {
      res.setHeader("Allow", Object.keys(handlers).join(", "));
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      if (req.method === "GET") return await handler(req, res);
      const deferred = deferredResponse(res);
      await inRequestTransaction(async () => { await handler(req, deferred.res); });
      deferred.flush();
    } catch (err) {
      return sendError(res, err);
    }
  };
}

/** Reads a route parameter (e.g. [id]) that must be a UUID. */
export function uuidParam(req: VercelRequest, name = "id"): string {
  const value = req.query[name];
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(404, "Not found");
  }
  return value;
}

/** Reads an optional single query-string value. */
export function queryParam(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}
