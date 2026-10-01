import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type EngineMode = "cloud" | "local";

export interface Config {
  // One image, two engines (ARCHITECTURE.md section 1).
  engineMode: EngineMode;
  deploymentId: string;
  databaseUrl: string | null;
  host: string;
  port: number;
  appVersion: string;
  webDir: string | null;
  migrationsDir: string;
  // Send the session cookie only over HTTPS. Off by default because the
  // onsite box serves plain HTTP on the event LAN (ARCHITECTURE.md 6).
  cookieSecure: boolean;
  // Managed files (product photos). A Docker volume in production.
  filesDir: string;
  // The server's clock. Tests replace it so "today" is fixed (DEC-019).
  now: () => Date;
  // Place search provider for the Event map (P-016). "none" = off.
  geocoder: "none" | "nominatim";
  // Google Maps Platform key (DEC-026). Server-side only; never sent to browsers.
  googleMapsKey: string | null;
}

const here = path.dirname(fileURLToPath(import.meta.url));

// The version always comes from server/package.json, so the running app can
// never report a different version than the one it was built as.
function readVersion(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf-8"));
  return String(pkg.version);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.ENGINE_MODE ?? "cloud";
  if (mode !== "cloud" && mode !== "local") {
    throw new Error(`ENGINE_MODE must be "cloud" or "local", got "${mode}"`);
  }
  const port = Number(env.PORT ?? "8080");
  if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT: ${env.PORT}`);
  const databaseUrl = env.DATABASE_URL || null;
  if (!databaseUrl && env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  return {
    engineMode: mode,
    deploymentId: env.DEPLOYMENT_ID || `${mode}-dev`,
    databaseUrl,
    host: env.HOST ?? "0.0.0.0",
    port,
    appVersion: readVersion(),
    webDir: env.WEB_DIR ? path.resolve(env.WEB_DIR) : null,
    migrationsDir: path.join(here, "..", "migrations"),
    cookieSecure: env.COOKIE_SECURE === "true",
    filesDir: env.FILES_DIR || path.resolve("data", "files"),
    now: () => new Date(),
    geocoder: env.GEOCODER === "nominatim" ? "nominatim" : "none",
    googleMapsKey: env.GOOGLE_MAPS_KEY?.trim() || null,
  };
}
