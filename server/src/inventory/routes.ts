import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { DomainError, correctionFields, itemFields, locationFields, movementFields, newItemFields } from "@structura/domain";
import { requireAuth, requireCapability } from "../auth.js";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { commandRequest, idParam, paging } from "../http.js";
import { MAX_PHOTO_BYTES, sniffImage, type FileStore } from "../storage.js";
import { getMovement, listMovements } from "./ledger.js";
import {
  correctMovement,
  createItem,
  createLocation,
  createMovement,
  getItem,
  itemPositions,
  listItems,
  listLocations,
  readAttachment,
  removeItemPhoto,
  setItemPhoto,
  updateItem,
  updateLocation,
} from "./service.js";

const created = <T extends { replayed: boolean }>(res: T) => (res.replayed ? 200 : 201);

// Photo uploads send the raw image as the body; the command envelope
// travels in headers so the bytes don't need base64 or multipart.
const photoHeaders = z.object({
  "x-command-id": z.string().uuid(),
  "x-occurred-at": z.string().datetime({ offset: true }),
  "x-expected-version": z.coerce.number().int().nonnegative(),
  "x-filename": z.string().max(300).optional(),
});

export function inventoryRoutes(app: FastifyInstance, db: Db, config: Config, store: FileStore): void {
  // ---------------------------------------------------------------- locations
  app.get("/api/locations", async (req) => ({ items: await listLocations(db, requireAuth(req).tenantId) }));

  app.post("/api/locations", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "inventory.manage", locationFields, config.deploymentId);
    const res = await createLocation(db, ctx, cmd);
    return reply.status(created(res)).send(res);
  });

  app.put("/api/locations/:id", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "inventory.manage", locationFields, config.deploymentId);
    return updateLocation(db, ctx, id, cmd);
  });

  // ---------------------------------------------------------------- items
  app.get("/api/items", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return listItems(db, requireAuth(req).tenantId, { search: q.search, includeInactive: q.inactive === "true", ...paging(req) });
  });

  app.get("/api/items/:id", async (req) => {
    const auth = requireAuth(req);
    const id = idParam(req);
    return { item: await getItem(db, auth.tenantId, id), positions: await itemPositions(db, auth.tenantId, id) };
  });

  app.post("/api/items", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "inventory.manage", newItemFields, config.deploymentId);
    const res = await createItem(db, ctx, cmd);
    return reply.status(created(res)).send(res);
  });

  app.put("/api/items/:id", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "inventory.manage", itemFields, config.deploymentId);
    return updateItem(db, ctx, id, cmd);
  });

  // ---------------------------------------------------------------- photos
  app.addContentTypeParser(
    ["image/jpeg", "image/png", "image/webp"],
    { parseAs: "buffer", bodyLimit: MAX_PHOTO_BYTES },
    (_req, body, done) => done(null, body)
  );

  app.put("/api/items/:id/photo", { bodyLimit: MAX_PHOTO_BYTES }, async (req) => {
    const auth = requireCapability(req, "inventory.manage");
    const id = idParam(req);
    const h = photoHeaders.safeParse(req.headers);
    if (!h.success) throw new DomainError("validation", "Missing command headers for the photo upload");
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new DomainError("validation", "No image received");
    const contentType = sniffImage(bytes);
    if (!contentType) {
      throw new DomainError("validation", "Only JPEG, PNG or WebP images are accepted", { field: "photo" });
    }
    return setItemPhoto(db, store, { tenantId: auth.tenantId, actorId: auth.userId, deploymentId: config.deploymentId }, id, {
      commandId: h.data["x-command-id"],
      occurredAt: h.data["x-occurred-at"],
      expectedVersion: h.data["x-expected-version"],
      filename: decodeURIComponent(h.data["x-filename"] ?? "photo"),
      contentType,
      bytes,
    });
  });

  app.post("/api/items/:id/photo/remove", async (req) => {
    const id = idParam(req);
    const { ctx, cmd } = commandRequest(req, "inventory.manage", z.object({}).passthrough(), config.deploymentId);
    return removeItemPhoto(db, ctx, id, cmd);
  });

  app.get("/api/attachments/:id/content", async (req, reply) => {
    const auth = requireAuth(req);
    const file = await readAttachment(db, store, auth.tenantId, idParam(req));
    return reply
      .header("content-type", file.content_type)
      .header("cache-control", "private, max-age=31536000, immutable")
      .header("x-content-type-options", "nosniff")
      .header("content-disposition", `inline; filename="${encodeURIComponent(file.filename)}"`)
      .header("etag", `"${file.sha256}"`)
      .send(file.bytes);
  });

  // ---------------------------------------------------------------- movements
  app.get("/api/movements", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const uuid = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    return listMovements(db, requireAuth(req).tenantId, {
      itemId: uuid(q.itemId),
      locationId: uuid(q.locationId),
      eventId: uuid(q.eventId),
      ...paging(req),
    });
  });

  app.get("/api/movements/:id", async (req) => getMovement(db, requireAuth(req).tenantId, idParam(req)));

  app.post("/api/movements", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "movement.post", movementFields, config.deploymentId);
    const res = await createMovement(db, ctx, cmd);
    return reply.status(created(res)).send(res);
  });

  app.post("/api/movements/corrections", async (req, reply) => {
    const { ctx, cmd } = commandRequest(req, "movement.correct", correctionFields, config.deploymentId);
    const res = await correctMovement(db, ctx, cmd);
    return reply.status(created(res)).send(res);
  });
}
