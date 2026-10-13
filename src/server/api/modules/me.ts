import "server-only";
import { z } from "zod";
import type { Router } from "@/server/api/router";
import { prisma } from "@/server/db";
import { FONT_SCALES, MOTION_PREFS, THEMES, PREFS_COOKIE, serializePreferences, type FontScale } from "@/lib/preferences";

const prefsBody = z.object({
  theme: z.enum(THEMES),
  fontScale: z.coerce
    .number()
    .refine((v) => (FONT_SCALES as readonly number[]).includes(v), "Unsupported text size.")
    .transform((v) => v as FontScale),
  motion: z.enum(MOTION_PREFS),
});

export function registerMe(router: Router) {
  router.add({
    method: "GET",
    path: "/me/preferences",
    summary: "The current user's theme and accessibility preferences",
    tags: ["Preferences"],
    async handler({ user }) {
      return user.preferences;
    },
  });

  router.add({
    method: "PUT",
    path: "/me/preferences",
    summary: "Save theme and accessibility preferences",
    tags: ["Preferences"],
    body: prefsBody,
    async handler({ user, body, requestId }) {
      await prisma.user.update({ where: { id: user.id }, data: { preferences: body } });
      const res = Response.json({ data: body, requestId });
      res.headers.append("set-cookie", `${PREFS_COOKIE}=${serializePreferences(body)}; Path=/; Max-Age=31536000; SameSite=Lax`);
      return res;
    },
  });
}
