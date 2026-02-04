import fs from "fs";
import path from "path";
import { env } from "../config/env.js";

export type UploadInput = {
  buffer: Buffer;
  originalName: string;
  mime?: string;
};

export type StoredObject = {
  provider: "local" | "s3";
  key: string;
  url: string;
};

function safeName(name: string) {
  return (name || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function joinUrl(base: string, p: string) {
  if (!base) return p;
  const b = base.replace(/\/$/, "");
  const pp = p.startsWith("/") ? p : `/${p}`;
  return `${b}${pp}`;
}

async function uploadLocal(prefix: string, input: UploadInput): Promise<StoredObject> {
  const dir = path.join(process.cwd(), "uploads", prefix);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${safeName(input.originalName)}`;
  const abs = path.join(dir, filename);
  await fs.promises.writeFile(abs, input.buffer);
  const url = `/${"uploads"}/${prefix}/${filename}`; // served via express.static
  return { provider: "local", key: `${prefix}/${filename}`, url };
}

async function uploadS3(prefix: string, input: UploadInput): Promise<StoredObject> {
  const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_PUBLIC_BASE_URL } = env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 storage is enabled but S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY is missing");
  }

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: S3_REGION || "us-east-1",
    endpoint: S3_ENDPOINT || undefined,
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }
  });

  const key = `${prefix}/${Date.now()}-${safeName(input.originalName)}`;
  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: input.buffer,
    ContentType: input.mime || "application/octet-stream"
  }));

  // Prefer a configured public base URL (CloudFront/CDN/S3 public URL). Fallback to standard AWS URL.
  const publicBase = S3_PUBLIC_BASE_URL
    || (S3_ENDPOINT ? undefined : (S3_REGION ? `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com` : `https://${S3_BUCKET}.s3.amazonaws.com`));

  const url = publicBase ? joinUrl(publicBase, key) : key;
  return { provider: "s3", key, url };
}

export const storage = {
  async uploadExpenseAttachment(input: UploadInput): Promise<StoredObject> {
    if (env.STORAGE_DRIVER === "s3") return uploadS3("expenses", input);
    return uploadLocal("expenses", input);
  }
};

export function makePublicUrl(u: string) {
  // If URL is already absolute, keep it; otherwise prefix with API base so Playwright can fetch it.
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  return joinUrl(env.PDF_BASE_URL, u);
}
