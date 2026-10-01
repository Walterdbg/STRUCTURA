import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TEST_PASSWORD, command, login, tenant, world, type TestTenant, type TestWorld } from "./session.js";

let w: TestWorld;
let t: TestTenant;
beforeEach(async () => {
  w = await world();
  t = await tenant(w);
});
afterEach(async () => {
  await w.close();
});

const call = (method: "POST" | "PUT", url: string, payload: unknown, cookie = t.cookie) =>
  w.app.inject({ method, url, headers: { cookie }, payload: command(payload) });
const me = (cookie = t.cookie) => w.app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });

describe("my account (D-009)", () => {
  it("changes my own name and language; the language comes back at sign-in", async () => {
    const res = await call("PUT", "/api/me", { displayName: "Walter", locale: "en" });
    expect(res.statusCode).toBe(200);
    expect((await me()).json().user).toMatchObject({ displayName: "Walter", locale: "en" });
  });

  it("changes my password only with the current one, and signs out my other sessions", async () => {
    const other = await login(w.app, t.adminEmail);
    const wrong = await call("POST", "/api/me/password", { currentPassword: "nope", newPassword: "a-new-password-1" });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().details.field).toBe("currentPassword");

    const ok = await call("POST", "/api/me/password", { currentPassword: TEST_PASSWORD, newPassword: "a-new-password-1" });
    expect(ok.statusCode).toBe(200);
    expect((await me()).statusCode).toBe(200); // this session stays
    expect((await me(other)).statusCode).toBe(401); // the other one ended
    await expect(login(w.app, t.adminEmail)).rejects.toThrow();
    await login(w.app, t.adminEmail, "a-new-password-1");
  });

  it("no password ends up in the command log or audit", async () => {
    await call("POST", "/api/me/password", { currentPassword: TEST_PASSWORD, newPassword: "a-new-password-1" });
    const dump = await w.db.query<{ t: string }>(
      "SELECT coalesce((SELECT string_agg(change::text, ' ') FROM audit_entries), '') || coalesce((SELECT string_agg(result::text, ' ') FROM command_log), '') AS t"
    );
    expect(dump.rows[0]!.t).not.toContain("a-new-password-1");
    expect(dump.rows[0]!.t).not.toContain(TEST_PASSWORD);
  });
});

describe("administrator user controls (D-009)", () => {
  async function addOperator() {
    const res = await call("POST", "/api/members", { email: "op@example.test", displayName: "Op", password: "operator-pass-1", preset: "inventory_operator" });
    return res.json().result.userId as string;
  }

  it("resets a forgotten password; the person's sessions end", async () => {
    const id = await addOperator();
    const opCookie = await login(w.app, "op@example.test", "operator-pass-1");
    expect((await call("POST", `/api/members/${id}/password`, { newPassword: "reset-pass-123" })).statusCode).toBe(200);
    expect((await me(opCookie)).statusCode).toBe(401);
    await login(w.app, "op@example.test", "reset-pass-123");
  });

  it("switches a user off: they can't sign in, but their name stays in the history", async () => {
    const id = await addOperator();
    const opCookie = await login(w.app, "op@example.test", "operator-pass-1");
    const res = await call("PUT", `/api/members/${id}`, { active: false });
    expect(res.statusCode).toBe(200);
    expect((await me(opCookie)).statusCode).toBe(401);
    await expect(login(w.app, "op@example.test", "operator-pass-1")).rejects.toThrow();
    const list = await w.app.inject({ method: "GET", url: "/api/members", headers: { cookie: t.cookie } });
    expect(list.json().items.find((m: { userId: string }) => m.userId === id)).toMatchObject({ displayName: "Op", active: false });
  });

  it("changes a user's profile", async () => {
    const id = await addOperator();
    const res = await call("PUT", `/api/members/${id}`, { active: true, preset: "operations_manager" });
    expect(res.json().result.capabilities).toContain("event.manage");
  });

  it("refuses to remove the last active administrator", async () => {
    const res = await call("PUT", `/api/members/${t.adminId}`, { active: false });
    expect(res.statusCode).toBe(409);
    expect(res.json().details.reason).toBe("last_admin");
  });

  it("only administrators can do this", async () => {
    const id = await addOperator();
    const opCookie = await login(w.app, "op@example.test", "operator-pass-1");
    expect((await call("POST", `/api/members/${id}/password`, { newPassword: "hijack-pass-1" }, opCookie)).statusCode).toBe(403);
  });
});
