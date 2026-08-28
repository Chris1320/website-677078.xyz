import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../src/db/schema";
import { UserManager } from "../src/lib/user-manager";

describe("UserManager Database Operations", () => {
  const sqlite = new Database(":memory:");
  sqlite.run(`
    CREATE TABLE users (
      id text PRIMARY KEY NOT NULL,
      username text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      totp_secret text,
      totp_enabled integer DEFAULT 0 NOT NULL,
      created_at integer NOT NULL,
      updated_at integer NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema }) as any;

  it("seed default admin user when users table is empty", async () => {
    const admin = await UserManager.ensureDefaultAdmin(db);
    expect(admin).not.toBeNull();
    expect(admin.username).toBe("admin");
    expect(admin.totp_enabled).toBe(false);

    // Verify password against default "admin"
    const isValid = await UserManager.verifyPassword(
      "admin",
      admin.password_hash,
    );
    expect(isValid).toBe(true);
  });

  it("authenticate default admin credentials", async () => {
    const res = await UserManager.authenticate(db, "admin", "admin");
    expect(res.success).toBe(true);
    expect(res.user?.username).toBe("admin");

    const failed = await UserManager.authenticate(db, "admin", "wrongpassword");
    expect(failed.success).toBe(false);
  });

  it("updates username and password with current password verification", async () => {
    const admin = await UserManager.findByUsername(db, "admin");
    expect(admin).not.toBeNull();

    const wrongAuth = await UserManager.updateCredentials(
      db,
      admin!.id,
      "wrongpass",
      "newadmin",
      "newpassword123",
    );
    expect(wrongAuth.success).toBe(false);

    const updateRes = await UserManager.updateCredentials(
      db,
      admin!.id,
      "admin",
      "newadmin",
      "newpassword123",
    );
    expect(updateRes.success).toBe(true);
    expect(updateRes.updatedUser?.username).toBe("newadmin");

    const oldAuth = await UserManager.authenticate(db, "admin", "admin");
    expect(oldAuth.success).toBe(false);

    const newAuth = await UserManager.authenticate(
      db,
      "newadmin",
      "newpassword123",
    );
    expect(newAuth.success).toBe(true);
  });

  it("enable and require TOTP two-factor authentication", async () => {
    const user = await UserManager.findByUsername(db, "newadmin");
    expect(user).not.toBeNull();

    const { secret } = UserManager.generateTotpSetup("newadmin");
    const code = await UserManager.generateTotpCode(secret);

    const invalidEnable = await UserManager.enableTotp(
      db,
      user!.id,
      secret,
      "000000",
    );
    expect(invalidEnable.success).toBe(false);

    const enableRes = await UserManager.enableTotp(db, user!.id, secret, code);
    expect(enableRes.success).toBe(true);

    const authPrompt = await UserManager.authenticate(
      db,
      "newadmin",
      "newpassword123",
    );
    expect(authPrompt.success).toBe(false);
    expect(authPrompt.requireTotp).toBe(true);

    const badCodeAuth = await UserManager.authenticate(
      db,
      "newadmin",
      "newpassword123",
      "000000",
    );
    expect(badCodeAuth.success).toBe(false);
    expect(badCodeAuth.requireTotp).toBe(true);

    const freshCode = await UserManager.generateTotpCode(secret);
    const goodCodeAuth = await UserManager.authenticate(
      db,
      "newadmin",
      "newpassword123",
      freshCode,
    );
    expect(goodCodeAuth.success).toBe(true);
  });

  it("disables TOTP two-factor authentication with current password", async () => {
    const user = await UserManager.findByUsername(db, "newadmin");
    expect(user).not.toBeNull();

    const failDisable = await UserManager.disableTotp(
      db,
      user!.id,
      "wrongpass",
    );
    expect(failDisable.success).toBe(false);

    const disableRes = await UserManager.disableTotp(
      db,
      user!.id,
      "newpassword123",
    );
    expect(disableRes.success).toBe(true);

    const authDirect = await UserManager.authenticate(
      db,
      "newadmin",
      "newpassword123",
    );
    expect(authDirect.success).toBe(true);
    expect(authDirect.requireTotp).toBeUndefined();
  });
});
