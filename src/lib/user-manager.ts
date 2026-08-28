import * as OTPAuth from "otpauth";
import { eq } from "drizzle-orm";
import { users, type User } from "../db/schema";
import type { getDb } from "../db";
import {
  getSecuritySigningSecret,
  SECURITY_SESSION_MAX_AGE_SECONDS,
  SECURITY_PBKDF2_ITERATIONS,
} from "./info";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export class UserManager {
  static async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(salt);

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: SECURITY_PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );

    const hashHex = bytesToHex(new Uint8Array(derivedBits));
    return `pbkdf2:${SECURITY_PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
  }

  static async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    const parts = storedHash.split(":");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return false;
    }

    const iterations = parseInt(parts[1], 10);
    const salt = hexToBytes(parts[2]);
    const expectedHashHex = parts[3];

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"],
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      256,
    );

    const calculatedHashHex = bytesToHex(new Uint8Array(derivedBits));

    if (calculatedHashHex.length !== expectedHashHex.length) return false;
    let diff = 0;
    for (let i = 0; i < calculatedHashHex.length; i++) {
      diff |= calculatedHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
    }
    return diff === 0;
  }

  static generateTotpSecret(numBytes: number = 20): string {
    return new OTPAuth.Secret({ size: numBytes }).base32;
  }

  static generateTotpSetup(
    username: string,
    issuer: string = "677078.xyz",
  ): { secret: string; otpauthUrl: string } {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer,
      label: username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    return {
      secret: secret.base32,
      otpauthUrl: totp.toString(),
    };
  }

  static generateTotpCode(
    secret: string,
    timestampMs: number = Date.now(),
  ): string {
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    return totp.generate({ timestamp: timestampMs });
  }

  static verifyTotp(
    secret: string,
    token: string,
    window: number = 1,
  ): boolean {
    const cleanToken = token.trim().replace(/\s+/g, "");
    if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) {
      return false;
    }

    try {
      const totp = new OTPAuth.TOTP({
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      const delta = totp.validate({ token: cleanToken, window });
      return delta !== null;
    } catch {
      return false;
    }
  }

  static async createSessionToken(
    user: { id: string; username: string },
    maxAgeSeconds: number = SECURITY_SESSION_MAX_AGE_SECONDS,
  ): Promise<string> {
    const expiresAt = Date.now() + maxAgeSeconds * 1000;
    const payload = JSON.stringify({
      uid: user.id,
      usr: user.username,
      exp: expiresAt,
    });

    const encodedPayload = base64UrlEncode(payload);

    const signingSecret = getSecuritySigningSecret();
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(encodedPayload),
    );

    const signatureHex = bytesToHex(new Uint8Array(signature));
    return `${encodedPayload}.${signatureHex}`;
  }

  static async verifySessionToken(
    token?: string | null,
  ): Promise<{ id: string; username: string } | null> {
    if (!token || !token.includes(".")) return null;

    try {
      const [encodedPayload, signatureHex] = token.split(".");
      if (!encodedPayload || !signatureHex) return null;

      const signingSecret = getSecuritySigningSecret();
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(signingSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );

      const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        hexToBytes(signatureHex) as BufferSource,
        new TextEncoder().encode(encodedPayload),
      );

      if (!isValid) return null;

      const payloadJson = base64UrlDecode(encodedPayload);
      const payload = JSON.parse(payloadJson);

      if (!payload.uid || !payload.usr || !payload.exp) return null;
      if (Date.now() > payload.exp) return null;

      return {
        id: payload.uid,
        username: payload.usr,
      };
    } catch {
      return null;
    }
  }

  static createSessionCookie(
    token: string,
    maxAgeSeconds: number = SECURITY_SESSION_MAX_AGE_SECONDS,
  ): string {
    const isProd = import.meta.env.PROD;
    const secureFlag = isProd ? "; Secure" : "";
    return `auth_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureFlag}`;
  }

  static createClearSessionCookie(): string {
    return "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }

  static async findByUsername(
    db: ReturnType<typeof getDb>,
    username: string,
  ): Promise<User | null> {
    const cleanUsername = username.trim().toLowerCase();
    const found = await db
      .select()
      .from(users)
      .where(eq(users.username, cleanUsername))
      .get();
    return found || null;
  }

  static async findById(
    db: ReturnType<typeof getDb>,
    id: string,
  ): Promise<User | null> {
    const found = await db.select().from(users).where(eq(users.id, id)).get();
    return found || null;
  }

  static async authenticate(
    db: ReturnType<typeof getDb>,
    username: string,
    password: string,
    totpCode?: string,
  ): Promise<{
    success: boolean;
    user?: User;
    error?: string;
    requireTotp?: boolean;
  }> {
    const user = await this.findByUsername(db, username);
    if (!user) {
      return { success: false, error: "Invalid username or password" };
    }

    const isPasswordValid = await this.verifyPassword(
      password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      return { success: false, error: "Invalid username or password" };
    }

    // If TOTP 2FA is active for this account
    if (user.totp_enabled) {
      if (!totpCode || !totpCode.trim()) {
        return {
          success: false,
          requireTotp: true,
          error: "Two-factor authentication code is required",
        };
      }

      if (!user.totp_secret) {
        return { success: false, error: "TOTP configuration error" };
      }

      const isTotpValid = this.verifyTotp(user.totp_secret, totpCode);
      if (!isTotpValid) {
        return {
          success: false,
          requireTotp: true,
          error: "Invalid two-factor authentication code",
        };
      }
    }

    return {
      success: true,
      user,
    };
  }

  static async updateCredentials(
    db: ReturnType<typeof getDb>,
    userId: string,
    currentPassword: string,
    newUsername?: string,
    newPassword?: string,
  ): Promise<{
    success: boolean;
    error?: string;
    updatedUser?: User;
  }> {
    const user = await this.findById(db, userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const isCurrentPasswordValid = await this.verifyPassword(
      currentPassword,
      user.password_hash,
    );
    if (!isCurrentPasswordValid) {
      return { success: false, error: "Incorrect current password" };
    }

    let updatedUsername = user.username;
    if (newUsername && newUsername.trim()) {
      const cleanNewUsername = newUsername.trim().toLowerCase();
      if (cleanNewUsername.length < 3) {
        return {
          success: false,
          error: "Username must be at least 3 characters long",
        };
      }

      if (cleanNewUsername !== user.username) {
        const existing = await this.findByUsername(db, cleanNewUsername);
        if (existing && existing.id !== user.id) {
          return { success: false, error: "Username is already taken" };
        }
        updatedUsername = cleanNewUsername;
      }
    }

    let updatedPasswordHash = user.password_hash;
    if (newPassword && newPassword.trim()) {
      if (newPassword.length < 4) {
        return {
          success: false,
          error: "Password must be at least 4 characters long",
        };
      }
      updatedPasswordHash = await this.hashPassword(newPassword);
    }

    const now = new Date();
    await db
      .update(users)
      .set({
        username: updatedUsername,
        password_hash: updatedPasswordHash,
        updated_at: now,
      })
      .where(eq(users.id, user.id));

    const updated = await this.findById(db, user.id);
    return {
      success: true,
      updatedUser: updated || undefined,
    };
  }

  static async enableTotp(
    db: ReturnType<typeof getDb>,
    userId: string,
    secret: string,
    verificationCode: string,
  ): Promise<{ success: boolean; error?: string }> {
    const user = await this.findById(db, userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const isCodeValid = this.verifyTotp(secret, verificationCode);
    if (!isCodeValid) {
      return {
        success: false,
        error: "Invalid verification code. Please try again.",
      };
    }

    const now = new Date();
    await db
      .update(users)
      .set({
        totp_secret: secret,
        totp_enabled: true,
        updated_at: now,
      })
      .where(eq(users.id, user.id));

    return { success: true };
  }

  static async disableTotp(
    db: ReturnType<typeof getDb>,
    userId: string,
    currentPassword: string,
    totpCode?: string,
  ): Promise<{ success: boolean; error?: string }> {
    const user = await this.findById(db, userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const isPasswordValid = await this.verifyPassword(
      currentPassword,
      user.password_hash,
    );
    if (!isPasswordValid) {
      return { success: false, error: "Incorrect password" };
    }

    if (user.totp_enabled && user.totp_secret) {
      if (!totpCode || !totpCode.trim()) {
        return {
          success: false,
          error: "Two-factor authentication code is required",
        };
      }
      const isTotpValid = this.verifyTotp(user.totp_secret, totpCode);
      if (!isTotpValid) {
        return {
          success: false,
          error: "Invalid two-factor authentication code",
        };
      }
    }

    const now = new Date();
    await db
      .update(users)
      .set({
        totp_secret: null,
        totp_enabled: false,
        updated_at: now,
      })
      .where(eq(users.id, user.id));

    return { success: true };
  }
}
