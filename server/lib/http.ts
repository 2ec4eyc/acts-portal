import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

/** Routes by HTTP method and turns thrown errors into JSON responses. */
export function methods(handlers: Partial<Record<Method, Handler>>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const handler = handlers[req.method as Method];
    if (!handler) {
      res.setHeader("Allow", Object.keys(handlers).join(", "));
      return res.status(405).json({ error: "Method not allowed" });
    }
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      if (err instanceof ZodError) {
        const issue = err.issues[0];
        return res.status(400).json({ error: `${issue.path.join(".") || "body"}: ${issue.message}` });
      }
      console.error(err);
      return res.status(500).json({ error: "Internal error" });
    }
  };
}
