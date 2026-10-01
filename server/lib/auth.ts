import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { eq } from "drizzle-orm";
import type { VercelRequest } from "@vercel/node";
import { db, setActor } from "./db.js";
import { users } from "../db/schema.js";
import { HttpError } from "./http.js";

// Must match the project the browser signs in to (src/lib/firebase.ts).
const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID ?? "acts-bible-school-portal";
const hasCredentials = Boolean(process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

// A named app, so it never collides with another default app in the same process (e.g. server.ts).
const APP_NAME = "acts-api";
const app: App =
  getApps().find((a) => a.name === APP_NAME) ??
  initializeApp(
    hasCredentials && !process.env.FIREBASE_AUTH_EMULATOR_HOST
      ? {
          projectId,
          credential: cert({
            projectId,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
          }),
        }
      : { projectId }, // token verification only needs the project id (the emulator needs nothing else)
    APP_NAME,
  );

export type User = typeof users.$inferSelect;
export type Role = User["role"];

export type Permission =
  // users:write = edit student accounts; users:admin = everything else about accounts
  // (staff accounts, roles, emails, create, archive, restore, delete).
  | "users:read" | "users:write" | "users:admin"
  | "grades:write_own_offerings" | "grades:write_any"
  | "attendance:write" | "offerings:write" | "materials:write_own"
  | "transcripts:issue" | "settings:write" | "audit:read" | "announcements:write"
  | "finance:read" | "finance:write";

const PERMISSIONS: Record<Role, readonly Permission[]> = {
  student: [],
  teacher: ["users:read", "grades:write_own_offerings", "materials:write_own"],
  president: ["users:read", "users:write", "grades:write_own_offerings", "grades:write_any", "attendance:write"],
  vice_president: ["users:read", "users:write", "grades:write_own_offerings", "grades:write_any", "attendance:write"],
  admin: ["users:read", "users:write", "users:admin", "grades:write_own_offerings", "grades:write_any",
          "attendance:write", "offerings:write", "materials:write_own", "transcripts:issue",
          "settings:write", "audit:read", "announcements:write",
          "finance:read", "finance:write"],
};

/** Firebase Admin Auth for this API (account creation, email changes, deletion). */
export const firebaseAuth = () => getAuth(app);

export const can = (user: Pick<User, "role">, permission: Permission) => PERMISSIONS[user.role].includes(permission);

/**
 * Verifies the Firebase ID token in the Authorization header and loads the caller from Postgres.
 * Roles come only from the database, never from the token or the request.
 */
export async function requireUser(
  req: VercelRequest,
  permission?: Permission,
  opts: { allowReplacedSession?: boolean } = {},
): Promise<User> {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!token) throw new HttpError(401, "Missing token");
  // Revocation checks need service-account credentials; without them we still verify signature and expiry.
  const decoded = await getAuth(app).verifyIdToken(token, hasCredentials).catch(() => {
    throw new HttpError(401, "Invalid or expired token");
  });
  const [user] = await db.select().from(users).where(eq(users.firebaseUid, decoded.uid)).limit(1);
  if (!user) throw new HttpError(403, "No account for this login");
  if (user.status === "archived") throw new HttpError(403, "Account deactivated");
  // One active browser session per account (as before): a newer sign-in replaces older ones.
  const sessionId = req.headers["x-session-id"];
  if (!opts.allowReplacedSession && typeof sessionId === "string" && user.currentSessionId && user.currentSessionId !== sessionId) {
    throw new HttpError(401, "Session replaced");
  }
  if (permission && !can(user, permission)) throw new HttpError(403, "Forbidden");
  await setActor(user.id);
  return user;
}
