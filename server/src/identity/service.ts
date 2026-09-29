import { z } from "zod";
import {
  CAPABILITIES,
  DomainError,
  PRESETS,
  isValidTimeZone,
  uuidv7,
  type Capability,
  type PresetName,
} from "@structura/domain";
import { MIN_PASSWORD_LENGTH, hashPassword } from "../auth.js";
import { executeCommand, type CommandContext, type CommandResult } from "../commands.js";
import { isUniqueViolation, type Db } from "../db.js";
import type { ParsedCommand } from "../http.js";

export interface MemberRecord {
  userId: string;
  email: string;
  displayName: string;
  locale: string;
  active: boolean;
  capabilities: Capability[];
}

export async function listMembers(db: Db, tenantId: string): Promise<MemberRecord[]> {
  const { rows } = await db.query<{
    user_id: string;
    email: string;
    display_name: string;
    locale: string;
    active: boolean;
    capabilities: Capability[];
  }>(
    `SELECT m.user_id, u.email, u.display_name, u.locale, (m.active AND u.active) AS active, m.capabilities
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.tenant_id = $1
      ORDER BY u.display_name`,
    [tenantId]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    locale: r.locale,
    active: r.active,
    capabilities: r.capabilities,
  }));
}

const presetNames = Object.keys(PRESETS) as [PresetName, ...PresetName[]];

export const newMemberFields = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(200),
  locale: z.enum(["es", "en"]).default("es"),
  // Initial password set by the administrator and handed over in person.
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  preset: z.enum(presetNames).optional(),
  capabilities: z.array(z.enum(CAPABILITIES)).optional(),
});

export type NewMemberFields = z.infer<typeof newMemberFields>;

function capabilitiesFor(f: { preset?: PresetName; capabilities?: Capability[] }): Capability[] {
  const set = new Set<Capability>([...(f.preset ? PRESETS[f.preset] : []), ...(f.capabilities ?? [])]);
  return CAPABILITIES.filter((c) => set.has(c));
}

// Tenant administrator adds a staff account (DEC-013: own accounts first).
export async function addMember(
  db: Db,
  ctx: CommandContext,
  cmd: ParsedCommand<NewMemberFields>
): Promise<CommandResult<MemberRecord>> {
  const f = cmd.payload;
  const capabilities = capabilitiesFor(f);
  // The password is hashed before hashing the command, so it never lands
  // in the command log, the audit trail or the outbox.
  const passwordHash = await hashPassword(f.password);
  const { password: _omit, ...safe } = f;
  return executeCommand(
    db,
    ctx,
    { commandId: cmd.commandId, commandType: "member.add", occurredAt: cmd.occurredAt, payload: safe },
    async (t) => {
      const userId = uuidv7();
      try {
        await t.query(
          "INSERT INTO users (id, email, display_name, locale, password_hash) VALUES ($1, $2, $3, $4, $5)",
          [userId, f.email, f.displayName, f.locale, passwordHash]
        );
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new DomainError("validation", "An account with this email already exists", { field: "email" });
        }
        throw err;
      }
      await t.query("INSERT INTO memberships (tenant_id, user_id, capabilities) VALUES ($1, $2, $3)", [
        ctx.tenantId,
        userId,
        capabilities,
      ]);
      const member: MemberRecord = {
        userId,
        email: f.email,
        displayName: f.displayName,
        locale: f.locale,
        active: true,
        capabilities,
      };
      return {
        result: member,
        audit: [
          {
            action: "member.added",
            recordType: "membership",
            recordId: userId,
            change: { email: f.email, displayName: f.displayName, capabilities },
          },
        ],
      };
    }
  );
}

// ---------------------------------------------------------------- bootstrap
// First tenant + first administrator on a new installation. Used by the
// setup command (cli/bootstrap.ts) and by tests. Refuses if the email exists.
export interface BootstrapInput {
  tenantName: string;
  timezone: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  locale?: "es" | "en";
}

export async function bootstrapTenant(db: Db, input: BootstrapInput): Promise<{ tenantId: string; userId: string }> {
  if (!input.tenantName.trim()) throw new DomainError("validation", "Organization name is required");
  if (!isValidTimeZone(input.timezone)) throw new DomainError("validation", `Unknown timezone: ${input.timezone}`);
  const email = input.adminEmail.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) throw new DomainError("validation", "Invalid email");
  const passwordHash = await hashPassword(input.adminPassword);
  const tenantId = uuidv7();
  const userId = uuidv7();
  const locale = input.locale ?? "es";
  await db.tx(async (t) => {
    await t.query("INSERT INTO tenants (id, display_name, default_locale, default_timezone) VALUES ($1, $2, $3, $4)", [
      tenantId,
      input.tenantName.trim(),
      locale,
      input.timezone,
    ]);
    try {
      await t.query("INSERT INTO users (id, email, display_name, locale, password_hash) VALUES ($1, $2, $3, $4, $5)", [
        userId,
        email,
        input.adminName.trim(),
        locale,
        passwordHash,
      ]);
    } catch (err) {
      if (isUniqueViolation(err)) throw new DomainError("validation", "An account with this email already exists");
      throw err;
    }
    await t.query("INSERT INTO memberships (tenant_id, user_id, capabilities) VALUES ($1, $2, $3)", [
      tenantId,
      userId,
      [...PRESETS.tenant_administrator],
    ]);
    await t.query(
      `INSERT INTO audit_entries (id, tenant_id, actor_id, deployment_id, action, record_type, record_id, change, occurred_at)
       VALUES ($1, $2, NULL, 'setup', 'tenant.bootstrapped', 'tenant', $2, $3, now())`,
      [uuidv7(), tenantId, JSON.stringify({ tenantName: input.tenantName.trim(), adminEmail: email })]
    );
  });
  return { tenantId, userId };
}
