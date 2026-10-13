// Browser client for the SIMS REST API. Every state-changing call carries the anti-forgery header.

export const API_BASE = "/api/v1";

export interface ListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Envelope<T> {
  data: T;
  meta?: ListMeta;
  requestId: string;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly fields: Record<string, string> = {},
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export function queryString(params: Record<string, QueryValue> = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const SESSION_EXPIRED_EVENT = "sims:session-expired";
let redirecting = false;

async function toError(res: Response): Promise<ApiClientError> {
  let body: { error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } }; requestId?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  if (res.status === 401 && typeof window !== "undefined" && !redirecting && !window.location.pathname.startsWith("/login")) {
    redirecting = true;
    // The app shell listens for this and returns the user to the sign-in page.
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  }
  return new ApiClientError(
    body.error?.message ?? (res.status === 0 ? "Network error. Check your connection." : `Request failed (${res.status}).`),
    res.status,
    body.error?.code ?? "UNKNOWN",
    body.error?.details?.fields ?? {},
    body.requestId,
    body.error?.details,
  );
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, QueryValue>; signal?: AbortSignal } = {}): Promise<Envelope<T>> {
  const method = opts.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${queryString(opts.query)}`, {
      method,
      signal: opts.signal,
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        ...(method !== "GET" ? { "x-sims-csrf": "1", "content-type": "application/json" } : {}),
      },
      body: method !== "GET" ? JSON.stringify(opts.body ?? {}) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiClientError("Network error. Check your connection and try again.", 0, "NETWORK");
  }
  if (!res.ok) throw await toError(res);
  return (await res.json()) as Envelope<T>;
}

export const apiGet = <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) => api<T>(path, { query, signal });
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: "POST", body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body });
export const apiPut = <T>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body });
export const apiDelete = <T>(path: string, body?: unknown) => api<T>(path, { method: "DELETE", body });

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
  return decodeURIComponent(m?.[1] ?? m?.[2] ?? fallback);
}

/** Downloads a file produced by the API (GET, or POST with a JSON body). */
export async function downloadFromApi(path: string, opts: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, QueryValue>; fallbackName?: string } = {}) {
  const method = opts.method ?? "GET";
  const res = await fetch(`${API_BASE}${path}${queryString(opts.query)}`, {
    method,
    credentials: "same-origin",
    headers: method === "POST" ? { "x-sims-csrf": "1", "content-type": "application/json" } : {},
    body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
  });
  if (!res.ok) throw await toError(res);
  saveBlob(await res.blob(), filenameFrom(res, opts.fallbackName ?? "download"));
}

/** Multipart upload with progress reporting (fetch cannot report upload progress). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<Envelope<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${path}`);
    xhr.setRequestHeader("x-sims-csrf", "1");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as Envelope<T> & { error?: { code: string; message: string; details?: { fields?: Record<string, string> } } };
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else
        reject(
          new ApiClientError(
            body?.error?.message ?? `Upload failed (${xhr.status}).`,
            xhr.status,
            body?.error?.code ?? "UNKNOWN",
            body?.error?.details?.fields ?? {},
            body?.requestId,
            body?.error?.details,
          ),
        );
    };
    xhr.onerror = () => reject(new ApiClientError("Upload failed: network error.", 0, "NETWORK"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.requestId && e.status >= 500 ? `${e.message} (request ${e.requestId})` : e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
