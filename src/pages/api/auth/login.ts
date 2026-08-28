import type { APIRoute } from "astro";
import { getDb } from "../../../db";
import { UserManager } from "../../../lib/user-manager";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const db = getDb();
    const body = (await context.request.json()) as any;
    const { username, password, totpCode } = body || {};

    if (!username || typeof username !== "string" || !username.trim()) {
      return new Response(JSON.stringify({ error: "Username is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!password || typeof password !== "string") {
      return new Response(JSON.stringify({ error: "Password is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authResult = await UserManager.authenticate(
      db,
      username,
      password,
      totpCode,
    );

    if (!authResult.success) {
      if (authResult.requireTotp) {
        return new Response(
          JSON.stringify({
            requireTotp: true,
            warning:
              authResult.error || "Two-factor authentication code is required",
            message: "Two-factor authentication code is required",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: authResult.error || "Invalid username or password",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const user = authResult.user!;
    const sessionToken = await UserManager.createSessionToken({
      id: user.id,
      username: user.username,
    });

    const cookieHeader = UserManager.createSessionCookie(sessionToken);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          totp_enabled: user.totp_enabled,
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
      JSON.stringify({ error: error?.message || "Authentication error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
