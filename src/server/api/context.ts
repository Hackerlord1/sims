import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(ctx: RequestContext, fn: () => Promise<T>) => storage.run(ctx, fn);

export const currentRequestContext = (): RequestContext | undefined => storage.getStore();
