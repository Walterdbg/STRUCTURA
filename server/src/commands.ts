import crypto from "node:crypto";
import { DomainError, uuidv7 } from "@structura/domain";
import { isUniqueViolation, type Db } from "./db.js";

// Who is acting. Always taken from the session / deployment, never from the
// request body (integration contract, "Shared command protocol").
export interface CommandContext {
  tenantId: string;
  actorId: string | null;
  deploymentId: string;
  // The server's current time; "today" for date rules comes from it.
  now?: Date;
}

export interface CommandInput {
  commandId: string;
  commandType: string;
  occurredAt: string;
  payload: unknown;
}

export interface AuditRecord {
  action: string;
  recordType: string;
  recordId?: string | null;
  change?: unknown;
}

export interface OutboxRecord {
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

export interface CommandOutcome<R> {
  result: R;
  audit: AuditRecord[];
  outbox?: OutboxRecord[];
}

export interface CommandResult<R> {
  commandId: string;
  result: R;
  // true when this was a retry and the stored result was returned.
  replayed: boolean;
}

// Key order must not change the hash, so objects are serialized sorted.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function payloadHash(commandType: string, payload: unknown): string {
  return crypto.createHash("sha256").update(stableStringify({ commandType, payload })).digest("hex");
}

async function findStored<R>(
  db: Db,
  ctx: CommandContext,
  input: CommandInput,
  hash: string
): Promise<CommandResult<R> | null> {
  const { rows } = await db.query<{ tenant_id: string; payload_hash: string; result: R }>(
    "SELECT tenant_id, payload_hash, result FROM command_log WHERE command_id = $1",
    [input.commandId]
  );
  const row = rows[0];
  if (!row) return null;
  // Another tenant's command ID, or the same ID with different data: refuse
  // without revealing anything about the stored command.
  if (row.tenant_id !== ctx.tenantId || row.payload_hash !== hash) {
    throw new DomainError("idempotency_conflict", "This command ID was already used for a different request", {
      commandId: input.commandId,
    });
  }
  return { commandId: input.commandId, result: row.result, replayed: true };
}

// Runs one change command exactly once (spec 11.2): the business change,
// its audit entries, its outbox rows and the command-log row all commit in
// one transaction, or none of them do.
export async function executeCommand<R>(
  db: Db,
  ctx: CommandContext,
  input: CommandInput,
  run: (t: Db) => Promise<CommandOutcome<R>>
): Promise<CommandResult<R>> {
  const hash = payloadHash(input.commandType, input.payload);
  try {
    return await db.tx(async (t) => {
      const stored = await findStored<R>(t, ctx, input, hash);
      if (stored) return stored;

      const outcome = await run(t);
      await t.query(
        `INSERT INTO command_log
           (command_id, tenant_id, actor_id, deployment_id, command_type, payload_hash, result, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.commandId,
          ctx.tenantId,
          ctx.actorId,
          ctx.deploymentId,
          input.commandType,
          hash,
          JSON.stringify(outcome.result ?? null),
          input.occurredAt,
        ]
      );
      for (const a of outcome.audit) {
        await t.query(
          `INSERT INTO audit_entries
             (id, tenant_id, command_id, actor_id, deployment_id, action, record_type, record_id, change, occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            uuidv7(),
            ctx.tenantId,
            input.commandId,
            ctx.actorId,
            ctx.deploymentId,
            a.action,
            a.recordType,
            a.recordId ?? null,
            JSON.stringify(a.change ?? {}),
            input.occurredAt,
          ]
        );
      }
      for (const o of outcome.outbox ?? []) {
        await t.query(
          `INSERT INTO outbox (id, tenant_id, command_id, aggregate_type, aggregate_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv7(), ctx.tenantId, input.commandId, o.aggregateType, o.aggregateId, JSON.stringify(o.payload)]
        );
      }
      return { commandId: input.commandId, result: outcome.result, replayed: false };
    });
  } catch (err) {
    // Two copies of the same command raced: the other one committed first.
    // Its stored result is the answer (or a conflict if the data differs).
    if (isUniqueViolation(err)) {
      const stored = await findStored<R>(db, ctx, input, hash);
      if (stored) return stored;
    }
    throw err;
  }
}
