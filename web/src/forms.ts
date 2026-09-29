import { useRef } from "react";
import type { ZodTypeAny } from "zod";
import { ApiError, newCommand, send, type Command, type CommandResponse } from "./api.js";
import { errorKey, hasKey, type TextKey } from "./i18n.js";

// Sends a command; if the same payload is sent again (a retry after a lost
// connection), the same command ID is reused so the server applies it once.
// Any change to the payload starts a new command.
export function useCommandSender() {
  const pending = useRef<{ key: string; cmd: Command<unknown> } | null>(null);
  return async function run<R>(
    method: "POST" | "PUT",
    url: string,
    payload: unknown,
    expectedVersion: number | null = null
  ): Promise<CommandResponse<R>> {
    const key = JSON.stringify([method, url, expectedVersion, payload]);
    if (pending.current?.key !== key) pending.current = { key, cmd: newCommand(payload, expectedVersion) };
    try {
      const res = await send<R>(method, url, pending.current.cmd);
      pending.current = null;
      return res;
    } catch (err) {
      // Only an unreachable server leaves the outcome unknown; keep the ID
      // so a retry can't double-apply. Every other answer is final.
      if (!(err instanceof ApiError && err.kind === "unreachable")) pending.current = null;
      throw err;
    }
  };
}

export interface Failure {
  message: TextKey;
  field?: string;
}

// One localized message for a failed request, plus the field it concerns.
export function describeFailure(err: unknown): Failure {
  if (!(err instanceof ApiError)) return { message: "err.internal" };
  const field = typeof err.details?.field === "string" ? err.details.field : undefined;
  if (err.kind === "validation") {
    const issues = err.details?.issues as { path: string }[] | undefined;
    const path = field ?? issues?.[0]?.path.replace(/^payload\.(item\.)?/, "").split(".")[0];
    const key = `err.field.${path}`;
    return { message: path && hasKey(key) ? (key as TextKey) : "err.validation", field: path };
  }
  return { message: errorKey(err.kind), field };
}

// Client-side check with the same rules the server applies; returns the
// first problem per top-level field, as a message key.
export function checkFields(schema: ZodTypeAny, value: unknown, fallback: (field: string) => TextKey): Record<string, TextKey> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return {};
  const out: Record<string, TextKey> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (!out[field]) out[field] = fallback(field);
  }
  return out;
}
