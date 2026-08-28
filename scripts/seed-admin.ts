import { spawnSync } from "node:child_process";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string): Promise<string> {
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
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );

  const hashHex = bytesToHex(new Uint8Array(derivedBits));
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

async function main() {
  const args = process.argv.slice(2);
  const isLocal = args.includes("--local");
  const isRemote = args.includes("--remote");

  const nonFlagArgs = args.filter((a) => !a.startsWith("--"));
  const username = nonFlagArgs[0] || process.env.ADMIN_USERNAME || "admin";
  const password = nonFlagArgs[1] || process.env.ADMIN_PASSWORD || "admin12345";

  if (password.length < 8) {
    console.error(
      "Error: Admin password should be at least 8 characters long.",
    );
    process.exit(1);
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  const sql = `INSERT INTO users (id, username, password_hash, totp_secret, totp_enabled, created_at, updated_at) VALUES ('${userId}', '${username.replace(/'/g, "''")}', '${passwordHash}', NULL, 0, ${now}, ${now}) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, totp_secret = NULL, totp_enabled = 0, updated_at = excluded.updated_at;`;

  console.log("----------------------------------------");
  console.log("Generated Admin Seed SQL Statement:");
  console.log("----------------------------------------");
  console.log(sql);
  console.log("----------------------------------------");
  console.log(`Username: ${username}`);
  console.log(`Password: ${password}`);
  console.log("----------------------------------------");

  if (isLocal) {
    console.log("Executing against local D1 database...");
    const res = spawnSync(
      "wrangler",
      ["d1", "execute", "website_677078_xyz_db", "--local", `--command=${sql}`],
      { stdio: "inherit" },
    );
    if (res.status !== 0) {
      process.exit(res.status || 1);
    }
  } else if (isRemote) {
    console.log("Executing against remote D1 database...");
    const res = spawnSync(
      "wrangler",
      ["d1", "execute", "website-677078_xyz", "--remote", `--command=${sql}`],
      { stdio: "inherit" },
    );
    if (res.status !== 0) {
      process.exit(res.status || 1);
    }
  } else {
    console.log("To apply locally, run:");
    console.log("  bun run seed:admin --local");
    console.log("To apply to remote production D1, run:");
    console.log("  bun run seed:admin --remote");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
