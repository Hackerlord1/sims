"use client";

import * as D from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, LogOut, Menu as MenuIcon, Search, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import { BrandMark } from "@/components/brand";
import { useCan, useSession } from "@/components/session-context";
import { NAV, type NavGroup } from "@/components/shell/nav";
import { NotificationsBell } from "@/components/shell/notifications";
import { useReturnFocus } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { SESSION_EXPIRED_EVENT } from "@/lib/api-client";

function useVisibleNav(): NavGroup[] {
  const can = useCan();
  const { dataApprover } = useSession();
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.requires || can(i.requires[0], i.requires[1])) && (!i.approverOnly || dataApprover)) })).filter((g) => g.items.length);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = useVisibleNav();
  return (
    <nav aria-label="Main navigation" className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="nav-group-label eyebrow px-3 pb-2 text-[0.625rem] text-sidebar-muted">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn("nav-link flex items-center gap-2.5 rounded-md px-3 py-[0.45rem] text-[0.84rem]", !active && "text-sidebar-text/80 hover:bg-sidebar-active hover:text-sidebar-text")}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="group flex items-center gap-3 px-3">
      <BrandMark className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-3" />
      <span className="leading-tight">
        <span className="block font-display text-[1.35rem] font-semibold tracking-tight text-sidebar-text">SIMS</span>
        <span className="eyebrow block text-[0.58rem] text-sidebar-muted">Investigation Command Centre</span>
      </span>
    </Link>
  );
}

function GlobalSearch() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="group relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const q = ref.current?.value.trim();
        if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <label htmlFor="global-search" className="sr-only">
        Search cases, people, invoices, cheques, OB and court numbers
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent" aria-hidden />
      <input
        ref={ref}
        id="global-search"
        type="search"
        placeholder="Search case, person, invoice, cheque, OB number…"
        className="h-9 w-full rounded-[5px] border border-border bg-surface pr-10 pl-9 text-sm transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted hover:border-border-strong focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none"
        autoComplete="off"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-border bg-surface px-1.5 text-[10px] text-muted shadow-card sm:block" aria-hidden>
        /
      </kbd>
    </form>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

function UserMenu() {
  const s = useSession();
  return (
    <Menu.Root>
      <Menu.Trigger
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2"
        aria-label={`Account menu for ${s.fullName}`}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full border border-border-strong bg-surface-2 font-display text-sm font-semibold text-text" aria-hidden>
          {initials(s.fullName)}
        </span>
        <span className="hidden leading-tight md:block">
          <span className="block text-sm font-medium">{s.fullName}</span>
          <span className="block text-[11px] text-muted">{s.roleLabel}</span>
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="elevated z-50 min-w-52 rounded-lg border border-border bg-surface p-1">
          <Menu.Label className="px-2 py-1.5 text-xs text-muted">
            Signed in as <span className="font-medium text-text">{s.username}</span>
          </Menu.Label>
          <Menu.Separator className="my-1 h-px bg-border" />
          <Menu.Item asChild>
            <Link href="/settings/preferences" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none data-[highlighted]:bg-surface-2">
              <SlidersHorizontal className="h-4 w-4" aria-hidden /> Theme and accessibility
            </Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link href="/mfa/setup" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none data-[highlighted]:bg-surface-2">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Two-step verification
            </Link>
          </Menu.Item>
          <Menu.Item asChild>
            <Link href="/change-password" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none data-[highlighted]:bg-surface-2">
              <KeyRound className="h-4 w-4" aria-hidden /> Change password
            </Link>
          </Menu.Item>
          <Menu.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none data-[highlighted]:bg-surface-2"
            onSelect={() => {
              void signOutAction();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

function useSessionExpiry() {
  const router = useRouter();
  useEffect(() => {
    const onExpired = () => {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      router.refresh();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [router]);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const returnFocus = useReturnFocus();
  const s = useSession();
  useSessionExpiry();
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <aside className="sidebar-surface sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-sidebar lg:flex" aria-label="Sidebar">
        <div className="border-b border-white/5 pt-5 pb-4">
          <Brand />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-5 pb-6">
          <NavList />
        </div>
      </aside>

      <D.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <AnimatePresence>
          {mobileOpen ? (
            <D.Portal forceMount>
              <D.Overlay asChild forceMount>
                <motion.div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              </D.Overlay>
              <D.Content asChild forceMount {...returnFocus}>
                <motion.div
                  className="sidebar-surface fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-2xl lg:hidden"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                >
                  <D.Title className="sr-only">Navigation</D.Title>
                  <D.Description className="sr-only">Main navigation menu</D.Description>
                  <div className="flex items-center justify-between py-4 pr-3">
                    <Brand />
                    <D.Close className="rounded-md p-2 text-sidebar-text hover:bg-sidebar-active" aria-label="Close navigation">
                      <X className="h-5 w-5" aria-hidden />
                    </D.Close>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
                    <NavList onNavigate={() => setMobileOpen(false)} />
                  </div>
                </motion.div>
              </D.Content>
            </D.Portal>
          ) : null}
        </AnimatePresence>
      </D.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        {s.demoMode ? (
          <div className="eyebrow border-b border-dashed border-warning/50 bg-warning-soft px-4 py-1 text-center text-[0.625rem] text-warning" role="note">
            DEMO MODE — all records are fictional DEMO DATA. Do not enter real investigation information.
          </div>
        ) : null}
        <header className="glass-bar hairline sticky top-0 z-30 border-b border-border">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5">
            <button
              type="button"
              className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-text lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
            >
              <MenuIcon className="h-5 w-5" aria-hidden />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <NotificationsBell />
              <UserMenu />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-5 outline-none sm:px-5 lg:px-7">
          {children}
        </main>
      </div>
    </div>
  );
}
