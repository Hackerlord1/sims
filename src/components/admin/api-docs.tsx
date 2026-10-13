"use client";

import { useEffect, useRef, useState } from "react";
import "swagger-ui-dist/swagger-ui.css";
import { ErrorState, LoadingRows } from "@/components/ui/states";

/** Swagger UI for the generated OpenAPI document. "Try it out" sends the anti-forgery header. */
export function ApiDocs() {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    import("swagger-ui-dist/swagger-ui-bundle.js")
      .then((mod) => {
        if (cancelled || !ref.current) return;
        const SwaggerUIBundle = mod.default;
        SwaggerUIBundle({
          url: "/api/v1/openapi.json",
          domNode: ref.current,
          deepLinking: false,
          docExpansion: "none",
          requestInterceptor: (req: { method?: string; headers: Record<string, string> }) => {
            if (req.method && req.method.toUpperCase() !== "GET") req.headers["x-sims-csrf"] = "1";
            return req;
          },
        });
        setState("ready");
      })
      .catch(() => setState("error"));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="rounded-lg border border-border bg-white p-2 text-black">
      {state === "loading" ? <LoadingRows rows={6} label="Loading API documentation" /> : null}
      {state === "error" ? <ErrorState message="The API documentation viewer could not load. The raw document is at /api/v1/openapi.json." /> : null}
      <div ref={ref} />
    </div>
  );
}
