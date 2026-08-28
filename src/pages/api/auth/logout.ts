import type { APIRoute } from "astro";
import { UserManager } from "../../../lib/user-manager";

export const prerender = false;

export const POST: APIRoute = async () => {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": UserManager.createClearSessionCookie(),
    },
  });
};
