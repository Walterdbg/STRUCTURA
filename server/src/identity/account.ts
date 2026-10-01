import crypto from "node:crypto";
import { z } from "zod";
import { CAPABILITIES, DomainError, PRESETS, isCapability, type Capability, type PresetName } from "@structura/domain";
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from "../auth.js";
import { executeCommand, type CommandContext } from "../commands.js";
import type { Db } from "../db.js";
import type { ParsedCommand } from "../http.js";

// ---------------------------------------------------------------- my account (D-009)
export const myAccountFields = z.object({
  displayName: z.string().trim().min(1).max(200),
  locale: z.enum(["es", "en"]),
});

export const myPasswordFields = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

// The command log stores a hash of the payload, never the passwords.
const fingerprint = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

export async function updateMyAccount(db: Db, ctx: CommandContext, cmd: ParsedCommand<z.infer<typeof myAccountFields>>) {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "account.update", occurredAt: cmd.occurredAt, payload: f },
    async (t) => {
      const before = await t.query<{ display_name: string; locale: string }>("SELECT display_name, locale FROM users WHERE id = $1", [ctx.actorId]);
      await t.query("UPDATE users SET display_name = $2, locale = $3 WHERE id = $1", [ctx.actorId, f.displayName, f.locale]);
      return {
        result: { displayName: f.displayName, locale: f.locale },
        audit: [{ action: "account.updated", recordType: "membership", recordId: ctx.actorId, change: { before: before.rows[0], after: f } }],
      };
    }
  );
}

// Changing your own password needs the current one, and signs out every
// other session of yours.
export async function changeMyPassword(
  db: Db,
  ctx: CommandContext,
  currentSessionHash: string | null,
  cmd: ParsedCommand<z.infer<typeof myPasswordFields>>
) {
  const f = cmd.payload;
  const { rows } = await db.query<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1", [ctx.actorId]);
  if (!(await verifyPassword(f.currentPassword, rows[0]?.password_hash ?? null))) {
    throw new DomainError("validation", "The current password is not correct", { field: "currentPassword" });
  }
  if (f.currentPassword === f.newPassword) {
    throw new DomainError("validation", "The new password must be different", { field: "newPassword" });
  }
  const hash = await hashPassword(f.newPassword);
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "account.password", occurredAt: cmd.occurredAt, payload: { n: fingerprint(f.newPassword) } },
    async (t) => {
      await t.query("UPDATE users SET password_hash = $2 WHERE id = $1", [ctx.actorId, hash]);
      await t.query(
        "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND token_hash IS DISTINCT FROM $2",
        [ctx.actorId, currentSessionHash]
      );
      return {
        result: { ok: true },
        audit: [{ action: "account.password_changed", recordType: "membership", recordId: ctx.actorId, change: {} }],
      };
    }
  );
}

// ---------------------------------------------------------------- administrator (D-009)
const presetNames = Object.keys(PRESETS) as [PresetName, ...PresetName[]];

export const memberUpdateFields = z.object({
  active: z.boolean(),
  preset: z.enum(presetNames).optional(),
  capabilities: z.array(z.enum(CAPABILITIES)).optional(),
});

export const memberPasswordFields = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

async function memberRow(t: Db, tenantId: string, userId: string) {
  const { rows } = await t.query<{ active: boolean; capabilities: string[] }>(
    "SELECT active, capabilities FROM memberships WHERE tenant_id = $1 AND user_id = $2",
    [tenantId, userId]
  );
  if (!rows[0]) throw new DomainError("not_found", "User not found");
  return rows[0];
}

async function activeAdmins(t: Db, tenantId: string, exceptUserId: string): Promise<number> {
  const { rows } = await t.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = $1 AND m.user_id <> $2 AND m.active AND u.active AND 'tenant.admin' = ANY(m.capabilities)`,
    [tenantId, exceptUserId]
  );
  return Number(rows[0]?.n ?? 0);
}

// Switch a user off (never deleted, so history keeps their name) or change
// their profile. The organization can't lose its last administrator.
export async function updateMember(db: Db, ctx: CommandContext, userId: string, cmd: ParsedCommand<z.infer<typeof memberUpdateFields>>) {
  const f = cmd.payload;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "member.update", occurredAt: cmd.occurredAt, payload: { userId, ...f } },
    async (t) => {
      const before = await memberRow(t, ctx.tenantId, userId);
      const caps: Capability[] =
        f.preset || f.capabilities
          ? CAPABILITIES.filter((c) => new Set<Capability>([...(f.preset ? PRESETS[f.preset] : []), ...(f.capabilities ?? [])]).has(c))
          : before.capabilities.filter(isCapability);
      const stillAdmin = f.active && caps.includes("tenant.admin");
      if (!stillAdmin && before.capabilities.includes("tenant.admin") && (await activeAdmins(t, ctx.tenantId, userId)) === 0) {
        throw new DomainError("invalid_state", "The organization needs at least one active administrator", { reason: "last_admin" });
      }
      await t.query("UPDATE memberships SET active = $3, capabilities = $4 WHERE tenant_id = $1 AND user_id = $2", [
        ctx.tenantId,
        userId,
        f.active,
        caps,
      ]);
      if (!f.active) {
        await t.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND tenant_id = $2 AND revoked_at IS NULL", [userId, ctx.tenantId]);
      }
      return {
        result: { userId, active: f.active, capabilities: caps },
        audit: [{ action: "member.updated", recordType: "membership", recordId: userId, change: { before, after: { active: f.active, capabilities: caps } } }],
      };
    }
  );
}

// The administrator sets a new password for someone who forgot theirs;
// that person's sessions end.
export async function resetMemberPassword(db: Db, ctx: CommandContext, userId: string, cmd: ParsedCommand<z.infer<typeof memberPasswordFields>>) {
  const f = cmd.payload;
  await memberRow(db, ctx.tenantId, userId);
  const hash = await hashPassword(f.newPassword);
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "member.password_reset", occurredAt: cmd.occurredAt, payload: { userId, n: fingerprint(f.newPassword) } },
    async (t) => {
      await t.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, hash]);
      await t.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
      return {
        result: { ok: true },
        audit: [{ action: "member.password_reset", recordType: "membership", recordId: userId, change: {} }],
      };
    }
  );
}
