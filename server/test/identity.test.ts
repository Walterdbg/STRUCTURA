import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth.js";
import { TEST_PASSWORD, command, login, tenant, world, type TestWorld } from "./session.js";

let w: TestWorld;
beforeEach(async () => {
  w = await world();
});
afterEach(async () => {
  await w.close();
});

describe("passwords", () => {
  it("hash and verify; short passwords are refused", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    await expect(hashPassword("short")).rejects.toMatchObject({ kind: "validation" });
  });
});

describe("sign-in (DEC-013)", () => {
  it("signs in, shows who I am, and signs out", async () => {
    const t = await tenant(w, "27TS Test");
    const me = await w.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: t.cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ tenant: { name: "27TS Test", defaultTimezone: "America/Panama" } });
    expect(me.json().capabilities).toContain("event.manage");

    const out = await w.app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: t.cookie } });
    expect(out.statusCode).toBe(200);
    const after = await w.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: t.cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const t = await tenant(w);
    const wrong = await w.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: t.adminEmail, password: "not-the-password" },
    });
    const unknown = await w.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.test", password: "not-the-password" },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().message).toBe(unknown.json().message);
  });

  it("blocks sign-in after 5 failures for 15 minutes", async () => {
    const t = await tenant(w);
    for (let i = 0; i < 5; i++) {
      await w.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: t.adminEmail, password: "bad-password" } });
    }
    const blocked = await w.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: t.adminEmail, password: TEST_PASSWORD },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().details.reason).toBe("throttled");
  });

  it("the session cookie is HttpOnly and SameSite=Strict", async () => {
    const t = await tenant(w);
    const res = await w.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: t.adminEmail, password: TEST_PASSWORD },
    });
    const c = res.cookies.find((x) => x.name === "structura_session")!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Strict");
  });

  it("API calls without a session are refused", async () => {
    const res = await w.app.inject({ method: "GET", url: "/api/events" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("unauthenticated");
  });
});

describe("members and permissions (spec 7)", () => {
  it("an administrator adds a member with a preset; the password never reaches the audit or command log", async () => {
    const t = await tenant(w);
    const res = await w.app.inject({
      method: "POST",
      url: "/api/members",
      headers: { cookie: t.cookie },
      payload: command({
        email: "Operator@Example.test",
        displayName: "Operadora",
        password: "operator-password-1",
        preset: "inventory_operator",
      }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().result.capabilities).toEqual(["movement.post", "attachment.manage"]);

    const logs = await w.db.query<{ t: string }>(
      "SELECT (SELECT string_agg(change::text, ' ') FROM audit_entries) || (SELECT string_agg(result::text, ' ') FROM command_log) AS t"
    );
    expect(logs.rows[0]!.t).not.toContain("operator-password-1");

    // The new member can sign in (email is case-insensitive) but cannot manage events.
    const cookie = await login(w.app, "operator@example.test", "operator-password-1");
    const create = await w.app.inject({
      method: "POST",
      url: "/api/events",
      headers: { cookie },
      payload: command({ designation: "X", responsibleUserId: t.adminId, timezone: "America/Panama" }),
    });
    expect(create.statusCode).toBe(403);
    expect(create.json()).toMatchObject({ error: "permission_denied", details: { capability: "event.manage" } });
  });

  it("only administrators can add members", async () => {
    const t = await tenant(w);
    await w.app.inject({
      method: "POST",
      url: "/api/members",
      headers: { cookie: t.cookie },
      payload: command({ email: "v@example.test", displayName: "V", password: "viewer-password-1", preset: "viewer_auditor" }),
    });
    const cookie = await login(w.app, "v@example.test", "viewer-password-1");
    const res = await w.app.inject({
      method: "POST",
      url: "/api/members",
      headers: { cookie },
      payload: command({ email: "x@example.test", displayName: "X", password: "some-password-1" }),
    });
    expect(res.statusCode).toBe(403);
  });
});
