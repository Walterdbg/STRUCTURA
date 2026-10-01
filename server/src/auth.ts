import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import { DomainError, isCapability, type Capability } from "@structura/domain";
import type { Db } from "./db.js";

// ---------------------------------------------------------------- passwords
// scrypt from Node's standard library: no extra dependency to trust.
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };
export const MIN_PASSWORD_LENGTH = 10;

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number, keyLen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, keyLen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError("validation", `Password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keyLen);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, N, r, p, salt, key] = stored.split("$");
  if (algo !== "scrypt" || !N || !r || !p || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), Number(N), Number(r), Number(p), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// A fixed hash used when the email doesn't exist, so a failed sign-in takes
// the same time whether or not the account exists.
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-password-never-valid");
  return dummyHash;
}

// ---------------------------------------------------------------- sessions
export const SESSION_COOKIE = "structura_session";
export const SESSION_HOURS = 12;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

// The stored form of a session token (used to keep the current session
// when signing out the others).
export const sessionHash = (token: string | undefined) => (token ? sha256(token) : null);

export async function createSession(db: Db, userId: string, tenantId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await db.query("INSERT INTO sessions (token_hash, user_id, tenant_id, expires_at) VALUES ($1, $2, $3, $4)", [
    sha256(token),
    userId,
    tenantId,
    expiresAt.toISOString(),
  ]);
  return { token, expiresAt };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [sha256(token)]);
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  displayName: string;
  locale: string;
  capabilities: Capability[];
}

// Looks the session up on every request, so a disabled user, removed
// membership or revoked session stops working immediately.
export async function loadSession(db: Db, token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const { rows } = await db.query<{
    user_id: string;
    tenant_id: string;
    email: string;
    display_name: string;
    locale: string;
    capabilities: string[];
  }>(
    `SELECT s.user_id, s.tenant_id, u.email, u.display_name, u.locale, m.capabilities
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.tenant_id = s.tenant_id AND m.user_id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.active AND m.active`,
    [sha256(token)]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    tenantId: row.tenant_id,
    email: row.email,
    displayName: row.display_name,
    locale: row.locale,
    capabilities: row.capabilities.filter(isCapability),
  };
}

// ---------------------------------------------------------------- guards
declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new DomainError("unauthenticated", "Sign in required");
  return req.auth;
}

export function requireCapability(req: FastifyRequest, capability: Capability): AuthContext {
  const auth = requireAuth(req);
  if (!auth.capabilities.includes(capability)) {
    throw new DomainError("permission_denied", `Missing permission: ${capability}`, { capability });
  }
  return auth;
}

// ---------------------------------------------------------------- sign-in throttle
// At most 5 failed attempts per email + address in 15 minutes. Kept in
// memory: a restart clears it, which is acceptable for this first version.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

export function tooManyFailures(key: string, now = Date.now()): boolean {
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()): void {
  failures.set(key, [...(failures.get(key) ?? []), now]);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}
