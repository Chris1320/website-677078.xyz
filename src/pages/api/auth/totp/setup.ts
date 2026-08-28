import type { APIRoute } from "astro";
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

    const { secret, otpauthUrl } = UserManager.generateTotpSetup(
      authUser.username,
      "677078.xyz",
    );

    return new Response(
      JSON.stringify({
        secret,
        otpauthUrl,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to generate TOTP setup",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
