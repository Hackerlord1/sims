import { apiRouter } from "@/server/api";

// Every /api/v1 endpoint is served by the SIMS router (src/server/api), which owns authentication,
// authorization, validation, CSRF checks, rate limits and the response format.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const handle = (req: Request) => apiRouter.dispatch(req);

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
