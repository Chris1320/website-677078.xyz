import { UserManager } from "./user-manager";

export interface AuthUser {
  id: string;
  username: string;
}

export function parseCookies(
  cookieHeader?: string | null,
): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  }
  return cookies;
}

/**
 * Extracts and verifies the session token from the incoming request cookies.
 */
export async function getAuthenticatedUser(
  request: Request,
): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  const sessionToken = cookies["auth_session"];

  if (!sessionToken) {
    return null;
  }

  const verified = await UserManager.verifySessionToken(sessionToken);
  if (!verified) {
    return null;
  }

  return {
    id: verified.id,
    username: verified.username,
  };
}

/**
 * Determines if a given URL path is restricted to authenticated administrators.
 */
export function isRouteProtected(pathname: string): boolean {
  const path = pathname.toLowerCase();

  if (path === "/admin" || path.startsWith("/admin/")) {
    return true;
  }

  if (path.startsWith("/api/admin")) {
    return true;
  }

  if (path.startsWith("/api/media")) {
    return true;
  }

  if (
    path.startsWith("/api/auth/credentials") ||
    path.startsWith("/api/auth/totp")
  ) {
    return true;
  }

  return false;
}
