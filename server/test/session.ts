import type { FastifyInstance } from "fastify";
import { uuidv7 } from "@structura/domain";
import { buildApp } from "../src/app.js";
import type { Db } from "../src/db.js";
import { bootstrapTenant } from "../src/identity/service.js";
import { freshDb, testConfig } from "./helpers.js";

// Synthetic test accounts only (spec 19.2 fixtures).
export const TEST_PASSWORD = "test-password-123";

export interface TestTenant {
  tenantId: string;
  adminId: string;
  adminEmail: string;
  cookie: string;
}

export interface TestWorld {
  db: Db;
  app: FastifyInstance;
  close(): Promise<void>;
}

export async function world(): Promise<TestWorld> {
  const db = await freshDb();
  const app = await buildApp({ db, config: testConfig(), logger: false });
  return {
    db,
    app,
    close: async () => {
      await app.close();
      await db.close();
    },
  };
}

export async function login(app: FastifyInstance, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === "structura_session");
  if (!cookie) throw new Error("no session cookie");
  return `structura_session=${cookie.value}`;
}

let counter = 0;
export async function tenant(w: TestWorld, name = "Test Org"): Promise<TestTenant> {
  counter += 1;
  const adminEmail = `admin${counter}-${Date.now()}@example.test`;
  const { tenantId, userId } = await bootstrapTenant(w.db, {
    tenantName: name,
    timezone: "America/Panama",
    adminEmail,
    adminName: `Admin ${counter}`,
    adminPassword: TEST_PASSWORD,
  });
  return { tenantId, adminId: userId, adminEmail, cookie: await login(w.app, adminEmail) };
}

export function command(payload: unknown, opts: { commandId?: string; expectedVersion?: number | null } = {}) {
  return {
    commandId: opts.commandId ?? uuidv7(),
    occurredAt: new Date().toISOString(),
    payloadVersion: 1,
    expectedVersion: opts.expectedVersion ?? null,
    payload,
  };
}
