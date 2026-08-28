import type { APIRoute } from "astro";
import { getDb } from "../../../../db";
import { getAuthenticatedUser } from "../../../../lib/auth";
import { UserManager } from "../../../../lib/user-manager";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const authUser = await getAuthenticatedUser(context.request);
    if (!authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();
    const body = (await context.request.json()) as any;
    const { currentPassword } = body || {};

    if (!currentPassword || typeof currentPassword !== "string") {
      return new Response(
        JSON.stringify({ error: "Current password is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const result = await UserManager.disableTotp(
      db,
      authUser.id,
      currentPassword,
    );

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: result.error || "Failed to disable TOTP",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Two-factor authentication disabled successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to disable TOTP",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
