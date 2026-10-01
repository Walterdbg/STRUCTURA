import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { decodePolyline, encodePolyline } from "../src/polyline.js";
import { freshDb, testConfig } from "./helpers.js";
import { login, TEST_PASSWORD, type TestWorld } from "./session.js";
import { bootstrapTenant } from "../src/identity/service.js";

describe("Google polyline format", () => {
  it("decodes Google's documented example and round-trips", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
    expect(encodePolyline(pts)).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });
});

// A stand-in for Google: answers each API like the real one would.
function fakeGoogle() {
  const calls: { url: string; body?: unknown; headers: Record<string, string> }[] = [];
  const fake = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("places:autocomplete")) return json({ suggestions: [{ placePrediction: { placeId: "ChIJ-palmas-bellas-01", text: { text: "PH Palmas Bellas, Panamá" } } }] });
    if (url.includes("places.googleapis.com/v1/places/")) return json({ displayName: { text: "PH Palmas Bellas" }, formattedAddress: "Panamá", location: { latitude: 9.007344, longitude: -79.50703 } });
    if (url.includes("createSession")) return json({ session: "sess-1", expiry: String(Math.floor(Date.now() / 1000) + 14 * 86400) });
    if (url.includes("static-basemap-tiles-service")) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]), { status: 200, headers: { "content-type": "image/png" } });
    if (url.includes("/2dtiles/")) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { "content-type": "image/png" } });
    if (url.includes("/tile/v1/viewport")) return json({ copyright: "Map data ©2026 Google" });
    if (url.includes("computeRoutes") && String(init?.body).includes("TWO_WHEELER") && String(init?.body).includes("-79.9")) return json({});
    if (url.includes("computeRoutes")) return json({ routes: [{ distanceMeters: 1234, polyline: { encodedPolyline: encodePolyline([[-79.5, 9.0], [-79.505, 9.002], [-79.51, 9.004]]) } }] });
    if (url.includes("elevation/json")) {
      const enc = decodeURIComponent(url.split("locations=enc:")[1]!.split("&")[0]!);
      return json({ status: "OK", results: decodePolyline(enc).map((_, i) => ({ elevation: 10 + i })) });
    }
    return new Response("not found", { status: 404 });
  });
  return { fake, calls };
}

let w: TestWorld | null = null;
afterEach(async () => {
  vi.unstubAllGlobals();
  await w?.close();
  w = null;
});

async function setup(googleMapsKey: string | null, features: string[] = ["courses"], arcgisKey: string | null = null) {
  const db = await freshDb();
  const app = await buildApp({ db, config: testConfig({ googleMapsKey, arcgisKey }), logger: false });
  w = { db, app, close: async () => (await app.close(), await db.close()) };
  const { tenantId } = await bootstrapTenant(db, { tenantName: "Geo", timezone: "America/Panama", adminEmail: "geo@example.test", adminName: "Geo", adminPassword: TEST_PASSWORD });
  await db.query("UPDATE tenants SET features = $2 WHERE id = $1", [tenantId, features]);
  return { cookie: await login(app, "geo@example.test"), app };
}

