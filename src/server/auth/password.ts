import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP's 16 MiB scrypt configuration fits the Workers memory budget.
const options = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, options, (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt);
  return `scrypt:16384:8:5:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const match = /^scrypt:16384:8:5:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(encoded);
  if (!match) return false;
  const key = await derive(password, match[1]);
  return timingSafeEqual(key, Buffer.from(match[2], "hex"));
}
