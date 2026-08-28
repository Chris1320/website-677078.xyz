import type { APIRoute } from "astro";
import { getDb } from "../../../db";
import { getAuthenticatedUser } from "../../../lib/auth";
import { UserManager } from "../../../lib/user-manager";

export const prerender = false;

export const PUT: APIRoute = async (context) => {
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
    const { currentPassword, newUsername, newPassword } = body || {};

    if (!currentPassword || typeof currentPassword !== "string") {
      return new Response(
        JSON.stringify({ error: "Current password is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const result = await UserManager.updateCredentials(
      db,
      authUser.id,
      currentPassword,
      newUsername,
      newPassword,
    );

    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: result.error || "Failed to update credentials",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const updatedUser = result.updatedUser!;
    const newSessionToken = await UserManager.createSessionToken({
      id: updatedUser.id,
      username: updatedUser.username,
    });

    const cookieHeader = UserManager.createSessionCookie(newSessionToken);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          totp_enabled: updatedUser.totp_enabled,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": cookieHeader,
        },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to update credentials",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
