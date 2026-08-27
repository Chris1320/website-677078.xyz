import type { APIRoute } from "astro";
import { renderMarkdown } from "../../../lib/markdown";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const body = await context.request.json();
    const markdown = typeof body.markdown === "string" ? body.markdown : "";
    const html = await renderMarkdown(markdown);

    return new Response(JSON.stringify({ html }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error?.message || "Failed to render markdown preview",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
