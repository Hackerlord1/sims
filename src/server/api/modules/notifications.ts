import "server-only";
import type { Router } from "@/server/api/router";
import { idParam } from "@/server/api/router";
import { notFound } from "@/server/api/errors";
import { prisma } from "@/server/db";

export function registerNotifications(router: Router) {
  router.add({
    method: "GET",
    path: "/notifications",
    summary: "The current user's reminders and alerts (latest 30) and unread count",
    tags: ["Notifications"],
    async handler({ user }) {
      const [items, unread] = await Promise.all([
        prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
        prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      ]);
      return { items, unread };
    },
  });

  router.add({
    method: "POST",
    path: "/notifications/read-all",
    summary: "Mark every notification read",
    tags: ["Notifications"],
    async handler({ user }) {
      const r = await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
      return { updated: r.count };
    },
  });

  router.add({
    method: "POST",
    path: "/notifications/:id/read",
    summary: "Mark one notification read",
    tags: ["Notifications"],
    async handler({ user, params }) {
      const r = await prisma.notification.updateMany({ where: { id: idParam(params), userId: user.id }, data: { readAt: new Date() } });
      if (!r.count) throw notFound("Notification");
      return { updated: r.count };
    },
  });
}
