"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiGet, type QueryValue } from "@/lib/api-client";

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export type Row = Record<string, unknown> & { id: string; _labels?: Record<string, string> };

/** Server-paginated list. Previous page stays visible while the next loads; stale requests are aborted. */
export function useResourceList(resource: string, params: Record<string, QueryValue>, enabled = true) {
  return useQuery({
    queryKey: ["list", resource, params],
    queryFn: ({ signal }) => apiGet<Row[]>(`/${resource}`, params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useResourceRow(resource: string, id: string | null) {
  return useQuery({
    queryKey: ["row", resource, id],
    queryFn: ({ signal }) => apiGet<Row>(`/${resource}/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export function useOptions(path: string, params: Record<string, QueryValue>, enabled = true) {
  return useQuery({
    queryKey: ["options", path, params],
    queryFn: ({ signal }) => apiGet<Option[]>(path, params, signal),
    enabled,
    staleTime: 60_000,
  });
}
