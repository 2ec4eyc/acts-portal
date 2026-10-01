// Where receipt files live. With the R2_* environment variables set, files go to a private
// Cloudflare R2 bucket: the browser uploads straight to it with a short-lived signed URL, and
// viewing redirects to a short-lived signed URL. Without them, files are stored in Postgres
// (receipt_files), sent through the API (2 MB max fits the 4.5 MB request limit).
import {
  DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

const env = process.env;
const r2Configured = () => Boolean(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET);
export const storageMode = (): "r2" | "db" => (r2Configured() ? "r2" : "db");

let client: S3Client | null = null;
function r2() {
  client ??= new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
  return client;
}

/** Signed PUT, valid 5 minutes, bound to the exact type and size. */
export const r2UploadUrl = (key: string, contentType: string, size: number) =>
  getSignedUrl(r2(), new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType, ContentLength: size }), { expiresIn: 300 });

/** Signed GET, valid 5 minutes. */
export const r2DownloadUrl = (key: string, fileName: string) =>
  getSignedUrl(r2(), new GetObjectCommand({
    Bucket: env.R2_BUCKET, Key: key,
    ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  }), { expiresIn: 300 });

/** Size of an uploaded object, or null if it isn't there (the browser never finished uploading). */
export async function r2ObjectSize(key: string): Promise<number | null> {
  try {
    const head = await r2().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

export type BucketObject = { key: string; size: number; lastModified: Date };

// Listing and deleting go through this object so tests can stand in for the bucket.
export const bucket = {
  /** Every object under a prefix (pages through ListObjectsV2, 1000 at a time). */
  async list(prefix: string): Promise<BucketObject[]> {
    const out: BucketObject[] = [];
    let token: string | undefined;
    do {
      const page = await r2().send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: prefix, ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? new Date(0) });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return out;
  },
  /** Deletes objects, 1000 per request. Throws if any of them couldn't be deleted. */
  async remove(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const res = await r2().send(new DeleteObjectsCommand({
        Bucket: env.R2_BUCKET, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }));
      if (res.Errors?.length) throw new Error(`R2 delete failed for ${res.Errors.length} file(s): ${res.Errors[0].Message ?? res.Errors[0].Code}`);
    }
  },
};
