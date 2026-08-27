import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(env: any) {
  const d1 = env?.website_677078_xyz;
  if (!d1) {
    throw new Error("D1 database binding is not configured in environment.");
  }
  return drizzle(d1, { schema });
}

export function getMediaBucket(env: any) {
  const bucket = env?.website_677078_xyz;
  if (!bucket) {
    throw new Error("R2 bucket binding is not configured in environment.");
  }
  return bucket;
}

export * from "./schema";
