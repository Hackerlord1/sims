"use client";

import { MotionConfig } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { ApiClientError } from "@/lib/api-client";
import type { MotionPref } from "@/lib/preferences";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Never retry client errors (401/403/404/422); retry transient failures once.
        retry: (count, error) => !(error instanceof ApiClientError && error.status >= 400 && error.status < 500) && count < 1,
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children, motion }: { children: React.ReactNode; motion: MotionPref }) {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion={motion === "reduce" ? "always" : motion === "full" ? "never" : "user"}>
        {children}
        <Toaster position="bottom-right" closeButton richColors={false} toastOptions={{ className: "sims-toast" }} />
      </MotionConfig>
    </QueryClientProvider>
  );
}
