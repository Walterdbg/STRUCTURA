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
    webDir: env.WEB_DIR || null,
    migrationsDir: path.join(here, "..", "migrations"),
  };
}
