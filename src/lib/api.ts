import { auth } from './firebase';

// Browser side of the /api calls: adds the Firebase ID token and this tab's session id, and turns
// error responses into ApiError. See docs/API.md.

const SESSION_KEY = 'acts_session_id';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onSessionReplaced: (() => void) | null = null;
/** Called when the server says another sign-in has replaced this tab's session. */
export const setSessionReplacedHandler = (fn: (() => void) | null) => { onSessionReplaced = fn; };

async function headers(json: boolean): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  const sessionId = sessionStorage.getItem(SESSION_KEY);
  if (sessionId) h['X-Session-Id'] = sessionId;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function send(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | undefined> }) {
  const qs = new URLSearchParams(Object.entries(init.query ?? {}).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ''));
  const res = await fetch(`/api/${path}${qs.toString() ? `?${qs}` : ''}`, {
    method: init.method ?? 'GET',
    headers: await headers(init.body !== undefined),
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const message = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText;
    if (res.status === 401 && message === 'Session replaced') onSessionReplaced?.();
    throw new ApiError(res.status, message);
  }
  return res;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}): Promise<T> {
  const res = await send(path, init);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Downloads a file from the API and hands it to the browser as a save. */
export async function downloadFile(path: string, fileName: string) {
  const blob = await (await send(path, {})).blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Makes this tab the account's active session (signing in elsewhere later replaces it). */
export async function claimSession() {
  const sessionId = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, sessionId);
  await api('me/session', { method: 'POST', body: { sessionId } });
}

/** On sign-out: releases the session (if it's still ours) and forgets it. */
export async function releaseSession() {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) await api('me/session', { method: 'DELETE' });
  } finally {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

export const hasSession = () => Boolean(sessionStorage.getItem(SESSION_KEY));
