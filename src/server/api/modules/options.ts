import "server-only";
import { z } from "zod";
import type { Router } from "@/server/api/router";
import { prisma } from "@/server/db";
import { requireCaseAccess } from "@/server/authz";
import { buildWhere, delegate, requireResource, rowLabel } from "@/server/resources/service";
import { ROLE_LABELS, type Role } from "@/lib/permissions";

const optionQuery = z.object({
  q: z.string().trim().max(100).optional(),
  caseId: z.string().max(64).optional(),
  companyId: z.string().max(64).optional(),
  ids: z.string().max(2000).optional(),
});

export function registerOptions(router: Router) {
  router.add({
    method: "GET",
    path: "/options/users",
    summary: "Active users for assignment pickers",
    tags: ["Lookups"],
    query: optionQuery,
    async handler({ query }) {
      const ids = query.ids?.split(",").filter(Boolean).slice(0, 50);
      const users = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          ...(ids?.length ? { id: { in: ids } } : {}),
          ...(query.q ? { OR: [{ fullName: { contains: query.q } }, { username: { contains: query.q } }] } : {}),
        },
        select: { id: true, fullName: true, role: true },
        orderBy: { fullName: "asc" },
        take: 50,
      });
      return users.map((u) => ({ value: u.id, label: u.fullName, hint: ROLE_LABELS[u.role as Role] }));
    },
  });

  router.add({
    method: "GET",
    path: "/options/companies",
    summary: "Companies the user may open cases in",
    tags: ["Lookups"],
    async handler({ user }) {
      const where = user.role === "SYSTEM_ADMIN" ? {} : { id: { in: user.scopes.map((s) => s.companyId) } };
      const cs = await prisma.company.findMany({ where, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } });
      return cs.map((c) => ({ value: c.id, label: c.name, hint: c.code }));
    },
  });

  router.add({
    method: "GET",
    path: "/options/branches",
    summary: "Branches of a company",
    tags: ["Lookups"],
    query: optionQuery,
    async handler({ query }) {
      const bs = await prisma.branch.findMany({
        where: query.companyId ? { companyId: query.companyId } : {},
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      });
      return bs.map((b) => ({ value: b.id, label: b.name, hint: b.code }));
    },
  });

  router.add({
    method: "GET",
    path: "/options/records/:resource",
    summary: "Records of a type within a case, for relation pickers",
    tags: ["Lookups"],
    query: optionQuery,
    async handler({ params, query, user }) {
      const r = requireResource(params.resource!);
      if (query.caseId) await requireCaseAccess(user, query.caseId, r.module, "VIEW");
      const ids = query.ids?.split(",").filter(Boolean).slice(0, 50);
      const where = buildWhere(r, user, { caseId: query.caseId, q: query.q });
      const rows = await delegate(prisma, r.model).findMany({
        where: ids?.length ? { AND: [where, { id: { in: ids } }] } : where,
        orderBy: { [r.defaultSort.field]: r.defaultSort.order },
        take: 50,
      });
      return rows.map((row) => ({ value: String(row.id), label: rowLabel(r, row) }));
    },
  });
}
