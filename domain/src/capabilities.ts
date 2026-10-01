// Capability-based permissions (spec 7). Roles are only convenience
// bundles ("presets"); authorization always checks the capability itself.
// The list grows with each module; it is not the full spec list yet.
export const CAPABILITIES = [
  "tenant.admin",
  "event.manage",
  "inventory.manage",
  "reservation.commit",
  "movement.post",
  "movement.correct",
  "attachment.manage",
  "map.edit",
  "audit.read",
  "report.read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);
}

export const PRESETS = {
  tenant_administrator: [...CAPABILITIES],
  operations_manager: [
    "event.manage",
    "inventory.manage",
    "reservation.commit",
    "movement.post",
    "movement.correct",
    "attachment.manage",
    "map.edit",
    "report.read",
  ],
  inventory_operator: ["movement.post", "attachment.manage"],
  viewer_auditor: ["audit.read", "report.read"],
} as const satisfies Record<string, readonly Capability[]>;

export type PresetName = keyof typeof PRESETS;
