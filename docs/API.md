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
| Post course materials (files, links) | | ✓ (own courses) | ✓ (any course) | ✓ (any course) |
| Issue and revoke official transcripts | | | | ✓ |
| Read issued transcripts | own | ✓ | ✓ | ✓ |
| Audit log, settings and feature switches | | | | ✓ |
| Post and manage announcements | | | | ✓ |
| Billing: invoices, payments, receipt review | own statement; upload receipts | | | ✓ |
| Receipt storage: usage, file list, delete files | | | | ✓ |
| Chat with the school office | own thread | | | ✓ (shared inbox, archive) |

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
| GET, POST | `/api/offerings[?includeDeleted=true]` | Course offerings with schedule and `schoolType` (`day`, `night`, or `null` for older courses not yet set). **Students get only the offerings they're enrolled in.** POST requires `schoolType` and enrolls the matching students: same school, year level and school year. A course with no `schoolType` enrolls nobody. |
| GET, PATCH, DELETE | `/api/offerings/:id` | A student gets 404 for a course they aren't enrolled in. PATCH can set `schoolType`, which enrolls that school's students; students already enrolled stay. DELETE archives (soft). |
| POST | `/api/offerings/:id/restore` | |
| GET | `/api/offerings/:id/students` | Admins. Everyone enrolled: `{ schoolType, students: [...] }`. Each student has `manual` (added by hand), `wrongSchool` (enrolled automatically from the other school) and `cannotRemove` ("Has a grade", "Has attendance" or null). |
| POST | `/api/offerings/:id/enroll` | Admins. `{ studentIds }` adds active students by hand, whatever their school or year (an exception). These enrollments stay when automatic enrollment runs again. Returns `{ added, skipped: [{ studentId, reason: "Already enrolled" }] }`. Each addition is logged as `enrollment.added`. Refused (409) for an archived course. |
| POST | `/api/offerings/:id/unenroll` | Admins. `{ studentIds }` removes them from the course, except students with a grade or attendance there. Returns `{ removed, skipped: [{ studentId, reason }] }`. Each removal is logged as `enrollment.removed`. |
| GET | `/api/grades?studentId=\|offeringId=` | One row per enrollment: `value`, `isIncomplete`, `status` (passed ≥ 75 / failed / incomplete / pending). |
| PUT | `/api/grades` | `{ offeringId, studentId, value (0-100 or null), isIncomplete }`. Recorded in history. |
| DELETE | `/api/grades?offeringId=&studentId=` | Reset to pending; the student stays enrolled. |
| POST | `/api/grades/bulk` | `{ items: [...] }`, all or nothing. |
| GET | `/api/attendance?offeringId=&date=` | That day's roster of enrolled students. |
| GET | `/api/attendance?offeringId=\|studentId=` | All records. |
| PUT | `/api/attendance` | `{ offeringId, date, records: [{ studentId, status: present\|absent\|late, isExcused, notes }] }` |
| POST | `/api/materials/upload-url` | Teachers (own courses), admins, president and VP (any course). `{ offeringId, fileName, contentType, sizeBytes }` returns `{ mode: "r2", key, url }`: PUT the file to `url` within 5 minutes. Up to 20 MB; PDF, Word, PowerPoint, Excel, text, zip and images. Without R2 it returns `{ mode: "db", maxBytes }`. Returns 507 when storage is full. |
| GET, POST | `/api/materials?category=&offeringId=&mine=true&archived=true\|false\|all` | POST: `{ offeringId, category, fileName, eventDate, eventTime, instructions }` plus exactly one of `key` (an R2 upload, with `contentType`), `data` (base64 ≤ 800 KB, only without R2, with `contentType`) or `url` (an http(s) link; `fileName` is its title). The course's active students get a `course_material` notification, and the response includes `notified`. Students see active materials of their own courses only. |
| GET, PATCH, DELETE | `/api/materials/:id` | PATCH `{ archived }`. Uploader or admin. DELETE also removes the R2 object. |
| GET | `/api/materials/:id/file` | `{ url, link }` for links and R2 files (a 5-minute link), or the file itself for older files stored in the database. Same visibility as the list. |
| GET | `/api/transcripts/preview?studentId=` | The transcript as it would be issued now. Lists finished courses (a grade or Incomplete) in active offerings by term, with units, remarks, units earned and a unit-weighted general average (Incomplete excluded). Admins. |
| GET, POST | `/api/transcripts?studentId=` | GET lists issued transcripts without their content. POST `{ studentId, purpose? }` issues one: content is frozen at issue time and gets a verification code (`XXXX-XXXX-XXXX`). Audited. |
| GET | `/api/transcripts/:id` | One issued transcript with its frozen `content`. |
| POST | `/api/transcripts/:id/revoke` | `{ reason }`. The transcript is kept; verification then reports it as revoked. Admins. |
| GET | `/api/verify/:code` | **No auth.** `{ status: valid\|revoked, school, studentName, studentNo, issuedAt, issuedBy, revokedAt }`, never grades; 404 for unknown codes. Behind the QR code on the PDF (`/verify/<code>` page). |

