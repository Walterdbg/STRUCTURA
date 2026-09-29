import type { FastifyInstance } from "fastify";
import { requireCapability } from "./auth.js";
import type { Db } from "./db.js";
import { paging } from "./http.js";

// Read-only view of the audit trail (spec 18.2, AT-18). Entries are
// append-only in the database; there is no write path here.
export interface AuditRecord {
  id: string;
  action: string;
  recordType: string;
  recordId: string | null;
  actorName: string | null;
  deploymentId: string;
  commandId: string | null;
  change: unknown;
  occurredAt: string;
  recordedAt: string;
}

const RECORD_TYPES = ["event", "inventory_item", "location", "movement", "membership", "tenant"];

export function auditRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/audit", async (req) => {
    const auth = requireCapability(req, "audit.read");
    const q = req.query as Record<string, string | undefined>;
    const where = ["a.tenant_id = $1"];
    const params: unknown[] = [auth.tenantId];
    if (q.recordType && RECORD_TYPES.includes(q.recordType)) {
      params.push(q.recordType);
      where.push(`a.record_type = $${params.length}`);
    }
    if (q.recordId) {
      // A malformed ID simply matches nothing.
      if (!/^[0-9a-f-]{36}$/i.test(q.recordId)) return { items: [] };
      params.push(q.recordId);
      where.push(`a.record_id = $${params.length}`);
    }
    const { limit, offset } = paging(req);
    params.push(limit, offset);
    const { rows } = await db.query<{
      id: string;
      action: string;
      record_type: string;
      record_id: string | null;
      actor_name: string | null;
      deployment_id: string;
      command_id: string | null;
      change: unknown;
      occurred_at: Date | string;
      recorded_at: Date | string;
    }>(
      `SELECT a.id, a.action, a.record_type, a.record_id, u.display_name AS actor_name, a.deployment_id,
              a.command_id, a.change, a.occurred_at, a.recorded_at
         FROM audit_entries a LEFT JOIN users u ON u.id = a.actor_id
        WHERE ${where.join(" AND ")}
        ORDER BY a.recorded_at DESC, a.id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const iso = (v: Date | string) => new Date(v).toISOString();
    return {
      items: rows.map(
        (r): AuditRecord => ({
          id: r.id,
          action: r.action,
          recordType: r.record_type,
          recordId: r.record_id,
          actorName: r.actor_name,
          deploymentId: r.deployment_id,
          commandId: r.command_id,
          change: r.change,
          occurredAt: iso(r.occurred_at),
          recordedAt: iso(r.recorded_at),
        })
      ),
    };
  });
}
