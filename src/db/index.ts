import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(env: any) {
  const d1 = env?.website_677078_xyz_db;
  if (!d1) {
    throw new Error(
      "D1 database binding (website_677078_xyz_db) is not configured in environment.",
    );
  }
  return drizzle(d1, { schema });
}

export function getMediaBucket(env: any) {
  const bucket = env?.website_677078_xyz_media;
  if (!bucket) {
    throw new Error(
      "R2 bucket binding (website_677078_xyz_media) is not configured in environment.",
    );
  }
  return bucket;
}

export * from "./schema";
