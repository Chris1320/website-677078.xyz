import type { APIRoute } from "astro";
import { desc } from "drizzle-orm";
import { getDb, media } from "../../../db";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = (context.locals as any).runtime?.env;
    const db = getDb(runtimeEnv);

    const assets = await db
      .select()
      .from(media)
      .orderBy(desc(media.created_at))
      .all();

    return new Response(JSON.stringify(assets), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to list media assets",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