| GET | `/api/audit?table=&actorId=&entityId=&from=&to=&before=&limit=` | Admins. Every change to grades, accounts, profiles, student records, courses, attendance, files, transcripts and settings, newest first: `{ entries: [{ id, at, actor, action, table, op, subject, changes: [{ field, from, to }] }], nextBefore }`. People appear by name. `from`/`to` are Manila dates. |
| GET | `/api/settings/public` | **No auth.** `{ features: { chat, receiptUploads, announcements, studentSchedule } }`. CDN-cached for 60 s. |
| GET, PATCH | `/api/settings/:key` | Admins. `features`, `attendanceAlerts` (`warnAt`, `escalateAt`, `countExcused`, `countLate`), `billing` (`reminderDaysBefore`, `overdueEveryDays`). PATCH changes only the fields sent; unknown fields are rejected. |

| GET | `/api/notifications[?unread=true]` | The caller's own notifications, newest first (30), plus `unread`. Attendance alerts for now. |
| POST | `/api/notifications/read` | `{ ids }` or `{ all: true }`, for the caller's own notifications only. |
| GET, POST | `/api/announcements[?manage=true]` | GET: what the caller should see now (published, not expired, for their role; batch/course narrow it for students and teachers), pinned first, with `read`. `manage=true` (admins): all, with `status` (`scheduled`/`live`/`expired`) and `readCount`. POST (admins): `{ title, body, audienceRoles, cohort?, offeringId?, pinned, publishAt?, expiresAt? }`. Empty, and posting refused, while the `announcements` switch is off. |
| PATCH, DELETE | `/api/announcements/:id` | Admins. PATCH changes only the fields sent. |
| POST | `/api/announcements/:id/read` | Marks one from the caller's feed as read. |

