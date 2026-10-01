# ACTS Portal API

One Vercel Function (`api/index.ts`) serves every endpoint: `vercel.json` rewrites `/api/<path>` to it, and it dispatches to the handlers in `server/routes/` (route table in `server/routes/index.ts`). One function keeps deployments within plan limits (Hobby allows 12) and shares one warm database pool. Backed by PostgreSQL. Every endpoint except `/api/health` needs a Firebase ID token:

```
Authorization: Bearer <await auth.currentUser.getIdToken()>
```

The caller's role always comes from the database. Errors are JSON `{ "error": "..." }`: 400 invalid input (unknown fields are rejected), 401 missing/invalid token, 403 not allowed or account archived, 404 not found, 405 wrong method, 409 conflict, 413 file too large.

## Who can do what

| | student | teacher | president / VP | admin |
|---|:-:|:-:|:-:|:-:|
| Own profile (`/api/me`) | ✓ | ✓ | ✓ | ✓ |
| Read accounts, grades, attendance of others | | ✓ | ✓ | ✓ |
| Edit student accounts, bulk enroll, clean up | | | ✓ | ✓ |
| Staff accounts, roles, emails; create/archive/restore/delete accounts | | | | ✓ |
| Grade own courses (instructor) | | ✓ | ✓ | ✓ |
| Grade any course, bulk grades | | | ✓ | ✓ |
| Take attendance | | | ✓ | ✓ |
| Courses (create, edit, archive) | | | | ✓ |
| Upload files to own courses | | ✓ | | ✓ (any course) |
| Issue and revoke official transcripts | | | | ✓ |
| Read issued transcripts | own | ✓ | ✓ | ✓ |

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | No auth. Checks the database. |
| GET, PATCH | `/api/me[?include=grades]` | Own profile (optionally with grades). PATCH: only self-editable fields. |
| POST, DELETE | `/api/me/session` | POST `{ sessionId }` on sign-in makes this browser the account's only active session; requests carrying an older `X-Session-Id` get 401 `Session replaced`. DELETE on sign-out. |
| GET | `/api/users?role=&status=current\|archived\|all&include=grades` | Account list with profile and student record (and grades). |
| POST | `/api/users` | Create login + account (`email`, `password`, `firstName`, `lastName`, `role`, profile fields, `student: {...}`). Students are enrolled automatically. |
| GET, PATCH, DELETE | `/api/users/:id[?include=grades]` | PATCH may include `email` (changes the Firebase login, same uid), `role`, `status`, `student`. DELETE: archived accounts only. |
| GET | `/api/users/:id/history` | Grade changes and migrated edit history, newest first. |
| POST | `/api/users/archive`, `/api/users/restore` | `{ ids }` |
| POST | `/api/users/enroll` | `{ studentIds, yearLevel, cohort, schoolYear }`, then enrolls in matching offerings. |
| POST | `/api/users/cleanup` | `{ studentIds }`: removes enrollments/grades in archived offerings (audited). |
| GET, POST | `/api/offerings[?includeDeleted=true]` | Course offerings with schedule. POST enrolls matching students. |
| GET, PATCH, DELETE | `/api/offerings/:id` | DELETE archives (soft). |
| POST | `/api/offerings/:id/restore` | |
| GET | `/api/grades?studentId=\|offeringId=` | One row per enrollment: `value`, `isIncomplete`, `status` (passed ≥ 75 / failed / incomplete / pending). |
| PUT | `/api/grades` | `{ offeringId, studentId, value (0-100 or null), isIncomplete }`. Recorded in history. |
| DELETE | `/api/grades?offeringId=&studentId=` | Reset to pending; the student stays enrolled. |
| POST | `/api/grades/bulk` | `{ items: [...] }`, all or nothing. |
| GET | `/api/attendance?offeringId=&date=` | That day's roster of enrolled students. |
| GET | `/api/attendance?offeringId=\|studentId=` | All records. |
| PUT | `/api/attendance` | `{ offeringId, date, records: [{ studentId, status: present\|absent\|late, isExcused, notes }] }` |
| GET, POST | `/api/materials?category=&offeringId=&mine=true&archived=true\|false\|all` | POST: `{ offeringId, category, fileName, contentType, data (base64), eventDate, eventTime, instructions }`, max 800 KB. Students see active files of their own courses only. |
| GET, PATCH, DELETE | `/api/materials/:id` | PATCH `{ archived }`. Uploader or admin. |
| GET | `/api/materials/:id/file` | Download (same visibility as the list). |
| GET | `/api/transcripts/preview?studentId=` | The transcript as it would be issued now. Lists finished courses (a grade or Incomplete) in active offerings by term, with units, remarks, units earned and a unit-weighted general average (Incomplete excluded). Admins. |
| GET, POST | `/api/transcripts?studentId=` | GET lists issued transcripts without their content. POST `{ studentId, purpose? }` issues one: content is frozen at issue time and gets a verification code (`XXXX-XXXX-XXXX`). Audited. |
| GET | `/api/transcripts/:id` | One issued transcript with its frozen `content`. |
| POST | `/api/transcripts/:id/revoke` | `{ reason }`. The transcript is kept; verification then reports it as revoked. Admins. |
| GET | `/api/verify/:code` | **No auth.** `{ status: valid\|revoked, school, studentName, studentNo, issuedAt, issuedBy, revokedAt }`, never grades; 404 for unknown codes. Behind the QR code on the PDF (`/verify/<code>` page). |

Course offerings carry `units` (0.5–99 in steps of 0.5, default 3). A student with issued transcripts can't be deleted.

Values use the database's vocabulary: `yearLevel` 1–2, `semester` 1–3, roles `vice_president` etc., schedule `weekdays` 0 (Sunday) to 6, `frequency` once/daily/weekly/biweekly/monthly.

## Production requirements

Creating accounts, changing emails and deleting accounts use the Firebase Admin SDK, so Vercel needs `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` (service account) in addition to `FIREBASE_PROJECT_ID` and the Neon `DATABASE_URL`s.
