import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { SessionProvider, type ClientSession } from "@/components/session-context";
import { ACTIONS, can, roleModules, type Role } from "@/lib/permissions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/test",
}));

export function session(role: Role = "LEAD_INVESTIGATOR"): ClientSession {
  return {
    id: "u1",
    username: "tester",
    fullName: "Test User",
    role,
    roleLabel: role,
    permissions: Object.fromEntries(roleModules(role).map((m) => [m, ACTIONS.filter((a) => can({ role }, m, a))])),
    preferences: { theme: "system", fontScale: 100, motion: "reduce" },
    demoMode: true,
    dataApprover: role === "SYSTEM_ADMIN",
  };
}

export function renderWithApp(ui: ReactNode, role: Role = "LEAD_INVESTIGATOR") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <SessionProvider value={session(role)}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </SessionProvider>,
  );
}

/** Replaces fetch with a handler keyed by path; returns the mock for assertions. */
export function mockApi(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