| GET | `/api/finance/students` | Finance (admins). Every student with charged, paid, outstanding, overdue count and receipts waiting for review. |
| GET | `/api/finance/students/:id/statement`, `/api/me/finance` | Totals (charged, paid, balance, outstanding, credit), invoices with status, payments with what they paid, receipts, and the ledger with a running balance. Admins see anyone's; a student sees only their own. |
| GET, POST | `/api/finance/invoices?studentId=&status=` | POST `{ studentIds, description, dueOn, lines: [{ description, amount }] }` creates one invoice per student, numbered `INV-YYYY-0001`. Status is derived: `paid`, `partially_paid`, `pending`, `overdue`, or `void`. `status=open` returns anything still owed. |
| GET, PATCH | `/api/finance/invoices/:id` | PATCH `{ void: { reason } }`. Refused while payments are applied to the invoice. |
| POST | `/api/finance/invoices/:id/remind` | Notifies the student, at most once a day per invoice. |
| POST | `/api/finance/payments` | `{ studentId, amount, paidOn, method: cash\|bank_transfer\|gcash\|maya\|other, reference?, invoiceId? }`. Applied to `invoiceId` first, then the oldest unpaid invoices. Anything left over stays as credit. |
| PATCH | `/api/finance/payments/:id` | `{ void: { reason } }`. The invoices it paid go back to owing that amount. |
| POST | `/api/finance/receipts/upload-url` | Students. `{ contentType, sizeBytes, sha256 }` returns `{ mode: "r2", key, url }`: PUT the file to `url` within 5 minutes. Without R2 it returns `{ mode: "db" }`. Accepted types are JPEG, PNG, WebP and PDF, up to 2 MB. Duplicate files are refused. Returns 507 when receipt storage has reached the `storage.limitGb` setting. |
| GET, POST | `/api/finance/receipts?status=&studentId=` | POST (students): `{ contentType, sizeBytes, sha256, key \| data (base64), amountClaimed, paidOn, method, reference?, invoiceId? }`. The file's type is checked, and admins are notified. GET: admins see all receipts, students their own. |
| GET | `/api/finance/receipts/:id/file` | Returns `{ url }` (a 5-minute R2 link) or the file itself. Only the uploading student and admins can open it. |
| POST | `/api/finance/receipts/:id/review` | Admins. `{ decision: "approve", amount? }` records the payment. `{ decision: "reject", note }` requires a reason. The student is notified either way. |
| GET | `/api/storage` | Admins. Receipt storage usage: `{ mode: "r2" \| "db", usedBytes, trackedBytes, files, deletedFiles, byStatus, measured, warnBytes, limitBytes, level: "ok" \| "warn" \| "full" }`. Used = the larger of the stored receipts' sizes and the last bucket count. 1 GB = 1,000,000,000 bytes. |
| GET | `/api/storage/files?status=&q=&deletable=true&sort=newest\|largest&offset=` | Admins. Receipt files, 100 at a time (`nextOffset`). `status` can also be `deleted`. Each file has `cannotDelete`: null, or the reason it can't be deleted. |
| POST | `/api/storage/files/delete` | Admins. `{ ids }` (up to 200). Deletes the file (not the receipt or payment) of rejected receipts, and of approved receipts reviewed more than `deleteApprovedAfterYears` ago. Pending ones are never deleted. Returns `{ deleted, freedBytes, skipped: [{ id, reason }], warning }`. Afterwards the file endpoint returns 410. |
| POST | `/api/storage/recount` | Admins, R2 only. Lists the bucket, removes uploads more than a day old that were never submitted, and saves the real total. At most once a minute. |
| GET, POST | `/api/chat/conversations?q=&unread=true&status=` | GET: admins get the inbox (newest first, with `unread`, meaning the student is waiting for a reply, and a preview). Students get their own thread, created on first use, with `chatEnabled`. POST (admins): `{ studentId }` starts or opens a thread with a student. |
| PATCH | `/api/chat/conversations/:id` | Admins. `{ status: "open" \| "closed" }`. Students can't write in a closed thread. |
| GET, POST | `/api/chat/conversations/:id/messages?after=\|before=` | The thread's student or admins. GET: the newest 50, older ones (`before` an id), or only newer ones (`after` an id, used for polling). Returns `{ messages, more }`. POST: `{ body }` (1–4000 characters). Students need the `chat` switch on and an open thread. The other side gets one notification per burst. |
| POST | `/api/chat/conversations/:id/read` | Marks the thread read for the caller's side. Returns 204. |
| GET | `/api/chat/unread` | `{ count }` for the sidebar badge: threads waiting for the office (admins), or 0 or 1 (students). |
| GET | `/api/chat/archive?before=YYYY-MM-DD` | Admins. Messages sent before that day (Manila): count, conversations, bytes, oldest; plus the total chat size. |
| GET | `/api/chat/archive/messages?before=&afterId=` | Admins. Those messages, 2000 at a time, oldest first, with student and sender names (`nextAfterId`). |
| POST | `/api/chat/archive/purge` | Admins. `{ before, expectedCount }` removes the messages before that day, but only if there are still exactly `expectedCount` (otherwise 409). Logged as `chat.archived`. |
| GET | `/api/cron/daily` | Vercel Cron, `Authorization: Bearer $CRON_SECRET`. Sends payment reminders based on the `billing` setting (`reminderDaysBefore`, `overdueEveryDays`), cleans up old notifications, and checks receipt storage (bucket recount, then alerts). Safe to run more than once. |

Money is in pesos with two decimals. Invoices and payments are never deleted, only voided with a reason, and every change appears in the audit log.

**Absence alerts.** Saving attendance (`PUT /api/attendance`) checks the saved students in that course. When a student reaches the `attendanceAlerts` thresholds (default: warning at 2 unexcused absences, escalation at 3), the student, the course's teacher and every admin get a notification. Each threshold fires once per student per course, even if the day is saved again. Settings also control whether excused absences and lates count.

**Every request that changes data runs in one database transaction.** Either all of it is saved or none of it, and the response is sent only after the change is saved. A database trigger records each change with the signed-in user, the time, and the before and after values. The audit log is append-only.

Course offerings carry `units` (0.5–99 in steps of 0.5, default 3). A student with issued transcripts can't be deleted.

Values use the database's vocabulary: `yearLevel` 1–2, `semester` 1–3, roles `vice_president` etc., schedule `weekdays` 0 (Sunday) to 6, `frequency` once/daily/weekly/biweekly/monthly.

## Production requirements

Creating accounts, changing emails and deleting accounts use the Firebase Admin SDK, so Vercel needs `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` (service account) in addition to `FIREBASE_PROJECT_ID` and the Neon `DATABASE_URL`s.
