import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DomainError } from "@structura/domain";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db.js";
import { freshDb, testConfig } from "./helpers.js";

let db: Db | null = null;
afterEach(async () => {
  await db?.close();
  db = null;
});

describe("GET /api/health", () => {
  it("reports version, engine mode and database", async () => {
    db = await freshDb();
    const app = await buildApp({ db, config: testConfig(), logger: false });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
    expect(res.json()).toMatchObject({
      app: "STRUCTURA",
      status: "ok",
      version: pkg.version,
      engineMode: "cloud",
      deploymentId: "test",
      database: "ok",
    });
  });

  it("returns 503 when the database is unreachable", async () => {
    db = await freshDb();
    const broken: Db = { ...db, query: async () => Promise.reject(new Error("down")) };
    const app = await buildApp({ db: broken, config: testConfig(), logger: false });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json().database).toBe("unavailable");
  });
});

describe("errors", () => {
  it("each domain error kind keeps its own status and name", async () => {
    db = await freshDb();
    const app = await buildApp({ db, config: testConfig(), logger: false });
    app.get("/api/test/stale", async () => {
      throw new DomainError("stale_version", "Someone else changed this record");
    });
    const res = await app.inject({ method: "GET", url: "/api/test/stale" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: "stale_version" });
  });

  it("unexpected errors do not leak their message", async () => {
    db = await freshDb();
    const app = await buildApp({ db, config: testConfig(), logger: false });
    app.get("/api/test/boom", async () => {
      throw new Error("secret internal detail");
    });
    const res = await app.inject({ method: "GET", url: "/api/test/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret");
  });
});

describe("web app serving", () => {
  it("serves index.html for screen paths but 404s unknown API paths", async () => {
    db = await freshDb();
    const webDir = fs.mkdtempSync(path.join(os.tmpdir(), "structura-web-"));
    fs.writeFileSync(path.join(webDir, "index.html"), "<!doctype html><title>STRUCTURA</title>");
    const app = await buildApp({ db, config: testConfig({ webDir }), logger: false });
    const page = await app.inject({ method: "GET", url: "/events/123" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("STRUCTURA");
    const api = await app.inject({ method: "GET", url: "/api/nope" });
    expect(api.statusCode).toBe(404);
    expect(api.json().error).toBe("not_found");
  });
});

describe("config", () => {
  it("refuses an unknown engine mode", () => {
    expect(() => loadConfig({ ENGINE_MODE: "hybrid" })).toThrow(/ENGINE_MODE/);
  });

  it("requires a database in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it("accepts local mode", () => {
    expect(loadConfig({ ENGINE_MODE: "local", DEPLOYMENT_ID: "onsite-01" })).toMatchObject({
      engineMode: "local",
      deploymentId: "onsite-01",
    });
  });
});
