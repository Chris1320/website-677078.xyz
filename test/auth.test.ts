import { describe, it, expect } from "bun:test";
import { isRouteProtected, getAuthenticatedUser } from "../src/lib/auth";
import { UserManager } from "../src/lib/user-manager";

process.env.SECURITY_SIGNING_SECRET =
  "super-secure-jwt-signing-secret-with-more-than-32-chars-for-testing";

describe("Security & Route Authorization", () => {
  it("protected admin, media, and security settings routes", () => {
    expect(isRouteProtected("/admin")).toBe(true);
    expect(isRouteProtected("/admin/")).toBe(true);
    expect(isRouteProtected("/admin/settings")).toBe(true);

    expect(isRouteProtected("/api/admin/posts")).toBe(true);
    expect(isRouteProtected("/api/admin/posts/some-id")).toBe(true);
    expect(isRouteProtected("/api/admin/media/orphans")).toBe(true);
    expect(isRouteProtected("/api/admin/preview")).toBe(true);

    expect(isRouteProtected("/api/media/upload")).toBe(true);
    expect(isRouteProtected("/api/media/12345")).toBe(true);
    expect(isRouteProtected("/api/media")).toBe(true);

    expect(isRouteProtected("/api/auth/credentials")).toBe(true);
    expect(isRouteProtected("/api/auth/totp/setup")).toBe(true);
    expect(isRouteProtected("/api/auth/totp/enable")).toBe(true);
    expect(isRouteProtected("/api/auth/totp/disable")).toBe(true);

    expect(isRouteProtected("//admin")).toBe(true);
    expect(isRouteProtected("//api/admin/posts")).toBe(true);
    expect(isRouteProtected("///api/media/upload")).toBe(true);
    expect(isRouteProtected("/api//admin/posts")).toBe(true);
  });

  it("public routes", () => {
    expect(isRouteProtected("/")).toBe(false);
    expect(isRouteProtected("/login")).toBe(false);
    expect(isRouteProtected("/posts")).toBe(false);
    expect(isRouteProtected("/posts/my-cool-post")).toBe(false);
    expect(isRouteProtected("/api/auth/login")).toBe(false);
    expect(isRouteProtected("/api/auth/logout")).toBe(false);
    expect(isRouteProtected("/404")).toBe(false);
    expect(isRouteProtected("/500")).toBe(false);

    expect(isRouteProtected("/media/diagram.png")).toBe(false);
    expect(isRouteProtected("/media/avatar.jpg")).toBe(false);
  });

  it("extracts authenticated user from signed session cookie", async () => {
    const sessionToken = await UserManager.createSessionToken({
      id: "usr_test_123",
      username: "admin",
    });

    const reqWithCookie = new Request("https://example.com/api/admin/posts", {
      headers: {
        cookie: `auth_session=${sessionToken}; other_cookie=value`,
      },
    });

    const user = await getAuthenticatedUser(reqWithCookie);
    expect(user).not.toBeNull();
    expect(user?.id).toBe("usr_test_123");
    expect(user?.username).toBe("admin");
  });

  it("rejects unauthenticated or tampered session requests", async () => {
    const reqWithoutCookie = new Request("https://example.com/api/admin/posts");
    const user1 = await getAuthenticatedUser(reqWithoutCookie);
    expect(user1).toBeNull();

    const reqWithTamperedCookie = new Request(
      "https://example.com/api/admin/posts",
      {
        headers: {
          cookie: "auth_session=tampered_payload.tampered_signature",
        },
      },
    );
    const user2 = await getAuthenticatedUser(reqWithTamperedCookie);
    expect(user2).toBeNull();
  });
});

describe("UserManager", () => {
  it("hashes and verifies passwords securely using PBKDF2-SHA256", async () => {
    const plainPassword = "admin_super_secret_password_123!";
    const hash = await UserManager.hashPassword(plainPassword);

    expect(hash.startsWith("pbkdf2:100000:")).toBe(true);
    expect(await UserManager.verifyPassword(plainPassword, hash)).toBe(true);
    expect(await UserManager.verifyPassword("wrong_password", hash)).toBe(
      false,
    );
  });

  it("generates and verifies RFC 6238 TOTP two-factor codes", async () => {
    const { secret, otpauthUrl } = UserManager.generateTotpSetup("admin");
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(otpauthUrl.startsWith("otpauth://totp/")).toBe(true);
    expect(otpauthUrl.includes(secret)).toBe(true);

    const validCode = await UserManager.generateTotpCode(secret);
    expect(validCode.length).toBe(6);
    expect(/^\d{6}$/.test(validCode)).toBe(true);

    expect(await UserManager.verifyTotp(secret, validCode)).toBe(true);
    expect(await UserManager.verifyTotp(secret, "000000")).toBe(false);
    expect(await UserManager.verifyTotp(secret, "invalid")).toBe(false);
  });

  it("creates and verifies signed session tokens with expiration", async () => {
    const user = { id: "user_uuid_123", username: "admin" };
    const token = await UserManager.createSessionToken(user, 3600);

    const verified = await UserManager.verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.id).toBe("user_uuid_123");
    expect(verified?.username).toBe("admin");

    // Expired token test
    const expiredToken = await UserManager.createSessionToken(user, -10);
    const expiredVerified = await UserManager.verifySessionToken(expiredToken);
    expect(expiredVerified).toBeNull();
  });
});
