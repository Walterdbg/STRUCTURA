import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { command, login, tenant, world, type TestTenant, type TestWorld } from "./session.js";

let w: TestWorld;
let t: TestTenant;
beforeEach(async () => {
  w = await world();
  t = await tenant(w);
});
afterEach(async () => {
  await w.close();
});

const post = (url: string, payload: unknown, cookie = t.cookie, expectedVersion: number | null = null) =>
  w.app.inject({ method: "POST", url, headers: { cookie }, payload: command(payload, { expectedVersion }) });

describe("audit trail (spec 18.2, AT-18)", () => {
  it("records who changed what, when, from which installation, for each command", async () => {
    const ev = (await post("/api/events", { designation: "Provisional", responsibleUserId: t.adminId, timezone: "America/Panama" })).json().result;
    await w.app.inject({
      method: "PUT",
      url: `/api/events/${ev.id}`,
      headers: { cookie: t.cookie },
      payload: command({ designation: "Final", responsibleUserId: t.adminId, timezone: "America/Panama" }, { expectedVersion: 1 }),
    });
    const res = await w.app.inject({ method: "GET", url: `/api/audit?recordType=event&recordId=${ev.id}`, headers: { cookie: t.cookie } });
    expect(res.statusCode).toBe(200);
    const [updated, created] = res.json().items;
    expect(created).toMatchObject({ action: "event.created", deploymentId: "test" });
    expect(created.actorName).toMatch(/^Admin \d+$/);
    expect(updated).toMatchObject({ action: "event.updated", change: { before: { designation: "Provisional" }, after: { designation: "Final" } } });
    expect(updated.commandId).toBeTruthy();
  });

  it("a permission change is audited without the password", async () => {
    await post("/api/members", { email: "a@example.test", displayName: "A", password: "secret-pass-123", preset: "viewer_auditor" });
    const res = await w.app.inject({ method: "GET", url: "/api/audit?recordType=membership", headers: { cookie: t.cookie } });
    expect(res.json().items[0]).toMatchObject({ action: "member.added", change: { capabilities: ["audit.read", "report.read"] } });
    expect(JSON.stringify(res.json())).not.toContain("secret-pass-123");
  });

  it("needs audit.read; an auditor can read, an operator can't", async () => {
    await post("/api/members", { email: "aud@example.test", displayName: "Aud", password: "auditor-pass-1", preset: "viewer_auditor" });
    await post("/api/members", { email: "op@example.test", displayName: "Op", password: "operator-pass-1", preset: "inventory_operator" });
    const auditor = await login(w.app, "aud@example.test", "auditor-pass-1");
    const operator = await login(w.app, "op@example.test", "operator-pass-1");
    expect((await w.app.inject({ method: "GET", url: "/api/audit", headers: { cookie: auditor } })).statusCode).toBe(200);
    expect((await w.app.inject({ method: "GET", url: "/api/audit", headers: { cookie: operator } })).statusCode).toBe(403);
  });

  it("shows only this organization's entries", async () => {
    await post("/api/events", { designation: "Mío", responsibleUserId: t.adminId, timezone: "America/Panama" });
    const other = await tenant(w, "Other");
    const res = await w.app.inject({ method: "GET", url: "/api/audit?recordType=event", headers: { cookie: other.cookie } });
    expect(res.json().items).toEqual([]);
  });
});
