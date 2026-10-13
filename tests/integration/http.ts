import { createServer, type IncomingMessage, type Server } from "node:http";
import { apiRouter } from "@/server/api";

/** Node HTTP server that hands every request to the SIMS API router, for Supertest. */
export function apiServer(): Server {
  return createServer(async (req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" || !body.length ? undefined : body,
    });
    const response = await apiRouter.dispatch(request);
    const out: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
      if (key === "set-cookie") out[key] = [...((out[key] as string[]) ?? []), value];
      else out[key] = value;
    });
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  });
}
