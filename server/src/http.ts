import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { DomainError, parseCommand, type Capability, type CommandEnvelope } from "@structura/domain";
import { requireCapability } from "./auth.js";
import type { CommandContext } from "./commands.js";

export interface ParsedCommand<P> extends CommandEnvelope {
  payload: P;
}

// Reads a command from the request body and builds its context from the
// session, never from the body (integration contract).
export function commandRequest<S extends z.ZodTypeAny>(
  req: FastifyRequest,
  capability: Capability,
  payloadSchema: S,
  deploymentId: string,
  now: Date = new Date()
): { ctx: CommandContext; cmd: ParsedCommand<z.infer<S>> } {
  const auth = requireCapability(req, capability);
  const cmd = parseCommand(payloadSchema, req.body);
  return { ctx: { tenantId: auth.tenantId, actorId: auth.userId, deploymentId, now }, cmd };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A malformed ID gets the same answer as an unknown one.
export function idParam(req: FastifyRequest, name = "id"): string {
  const value = (req.params as Record<string, string | undefined>)[name];
  if (!value || !UUID_RE.test(value)) throw new DomainError("not_found", "Record not found");
  return value;
}

export function paging(req: FastifyRequest): { limit: number; offset: number } {
  const q = req.query as Record<string, string | undefined>;
  const limit = Math.min(Math.max(Number(q.limit ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(q.offset ?? 0) || 0, 0);
  return { limit, offset };
}
