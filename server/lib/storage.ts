// Where receipt files live. With the R2_* environment variables set, files go to a private
// Cloudflare R2 bucket: the browser uploads straight to it with a short-lived signed URL, and
// viewing redirects to a short-lived signed URL. Without them, files are stored in Postgres
// (receipt_files), sent through the API (2 MB max fits the 4.5 MB request limit).
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
