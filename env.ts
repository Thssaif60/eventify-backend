import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),

  PDF_BRAND_NAME: z.string().default("Eventify Next Gen"),
  // Base URL where this API is reachable (used by PDF engine to fetch /uploads assets)
  PDF_BASE_URL: z.string().default("http://localhost:4000"),

  // Attachments storage driver: local | s3
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),

  // S3 / S3-compatible (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, etc.)
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  // Optional: custom endpoint for S3-compatible providers (e.g. https://<account>.r2.cloudflarestorage.com)
  S3_ENDPOINT: z.string().optional(),
  // Optional: public base URL for objects (preferred). Example: https://cdn.yourdomain.com or https://<bucket>.s3.<region>.amazonaws.com
  S3_PUBLIC_BASE_URL: z.string().optional()
});

export const env = EnvSchema.parse(process.env);
