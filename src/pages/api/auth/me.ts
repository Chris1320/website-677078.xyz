import type { APIRoute } from "astro";
import { getDb } from "../../../db";
import { getAuthenticatedUser } from "../../../lib/auth";
import { UserManager } from "../../../lib/user-manager";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const authUser = await getAuthenticatedUser(context.request);
    if (!authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();
    const user = await UserManager.findById(db, authUser.id);
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        user: {
          id: user.id,
          username: user.username,
          totp_enabled: user.totp_enabled,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || "Failed to fetch user" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
