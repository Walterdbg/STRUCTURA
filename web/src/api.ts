import { uuidv7, type Capability } from "@structura/domain";

// One place for talking to the server. Every change is sent as a command
// with a fresh command ID; a retry of the same attempt reuses that ID, so a
// double click or a lost response never saves twice (spec 11.2).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly body?: unknown
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "unreachable", "Cannot reach the server");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "internal", data?.message ?? res.statusText, data?.details, data);
  }
  return data as T;
}

export const get = <T>(url: string) => request<T>("GET", url);

export interface CommandResponse<R> {
  commandId: string;
  result: R;
  replayed: boolean;
}

// A pending command keeps its ID until it succeeds or is abandoned.
export function newCommand<P>(payload: P, expectedVersion: number | null = null) {
  return {
    commandId: uuidv7(),
    occurredAt: new Date().toISOString(),
    payloadVersion: 1,
    expectedVersion,
    payload,
  };
}

export type Command<P> = ReturnType<typeof newCommand<P>>;

export const send = <R>(method: "POST" | "PUT", url: string, cmd: Command<unknown>) =>
  request<CommandResponse<R>>(method, url, cmd);

// ---------------------------------------------------------------- shapes
export interface Me {
  user: { id: string; email: string; displayName: string; locale: string };
  tenant: { id: string; name: string; defaultTimezone: string; defaultLocale: string };
  capabilities: Capability[];
}

export interface Member {
  userId: string;
  email: string;
  displayName: string;
  active: boolean;
  capabilities: Capability[];
}

export interface EventRecord {
  id: string;
  designation: string;
  designationStatus: "provisional" | "final";
  responsibleUserId: string;
  responsibleName: string;
  timezone: string;
  location: string | null;
  eventDate: string | null;
  departureDate: string | null;
  expectedReturnDate: string | null;
  closureDate: string | null;
  notes: string | null;
  fulfillmentState: "draft" | "confirmed" | "delivered" | "partial_return" | "closed" | "cancelled";
  version: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export const api = {
  me: () => get<Me>("/api/auth/me"),
  login: (email: string, password: string, tenantId?: string) =>
    request<{ ok: true }>("POST", "/api/auth/login", { email, password, tenantId }),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}),
  members: () => get<{ items: Member[] }>("/api/members"),
  events: (search = "") => get<Page<EventRecord>>(`/api/events?search=${encodeURIComponent(search)}`),
  event: (id: string) => get<EventRecord>(`/api/events/${id}`),
};
