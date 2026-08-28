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
    const { secret, code } = body || {};

    if (!secret || typeof secret !== "string") {
      return new Response(
        JSON.stringify({ error: "TOTP secret is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!code || typeof code !== "string") {
      return new Response(
        JSON.stringify({ error: "Verification code is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const result = await UserManager.enableTotp(db, authUser.id, secret, code);

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: result.error || "Invalid verification code",
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
        message: "Two-factor authentication enabled successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to enable TOTP",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
