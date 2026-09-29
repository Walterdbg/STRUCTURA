import type { FastifyInstance } from "fastify";
import { eventFields } from "@structura/domain";
import { requireAuth } from "../auth.js";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { commandRequest, idParam, paging } from "../http.js";
import { createEvent, getEvent, listEvents, updateEvent } from "./service.js";

export function eventRoutes(app: FastifyInstance, db: Db, config: Config): void {
  // Any active member can see the tenant's Events; changing them needs event.manage.
  app.get("/api/events", async (req) => {
    const auth = requireAuth(req);
    const q = req.query as Record<string, string | undefined>;
    return listEvents(db, auth.tenantId, { search: q.search, state: q.state, ...paging(req) });
  });

  app.get("/api/events/:id", async (req) => {
    const auth = requireAuth(req);
    return getEvent(db, auth.tenantId, idParam(req));
  });

  app.post("/api/events", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "event.manage", eventFields, config.deploymentId);
    const res = await createEvent(db, ctx, cmd);
    return reply.status(res.replayed ? 200 : 201).send(res);
  });

  app.put("/api/events/:id", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "event.manage", eventFields, config.deploymentId);
    return updateEvent(db, ctx, id, cmd);
  });
}
