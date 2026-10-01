// Step 1: dump Firestore collections to migration-data/*.json (contains personal data; git-ignored).
// Production: GOOGLE_APPLICATION_CREDENTIALS=./service-account.json FIREBASE_PROJECT_ID=... npx tsx scripts/migrate/export.ts
// Emulator:   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/migrate/export.ts
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { mkdirSync, writeFileSync } from "node:fs";

// --accounts-only: just the account collections (less personal data on disk).
const COLLECTIONS = process.argv.includes("--accounts-only")
  ? ["users", "archived_users"]
  : ["users", "archived_users", "courses", "trash", "attendance", "uploaded_files", "settings"];
const projectId = process.env.FIREBASE_PROJECT_ID ?? "acts-bible-school-portal";

const app = initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId } : { projectId, credential: applicationDefault() });
const firestore = process.env.FIRESTORE_DB_ID ? getFirestore(app, process.env.FIRESTORE_DB_ID) : getFirestore(app);

// Firestore Timestamps -> ISO strings so the dump is plain JSON.
const plain = (v: unknown): unknown =>
  v instanceof Timestamp ? v.toDate().toISOString()
  : Array.isArray(v) ? v.map(plain)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  : v;

const OUT_DIR = process.env.MIGRATION_DATA_DIR ?? "migration-data";
mkdirSync(OUT_DIR, { recursive: true });
for (const name of COLLECTIONS) {
  const snap = await firestore.collection(name).get();
  const docs = snap.docs.map((d) => ({ _id: d.id, ...(plain(d.data()) as object) }));
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(docs, null, 2));
  console.log(`${name}: ${docs.length}`);
}
process.exit(0);
