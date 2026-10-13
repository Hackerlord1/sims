import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Router } from "./router";
import { safeCell, toCsv } from "@/server/services/exporter";
import { diffSnapshots } from "@/server/audit";

function makeRouter() {
  const r = new Router("/api/v1");
  r.add({ method: "GET", path: "/:resource/:id", auth: "public", summary: "generic", tags: [], handler: async ({ params }) => ({ route: "generic", ...params }) });
  r.add({ method: "GET", path: "/reports/catalog", auth: "public", summary: "literal", tags: [], handler: async () => ({ route: "literal" }) });
  r.add({ method: "POST", path: "/things", auth: "public", summary: "post", tags: [], body: z.object({ n: z.number() }), handler: async ({ body }) => ({ doubled: body.n * 2 }) });
  r.add({
    method: "GET",
    path: "/boom",
    auth: "public",
    summary: "boom",
    tags: [],
    handler: async () => {
      throw new Error("secret detail");
    },
  });
  return r;
}
const req = (method: string, path: string, init: RequestInit = {}) => new Request(`http://t${path}`, { method, ...init });

describe("API router", () => {
  const r = makeRouter();

  it("prefers literal segments over parameters", async () => {
    expect((await (await r.dispatch(req("GET", "/api/v1/reports/catalog"))).json()).data.route).toBe("literal");
    expect((await (await r.dispatch(req("GET", "/api/v1/invoices/abc"))).json()).data).toEqual({ route: "generic", resource: "invoices", id: "abc" });
  });

  it("validates bodies and wraps responses", async () => {
    const ok = await r.dispatch(req("POST", "/api/v1/things", { headers: { "x-sims-csrf": "1", "content-type": "application/json" }, body: JSON.stringify({ n: 21 }) }));
    expect(ok.status).toBe(201);
    const body = await ok.json();
    expect(body.data.doubled).toBe(42);
    expect(body.requestId).toBe(ok.headers.get("x-request-id"));
    const bad = await r.dispatch(req("POST", "/api/v1/things", { headers: { "x-sims-csrf": "1", "content-type": "application/json" }, body: JSON.stringify({ n: "x" }) }));
    expect(bad.status).toBe(422);
  });

  it("requires the anti-forgery header for mutations", async () => {
    const res = await r.dispatch(req("POST", "/api/v1/things", { headers: { "content-type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(403);
  });

  it("returns 405 for known paths with the wrong method and 404 otherwise", async () => {
    expect((await r.dispatch(req("DELETE", "/api/v1/things", { headers: { "x-sims-csrf": "1" } }))).status).toBe(405);
    expect((await r.dispatch(req("GET", "/api/v1/a/b/c/d"))).status).toBe(404);
  });

  it("never leaks internal error details to clients", async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      const res = await r.dispatch(req("GET", "/api/v1/boom"));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(JSON.stringify(body)).not.toContain("secret detail");
      expect(body.error.code).toBe("INTERNAL");
    } finally {
      console.error = original;
    }
  });
});

describe("export safety", () => {
  it("neutralises spreadsheet formula injection but keeps negative numbers", () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")');
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("-1500.00")).toBe("-1500.00");
    expect(toCsv([{ key: "a", label: "A" }], [{ a: 'x,"y"' }])).toContain('"x,""y"""');
  });
});

describe("audit snapshots", () => {
  it("keeps only changed fields and omits secrets and timestamps", () => {
    const { before, after } = diffSnapshots({ title: "a", status: "X", passwordHash: "h", updatedAt: new Date() }, { title: "b", status: "X", passwordHash: "h2", updatedAt: new Date() });
    expect(before).toEqual({ title: "a" });
    expect(after).toEqual({ title: "b" });
  });
});
