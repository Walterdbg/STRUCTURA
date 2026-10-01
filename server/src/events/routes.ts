import type { FastifyInstance } from "fastify";
import { dateRulesFields, eventActionFields, eventFields, eventLinesFields } from "@structura/domain";
import { requireAuth } from "../auth.js";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { commandRequest, idParam, paging } from "../http.js";
import { cancelEvent, confirmEvent, getEventLines, setEventLines } from "./reservations.js";
import { createEvent, getDateRules, getEvent, listEvents, setDateRules, updateEvent } from "./service.js";

export function eventRoutes(app: FastifyInstance, db: Db, config: Config): void {
  // Any active member can see the tenant's Events; changing them needs event.manage.
  app.get("/api/events", async (req) => {
    const auth = requireAuth(req);
    const q = req.query as Record<string, string | undefined>;
    return listEvents(db, auth.tenantId, { search: q.search, state: q.state, ...paging(req) }, config.now());
  });

  app.get("/api/events/:id", async (req) => {
    const auth = requireAuth(req);
    return getEvent(db, auth.tenantId, idParam(req), config.now());
  });

  app.post("/api/events", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "event.manage", eventFields, config.deploymentId, config.now());
    const res = await createEvent(db, ctx, cmd);
    return reply.status(res.replayed ? 200 : 201).send(res);
  });

  app.put("/api/events/:id", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "event.manage", eventFields, config.deploymentId, config.now());
    return updateEvent(db, ctx, id, cmd);
  });

  // The organization's date rules (DEC-028): everyone sees them, the
  // administrator changes them.
  app.get("/api/settings/date-rules", async (req) => {
    const auth = requireAuth(req);
    return getDateRules(db, auth.tenantId);
  });

  app.put("/api/settings/date-rules", async (req) => {
    const { ctx, cmd } = commandRequest(req, "tenant.admin", dateRulesFields, config.deploymentId, config.now());
    return setDateRules(db, ctx, cmd);
  });

  // Products the Event asks for, each with its availability check.
  app.get("/api/events/:id/lines", async (req) => {
    const auth = requireAuth(req);
    return { items: await getEventLines(db, auth.tenantId, idParam(req), config.now()) };
  });

  app.put("/api/events/:id/lines", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "event.manage", eventLinesFields, config.deploymentId, config.now());
    return setEventLines(db, ctx, id, cmd);
  });

  app.post("/api/events/:id/confirm", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "reservation.commit", eventActionFields, config.deploymentId, config.now());
    return confirmEvent(db, ctx, id, cmd);
  });

  app.post("/api/events/:id/cancel", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "event.manage", eventActionFields, config.deploymentId, config.now());
    return cancelEvent(db, ctx, id, cmd);
  });
}
