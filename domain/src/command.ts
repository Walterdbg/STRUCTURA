import { z } from "zod";
import { DomainError } from "./errors.js";

// Every change is a command (spec 11.2, integration contract). The tenant,
// actor and deployment are NOT part of the body: the server takes them from
// the signed-in session, so a client can never claim someone else's.
export const commandEnvelope = z.object({
  commandId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  payloadVersion: z.number().int().positive(),
  // Null when creating a record; otherwise the version the user was looking
  // at, so a stale edit is refused instead of silently overwriting.
  expectedVersion: z.number().int().nonnegative().nullable(),
});

export type CommandEnvelope = z.infer<typeof commandEnvelope>;

export function parseCommand<P extends z.ZodTypeAny>(
  payloadSchema: P,
  input: unknown
): CommandEnvelope & { payload: z.infer<P> } {
  const schema = commandEnvelope.extend({ payload: payloadSchema });
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new DomainError("validation", "Invalid command", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data as CommandEnvelope & { payload: z.infer<P> };
}
