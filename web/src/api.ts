import type { FeatureProps } from "@structura/domain";
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
  user: { id: string; email: string; displayName: string; locale: string; platformAdmin?: boolean };
  tenant: { id: string; name: string; defaultTimezone: string; defaultLocale: string; features: string[] };
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
  eventType: "rental" | "race";
  responsibleUserId: string;
  responsibleName: string;
  timezone: string;
  location: string | null;
  locationLat: number | null;
  locationLng: number | null;
  eventDate: string | null;
  departureDate: string | null;
  expectedReturnDate: string | null;
  closureDate: string | null;
  notes: string | null;
  fulfillmentState: "draft" | "confirmed" | "delivered" | "partial_return" | "closed" | "cancelled";
  equipmentOut: boolean;
  returnAlert: "ended_out" | "overdue" | null;
  version: number;
}

export interface MapFeature {
  id: string;
  kind: "point" | "area" | "route";
  category: string;
  label: string;
  notes: string | null;
  geometry: { type: "Point" | "Polygon" | "LineString"; coordinates: any };
  preferred: boolean;
  source: string | null;
  props: FeatureProps;
  lengthMeters: number | null;
  totalMeters: number | null;
  version: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface LocationRecord {
  id: string;
  designation: string;
  kind: "warehouse" | "event" | "repair" | "other";
  notes: string | null;
  active: boolean;
  version: number;
}

export interface ItemRecord {
  id: string;
  name: string;
  internalReference: string | null;
  barcode: string | null;
  responsible: string | null;
  categoryPath: string | null;
  productType: "rentable" | "consumable" | "spare_part";
  unit: string;
  quantityDecimals: number;
  salesPrice: string | null;
  priceCurrency: string | null;
  brand: string | null;
  model: string | null;
  baseLocationId: string | null;
  notes: string | null;
  active: boolean;
  photo: { attachmentId: string; state: string } | null;
  stock: { total: string; atEvents: string; inRepair: string; inWarehouse: string; other: string };
  version: number;
}

export interface PositionRecord {
  locationId: string;
  designation: string;
  kind: LocationRecord["kind"];
  quantity: string;
}

export interface MovementRecord {
  id: string;
  reason: string;
  sourceLocationId: string | null;
  sourceName: string | null;
  destinationLocationId: string | null;
  destinationName: string | null;
  occurredAt: string;
  actorName: string | null;
  eventId: string | null;
  eventDesignation: string | null;
  correctsMovementId: string | null;
  correctedByMovementId: string | null;
  note: string | null;
  lines: { itemId: string; itemName: string; quantity: string; unit: string }[];
}

// Photo upload: raw image body, command envelope in headers.
export async function uploadPhoto(itemId: string, file: Blob, filename: string, expectedVersion: number, commandId: string) {
  let res: Response;
  try {
    res = await fetch(`/api/items/${itemId}/photo`, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-command-id": commandId,
        "x-occurred-at": new Date().toISOString(),
        "x-expected-version": String(expectedVersion),
        "x-filename": encodeURIComponent(filename),
      },
      body: file,
    });
  } catch {
    throw new ApiError(0, "unreachable", "Cannot reach the server");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? (res.status === 415 ? "validation" : "internal"), data?.message ?? "", data?.details);
  return data as CommandResponse<ItemRecord>;
}

export const photoUrl = (attachmentId: string) => `/api/attachments/${attachmentId}/content`;

export const api = {
  me: () => get<Me>("/api/auth/me"),
  locations: () => get<{ items: LocationRecord[] }>("/api/locations"),
  items: (search = "", inactive = false) =>
    get<Page<ItemRecord>>(`/api/items?search=${encodeURIComponent(search)}&inactive=${inactive}&limit=200`),
  item: (id: string) => get<{ item: ItemRecord; positions: PositionRecord[] }>(`/api/items/${id}`),
  movements: (filter: { itemId?: string; locationId?: string } = {}) =>
    get<Page<MovementRecord>>(
      `/api/movements?limit=100${filter.itemId ? `&itemId=${filter.itemId}` : ""}${filter.locationId ? `&locationId=${filter.locationId}` : ""}`
    ),
  login: (email: string, password: string, tenantId?: string) =>
    request<{ ok: true }>("POST", "/api/auth/login", { email, password, tenantId }),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}),
  members: () => get<{ items: Member[] }>("/api/members"),
  events: (search = "") => get<Page<EventRecord>>(`/api/events?search=${encodeURIComponent(search)}`),
  event: (id: string) => get<EventRecord>(`/api/events/${id}`),
};
