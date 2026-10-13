import { cookies } from "next/headers";
import { AUTHORIZED_USE_NOTICE, BrandMark } from "@/components/brand";
import { ThemeQuickPicker } from "@/components/preference-controls";
import { PREFS_COOKIE, readPreferencesCookie } from "@/lib/preferences";

const FILE_FIELDS: [string, string][] = [
  ["Holder", "Authorised Savemore personnel"],
  ["Contents", "Case files · evidence · custody · recoveries"],
  ["Pathways", "Disciplinary · criminal · civil"],
  ["Handling", "Every action recorded in the audit log"],
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const prefs = readPreferencesCookie((await cookies()).get(PREFS_COOKIE)?.value);
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
      <a href="#auth-main" className="skip-link">
        Skip to sign-in form
      </a>
      <aside className="auth-aurora relative hidden flex-col justify-between overflow-hidden p-10 text-sidebar-text lg:flex xl:p-14">
        <div className="auth-grid" aria-hidden />
        <div className="reveal flex items-center gap-3" style={{ "--i": 0 } as React.CSSProperties}>
          <BrandMark />
          <span className="leading-tight">
            <span className="block font-display text-2xl font-semibold tracking-tight">SIMS</span>
            <span className="eyebrow block text-[0.6rem] text-sidebar-muted">Savemore Investigation Management System</span>
          </span>
        </div>

        <div className="relative mx-auto w-full max-w-xl py-12">
          <div className="folder px-8 pt-9 pb-8 xl:px-10">
            <span className="folder-tab">Case file · SIMS/INV</span>
            <span className="stamp absolute top-7 right-7" aria-hidden>
              Restricted
            </span>
            <p className="eyebrow opacity-60">Standing instruction</p>
            <p className="mt-3 font-display text-[2.6rem] leading-[1.02] font-medium tracking-tight xl:text-[3.2rem]">
              Investigate.
              <br />
              Escalate. <span className="marked italic">Recover.</span>
            </p>
            <div className="mt-8">
              {FILE_FIELDS.map(([k, v]) => (
                <p key={k} className="folder-field">
                  <span>{k}</span>
                  <span>{v}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        <p className="reveal max-w-lg text-xs leading-relaxed text-sidebar-muted" style={{ "--i": 3 } as React.CSSProperties}>
          {AUTHORIZED_USE_NOTICE}
        </p>
      </aside>

      <div className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <BrandMark className="h-8 w-8 text-lg" />
            <span className="font-display text-lg font-semibold">SIMS</span>
          </div>
          <ThemeQuickPicker initial={prefs} />
        </div>
        <main id="auth-main" className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
          <div className="auth-card reveal w-full max-w-sm rounded-md border border-border p-6 sm:p-8" style={{ "--i": 1 } as React.CSSProperties}>
            {children}
          </div>
        </main>
        <p className="px-6 pb-6 text-center text-xs leading-relaxed text-muted lg:hidden">{AUTHORIZED_USE_NOTICE}</p>
      </div>
    </div>
  );
}
