import {
  Archive,
  BadgeDollarSign,
  BarChart3,
  BookOpenCheck,
  Briefcase,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileCheck2,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Gavel,
  HandCoins,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Network,
  NotebookPen,
  PiggyBank,
  Receipt,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Action, Module } from "@/lib/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown when the user holds this permission. Omitted = every signed-in user. */
  requires?: [Module, Action];
  /** Shown only to users who may approve data changes. */
  approverOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Command",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, requires: ["DASHBOARD", "VIEW"] },
      { href: "/cases", label: "Case files", icon: Briefcase, requires: ["CASES", "VIEW"] },
      { href: "/tasks", label: "Tasks and deadlines", icon: ListChecks, requires: ["TASKS", "VIEW"] },
      { href: "/search", label: "Search", icon: Search },
    ],
  },
  {
    label: "Investigation",
    items: [
      { href: "/parties", label: "Parties", icon: Users, requires: ["PARTIES", "VIEW"] },
      { href: "/invoices", label: "Invoices", icon: FileText, requires: ["INVOICES", "VIEW"] },
      { href: "/cheques", label: "Bad cheques", icon: Receipt, requires: ["CHEQUES", "VIEW"] },
      { href: "/interviews", label: "Interviews and statements", icon: NotebookPen, requires: ["INTERVIEWS", "VIEW"] },
      { href: "/evidence", label: "Evidence vault", icon: ShieldCheck, requires: ["EVIDENCE", "VIEW"] },
      { href: "/work-logs", label: "Work-done log", icon: ClipboardList, requires: ["WORK_LOGS", "VIEW"] },
      { href: "/findings", label: "Findings and decisions", icon: FileCheck2, requires: ["FINDINGS", "VIEW"] },
    ],
  },
  {
    label: "Legal and action",
    items: [
      { href: "/criminal", label: "Criminal action", icon: ShieldAlert, requires: ["CRIMINAL", "VIEW"] },
      { href: "/civil", label: "Civil action", icon: Landmark, requires: ["CIVIL", "VIEW"] },
      { href: "/court-diary", label: "Court diary", icon: CalendarClock, requires: ["CIVIL", "VIEW"] },
      { href: "/disciplinary", label: "Disciplinary action", icon: Gavel, requires: ["DISCIPLINARY", "VIEW"] },
      { href: "/write-offs", label: "Write-offs", icon: BookOpenCheck, requires: ["WRITE_OFFS", "VIEW"] },
    ],
  },
  {
    label: "Costs and recovery",
    items: [
      { href: "/expenses", label: "Expenses", icon: Wallet, requires: ["EXPENSES", "VIEW"] },
      { href: "/advances", label: "Advances and imprests", icon: HandCoins, requires: ["ADVANCES", "VIEW"] },
      { href: "/budgets", label: "Budgets", icon: PiggyBank, requires: ["BUDGETS", "VIEW"] },
      { href: "/recoveries", label: "Recoveries", icon: CircleDollarSign, requires: ["RECOVERIES", "VIEW"] },
    ],
  },
  {
    label: "Financial analysis",
    items: [
      { href: "/statements", label: "Bank and M-Pesa statements", icon: BadgeDollarSign, requires: ["STATEMENTS", "VIEW"] },
      { href: "/money-movement", label: "Money movement", icon: Network, requires: ["STATEMENTS", "VIEW"] },
    ],
  },
  {
    label: "Reporting",
    items: [{ href: "/reports", label: "Reports and exports", icon: BarChart3, requires: ["REPORTS", "VIEW"] }],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/data", label: "Data administration", icon: FileSpreadsheet, requires: ["DATA_ADMIN", "BULK_UPLOAD"] },
      { href: "/admin/bulk", label: "Bulk actions", icon: Database, requires: ["DATA_ADMIN", "SOFT_DELETE"] },
      { href: "/admin/recycle-bin", label: "Recycle Bin", icon: Trash2, requires: ["CASES", "RESTORE"] },
      { href: "/admin/approvals", label: "Data-change approvals", icon: FileCheck2, approverOnly: true },
      { href: "/admin/deletion-requests", label: "Permanent deletion", icon: Archive, requires: ["DATA_ADMIN", "VIEW"] },
      { href: "/admin/users", label: "Users and roles", icon: UserCog, requires: ["USERS", "VIEW"] },
      { href: "/admin/audit", label: "Audit logs", icon: ScrollText, requires: ["AUDIT", "VIEW_AUDIT_LOGS"] },
      { href: "/admin/settings", label: "System settings", icon: Settings, requires: ["SETTINGS", "VIEW"] },
      { href: "/api-docs", label: "API documentation", icon: FileSearch, requires: ["SETTINGS", "VIEW"] },
    ],
  },
  {
    label: "Me",
    items: [
      { href: "/settings/preferences", label: "Theme and accessibility", icon: SlidersHorizontal },
      { href: "/admin/approvals?mine=1", label: "My submitted changes", icon: ClipboardList },
    ],
  },
];