describe("map services through our server, with Google (DEC-026)", () => {
  it("reports Google, satellite, routing and elevation as available", async () => {
    const { app, cookie } = await setup("test-key");
    const res = await app.inject({ method: "GET", url: "/api/geo/status", headers: { cookie } });
    expect(res.json()).toEqual({ provider: "google", search: true, tiles: "google", satellite: true, routing: true, elevation: true, arcgis: false });
  });

  it("finds a building, then its exact position; the key never reaches the browser", async () => {
    const { fake, calls } = fakeGoogle();
    vi.stubGlobal("fetch", fake);
    const { app, cookie } = await setup("test-key");
    const s = await app.inject({ method: "GET", url: "/api/geo/search?q=PH%20Palmas%20Bellas&lang=es&session=abc12345&near=-79.6,9.1,-79.4,8.9", headers: { cookie } });
    expect(s.json().items).toEqual([{ name: "PH Palmas Bellas, Panamá", placeId: "ChIJ-palmas-bellas-01" }]);
    expect(s.body).not.toContain("test-key");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("test-key");
    expect(calls[0]!.body).toMatchObject({ input: "PH Palmas Bellas", sessionToken: "abc12345", locationBias: { rectangle: { low: { latitude: 8.9 } } } });
    const p = await app.inject({ method: "GET", url: "/api/geo/place/ChIJ-palmas-bellas-01?session=abc12345", headers: { cookie } });
    expect(p.json()).toMatchObject({ lat: 9.007344, lng: -79.50703 });
  });

  it("serves Google map pictures (streets and satellite) and their copyright through our server", async () => {
    const { fake } = fakeGoogle();
    vi.stubGlobal("fetch", fake);
    const { app, cookie } = await setup("test-key");
    const tile = await app.inject({ method: "GET", url: "/api/geo/tiles/satellite/15/9000/15000", headers: { cookie } });
    expect(tile.statusCode).toBe(200);
    expect(tile.headers["content-type"]).toBe("image/png");
    const attr = await app.inject({ method: "GET", url: "/api/geo/attribution?type=satellite&zoom=15&north=9.1&south=9&east=-79.4&west=-79.6", headers: { cookie } });
    expect(attr.json().copyright).toContain("Google");
  });

  it("follows the streets between clicked points (any organization)", async () => {
    const { fake, calls } = fakeGoogle();
    vi.stubGlobal("fetch", fake);
    const { app, cookie } = await setup("test-key", []);
    const res = await app.inject({ method: "POST", url: "/api/geo/route", headers: { cookie }, payload: { mode: "drive", waypoints: [[-79.5, 9.0], [-79.51, 9.004]] } });
    expect(res.statusCode).toBe(200);
    expect(res.json().coordinates).toHaveLength(3);
    expect(calls.find((c) => c.url.includes("computeRoutes"))!.body).toMatchObject({ travelMode: "DRIVE" });
  });

  it("serves ArcGIS Topo, Streets and Imagery pictures through our server when its key is set (B-005)", async () => {
    const { fake, calls } = fakeGoogle();
    vi.stubGlobal("fetch", fake);
    const { app, cookie } = await setup("test-key", [], "arcgis-key");
    expect((await app.inject({ method: "GET", url: "/api/geo/status", headers: { cookie } })).json().arcgis).toBe(true);
    for (const style of ["topo", "streets", "imagery"]) {
      const res = await app.inject({ method: "GET", url: `/api/geo/arcgis/${style}/14/7845/4669`, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("image/png");
    }
    const call = calls.find((c) => c.url.includes("arcgis/outdoor"))!;
    expect(call.url).toContain("/static/tile/14/7845/4669");
    expect(call.url).not.toContain("arcgis-key"); // the key goes in a header, never in the address
    expect(call.headers.Authorization).toBe("Bearer arcgis-key");
    expect((await app.inject({ method: "GET", url: "/api/geo/arcgis/bing/1/0/0", headers: { cookie } })).statusCode).toBe(400);
  });

  it("hides ArcGIS without its key", async () => {
    const { app, cookie } = await setup("test-key", []);
    expect((await app.inject({ method: "GET", url: "/api/geo/status", headers: { cookie } })).json().arcgis).toBe(false);
    expect((await app.inject({ method: "GET", url: "/api/geo/arcgis/topo/1/0/0", headers: { cookie } })).statusCode).not.toBe(200);
  });

  it("routes by motorcycle for deliveries; where Google has no motorcycle path, the car path is used and said", async () => {
    const { fake, calls } = fakeGoogle();
    vi.stubGlobal("fetch", fake);
    const { app, cookie } = await setup("test-key", []);
    const moto = await app.inject({ method: "POST", url: "/api/geo/route", headers: { cookie }, payload: { mode: "motorcycle", waypoints: [[-79.5, 9.0], [-79.51, 9.004]] } });
    expect(moto.statusCode).toBe(200);
    expect(moto.json().fallback).toBeUndefined();
    expect(calls.filter((c) => c.url.includes("computeRoutes")).pop()!.body).toMatchObject({ travelMode: "TWO_WHEELER" });
    const none = await app.inject({ method: "POST", url: "/api/geo/route", headers: { cookie }, payload: { mode: "motorcycle", waypoints: [[-79.9, 9.0], [-79.91, 9.004]] } });
    expect(none.statusCode).toBe(200);
    expect(none.json().fallback).toBe("drive");
    expect(calls.filter((c) => c.url.includes("computeRoutes")).pop()!.body).toMatchObject({ travelMode: "DRIVE" });
  });

  it("routes on foot and by bike too (DEC-030 tools)", async () => {
    const { fake, calls } = fakeGoogle();
    vi.stubGlobal("fetch", fake);
    const { app, cookie } = await setup("test-key", []);
    for (const [mode, travel] of [["walk", "WALK"], ["bike", "BICYCLE"]] as const) {
      const res = await app.inject({ method: "POST", url: "/api/geo/route", headers: { cookie }, payload: { mode, waypoints: [[-79.5, 9.0], [-79.51, 9.004]] } });
      expect(res.statusCode).toBe(200);
      expect(calls.filter((c) => c.url.includes("computeRoutes")).pop()!.body).toMatchObject({ travelMode: travel });
    }
  });

  it("adds heights to a drawn course in batches; needs the courses add-on", async () => {
    const { fake } = fakeGoogle();
    vi.stubGlobal("fetch", fake);
    const { app, cookie } = await setup("test-key");
    const coords = Array.from({ length: 300 }, (_, i) => [-79.5 + i * 0.0001, 9.0]);
    const res = await app.inject({ method: "POST", url: "/api/geo/elevation", headers: { cookie }, payload: { coordinates: coords } });
    expect(res.statusCode).toBe(200);
    const out = res.json().coordinates as number[][];
    expect(out).toHaveLength(300);
    expect(out[0]![2]).toBe(10);
    expect(out[256]![2]).toBe(10); // second batch starts again
  });

  it("refuses elevation without the add-on", async () => {
    vi.stubGlobal("fetch", fakeGoogle().fake);
    const { app, cookie } = await setup("test-key", []);
    const res = await app.inject({ method: "POST", url: "/api/geo/elevation", headers: { cookie }, payload: { coordinates: [[-79.5, 9], [-79.51, 9]] } });
    expect(res.statusCode).toBe(403);
  });
});

describe("without a Google key: OpenStreetMap fallback", () => {
  it("reports OpenStreetMap pictures and no routing; routing says it needs the key", async () => {
    const { app, cookie } = await setup(null);
    const st = await app.inject({ method: "GET", url: "/api/geo/status", headers: { cookie } });
    expect(st.json()).toMatchObject({ tiles: "osm", satellite: false, routing: false, elevation: false });
    const r = await app.inject({ method: "POST", url: "/api/geo/route", headers: { cookie }, payload: { mode: "walk", waypoints: [[-79.5, 9], [-79.51, 9]] } });
    expect(r.statusCode).toBe(502);
    expect(r.json().details.reason).toBe("not_configured");
  });
});
