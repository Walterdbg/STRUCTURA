import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError, parseCommand } from "@structura/domain";
import {
  SESSION_COOKIE,
  SESSION_HOURS,
  clearFailures,
  createSession,
  dummyPasswordHash,
  recordFailure,
  requireAuth,
  revokeSession,
  sessionHash,
  tooManyFailures,
  verifyPassword,
} from "../auth.js";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { commandRequest, idParam } from "../http.js";
import {
  changeMyPassword,
  memberPasswordFields,
  memberUpdateFields,
  myAccountFields,
  myPasswordFields,
  resetMemberPassword,
  updateMember,
  updateMyAccount,
} from "./account.js";
import { addMember, listMembers, newMemberFields } from "./service.js";

const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(3).max(320),
  password: z.string().min(1).max(200),
  tenantId: z.string().uuid().optional(),
});

export function identityRoutes(app: FastifyInstance, db: Db, config: Config): void {
  app.post("/api/auth/login", async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) throw new DomainError("validation", "Email and password are required");
    const { email, password, tenantId } = parsed.data;

    const throttleKey = `${email}|${req.ip}`;
    if (tooManyFailures(throttleKey)) {
      throw new DomainError("permission_denied", "Too many failed attempts. Wait 15 minutes and try again.", {
        reason: "throttled",
      });
    }

    const { rows } = await db.query<{ id: string; password_hash: string | null; active: boolean }>(
      "SELECT id, password_hash, active FROM users WHERE lower(email) = $1",
      [email]
    );
    const user = rows[0];
    const ok = await verifyPassword(password, user?.password_hash ?? (await dummyPasswordHash()));
    if (!user || !user.active || !ok) {
      recordFailure(throttleKey);
      // One message for every failure: never reveal which part was wrong.
      throw new DomainError("unauthenticated", "Wrong email or password");
    }

    const memberships = await db.query<{ tenant_id: string; display_name: string }>(
      `SELECT m.tenant_id, t.display_name FROM memberships m JOIN tenants t ON t.id = m.tenant_id
        WHERE m.user_id = $1 AND m.active ORDER BY t.display_name`,
      [user.id]
    );
    const tenants = memberships.rows;
    if (tenants.length === 0) {
      recordFailure(throttleKey);
      throw new DomainError("unauthenticated", "Wrong email or password");
    }
    const chosen = tenantId ? tenants.find((t) => t.tenant_id === tenantId) : tenants.length === 1 ? tenants[0] : undefined;
    if (!chosen) {
      // Several organizations: the screen asks which one, then signs in again.
      return reply.status(409).send({
        error: "choose_tenant",
        message: "Choose an organization",
        tenants: tenants.map((t) => ({ id: t.tenant_id, name: t.display_name })),
      });
    }

    clearFailures(throttleKey);
    const session = await createSession(db, user.id, chosen.tenant_id);
    reply.setCookie(SESSION_COOKIE, session.token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: config.cookieSecure,
      maxAge: SESSION_HOURS * 3600,
    });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await revokeSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => {
    const auth = requireAuth(req);
    const t = await db.query<{ display_name: string; default_timezone: string; default_locale: string }>(
      "SELECT display_name, default_timezone, default_locale FROM tenants WHERE id = $1",
      [auth.tenantId]
    );
    const tenant = t.rows[0]!;
    return {
      user: { id: auth.userId, email: auth.email, displayName: auth.displayName, locale: auth.locale },
      tenant: {
        id: auth.tenantId,
        name: tenant.display_name,
        defaultTimezone: tenant.default_timezone,
        defaultLocale: tenant.default_locale,
      },
      capabilities: auth.capabilities,
    };
  });

  // Members are visible to every member (needed to pick a responsible person).
  app.get("/api/members", async (req) => {
    const auth = requireAuth(req);
    return { items: await listMembers(db, auth.tenantId) };
  });

  app.post("/api/members", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "tenant.admin", newMemberFields, config.deploymentId);
    const res = await addMember(db, ctx, cmd);
    return reply.status(res.replayed ? 200 : 201).send(res);
  });

  // ---------------------------------------------------------------- my account (D-009)
  // Any signed-in person may change their own name, language and password.
  app.put("/api/me", async (req) => {
    const auth = requireAuth(req);
    const cmd = parseCommand(myAccountFields, req.body);
    return updateMyAccount(db, { tenantId: auth.tenantId, actorId: auth.userId, deploymentId: config.deploymentId }, cmd);
  });

  app.post("/api/me/password", async (req) => {
    const auth = requireAuth(req);
    const cmd = parseCommand(myPasswordFields, req.body);
    return changeMyPassword(
      db,
      { tenantId: auth.tenantId, actorId: auth.userId, deploymentId: config.deploymentId },
      sessionHash(req.cookies[SESSION_COOKIE]),
      cmd
    );
  });

  // ---------------------------------------------------------------- administrator (D-009)
  app.put("/api/members/:id", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "tenant.admin", memberUpdateFields, config.deploymentId);
    return updateMember(db, ctx, id, cmd);
  });

  app.post("/api/members/:id/password", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "tenant.admin", memberPasswordFields, config.deploymentId);
    return resetMemberPassword(db, ctx, id, cmd);
  });
}