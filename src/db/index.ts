import { drizzle } from "drizzle-orm/d1";
import { env as cfEnv } from "cloudflare:workers";
import * as schema from "./schema";

export function getDb(customEnv?: Partial<Env>) {
  const env = (customEnv || cfEnv) as Env;
  const d1 = env?.website_677078_xyz_db;
  if (!d1) {
    throw new Error("Database binding is not configured in environment.");
  }
  return drizzle(d1, { schema });
}

export function getMediaBucket(customEnv?: Partial<Env>) {
  const env = (customEnv || cfEnv) as Env;
  const bucket = env?.website_677078_xyz_media;
  if (!bucket) {
    throw new Error("Bucket binding is not configured in environment.");
  }
  return bucket;
}

export * from "./schema";
