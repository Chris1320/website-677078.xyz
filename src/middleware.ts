import { defineMiddleware } from "astro:middleware";
import { getAuthenticatedUser, isRouteProtected } from "./lib/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (pathname === "/login") {
    const user = await getAuthenticatedUser(context.request);
    if (user) {
      return context.redirect("/admin");
    }
  }

  if (isRouteProtected(pathname)) {
    const user = await getAuthenticatedUser(context.request);

    if (!user) {
      if (pathname.startsWith("/api/")) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized: Authentication required",
            code: "UNAUTHORIZED",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      const redirectUrl = `/login?redirect=${encodeURIComponent(pathname)}`;
      return context.redirect(redirectUrl);
    }

    context.locals.user = user;
  }

  const response = await next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  return response;
});
