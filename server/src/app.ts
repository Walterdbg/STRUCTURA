import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { isDomainError, type ErrorKind } from "@structura/domain";
import { auditRoutes } from "./audit.js";
import { SESSION_COOKIE, loadSession } from "./auth.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { mapRoutes } from "./events/maps.js";
import { eventRoutes } from "./events/routes.js";
import { geoRoutes } from "./geo.js";
import { identityRoutes } from "./identity/routes.js";
import { inventoryRoutes } from "./inventory/routes.js";
import { filesystemStore, type FileStore } from "./storage.js";

// Each error kind keeps its own HTTP status, so a client never mistakes a
// refused command for a saved one (spec 18.1).
const STATUS: Record<ErrorKind, number> = {
  validation: 400,
  permission_denied: 403,
  license_restricted: 403,
  stale_version: 409,
  insufficient_availability: 409,
  idempotency_conflict: 409,
  schema_incompatible: 409,
  invalid_state: 409,
  not_found: 404,
  unauthenticated: 401,
  missing_evidence: 422,
  provider_failure: 502,
};

export interface AppOptions {
  db: Db;
  config: Config;
  logger?: boolean;
  store?: FileStore;
}

export async function buildApp({ db, config, logger = true, store }: AppOptions): Promise<FastifyInstance> {
  const files = store ?? filesystemStore(config.filesDir);
  const app = Fastify({ logger });

  app.setErrorHandler((err, req, reply) => {
    if (isDomainError(err)) {
      return reply.status(STATUS[err.kind]).send({ error: err.kind, message: err.message, details: err.details });
    }
    // Fastify's own request errors (bad JSON, too large) keep their 4xx code.
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({ error: "validation", message: (err as Error).message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: "internal", message: "Unexpected server error" });
  });

  // Every API request resolves its session first; routes then decide what
  // the signed-in person may do (requireAuth / requireCapability).
  await app.register(fastifyCookie);
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (req) => {
    req.auth = req.url.startsWith("/api/") ? await loadSession(db, req.cookies[SESSION_COOKIE]) : null;
  });

  identityRoutes(app, db, config);
  eventRoutes(app, db, config);
  mapRoutes(app, db, config);
  inventoryRoutes(app, db, config, files);
  auditRoutes(app, db);
  geoRoutes(app, db, config);

  app.get("/api/health", async (_req, reply) => {
    let database: "ok" | "unavailable" = "ok";
    try {
      await db.query("SELECT 1");
    } catch {
      database = "unavailable";
    }
    return reply.status(database === "ok" ? 200 : 503).send({
      app: "STRUCTURA",
      status: database === "ok" ? "ok" : "degraded",
      version: config.appVersion,
      engineMode: config.engineMode,
      deploymentId: config.deploymentId,
      database,
    });
  });

  // The built web app, with every non-API path falling back to index.html.
  if (config.webDir && fs.existsSync(path.join(config.webDir, "index.html"))) {
    await app.register(fastifyStatic, { root: config.webDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "not_found", message: "Unknown API path" });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}
