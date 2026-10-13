"use client";

import { useId, useRef, useState } from "react";
import { FONT_SCALES, MOTION_PREFS, PREFS_COOKIE, serializePreferences, THEME_LABELS, THEMES, type FontScale, type MotionPref, type Theme, type UserPreferences } from "@/lib/preferences";
import { apiPut } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export function applyPreferences(p: UserPreferences) {
  const el = document.documentElement;
  if (p.theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", p.theme);
  if (p.motion === "system") el.removeAttribute("data-motion");
  else el.setAttribute("data-motion", p.motion);
  el.style.setProperty("--font-scale", String(p.fontScale / 100));
  // Display preference only — not sensitive. One year, Lax.
  document.cookie = `${PREFS_COOKIE}=${serializePreferences(p)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

const MOTION_LABELS: Record<MotionPref, string> = {
  system: "Follow system setting",
  reduce: "Reduce motion",
  full: "Allow animations",
};

/** Compact theme picker for the sign-in screens. */
export function ThemeQuickPicker({ initial, tone = "default" }: { initial: UserPreferences; tone?: "default" | "inverse" }) {
  const id = useId();
  const [prefs, setPrefs] = useState(initial);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className={cn("text-xs", tone === "inverse" ? "text-brand-panel-text/70" : "text-muted")}>
        Theme
      </label>
      <select
        id={id}
        value={prefs.theme}
        onChange={(e) => {
          const next = { ...prefs, theme: e.target.value as Theme };
          setPrefs(next);
          applyPreferences(next);
        }}
        className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text"
      >
        {THEMES.map((t) => (
          <option key={t} value={t}>
            {THEME_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Full preferences form used on the Theme and accessibility page. Saves to the user profile. */
export function PreferencesForm({ initial, onSaved }: { initial: UserPreferences; onSaved?: (p: UserPreferences) => void }) {
  const [prefs, setPrefs] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  // Saves run one at a time so a quick series of changes reaches the profile in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef(0);

  const update = (patch: Partial<UserPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyPreferences(next);
    const ticket = ++latest.current;
    setStatus("Saving…");
    queue.current = queue.current.then(async () => {
      try {
        await apiPut("/me/preferences", next);
        if (ticket === latest.current) setStatus("Preferences saved.");
        onSaved?.(next);
      } catch {
        if (ticket === latest.current) setStatus("Saved on this device only — could not save to your profile.");
      }
    });
    return queue.current;
  };

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Theme</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => (
            <label
              key={t}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-[background-color,border-color,box-shadow] duration-200",
                prefs.theme === t ? "border-accent bg-accent-soft shadow-[3px_3px_0_0_var(--accent)]" : "border-border hover:border-border-strong hover:bg-surface-2",
              )}
            >
              <input type="radio" name="theme" value={t} checked={prefs.theme === t} onChange={() => update({ theme: t })} className="accent-[var(--accent)]" />
              <ThemeSwatch theme={t} />
              <span className="font-medium">{THEME_LABELS[t]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Text size</legend>
        <div className="flex flex-wrap gap-2">
          {FONT_SCALES.map((s) => (
            <label key={s} className={cn("cursor-pointer rounded-md border px-3 py-1.5 text-sm", prefs.fontScale === s ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2")}>
              <input type="radio" name="fontScale" className="sr-only" checked={prefs.fontScale === s} onChange={() => update({ fontScale: s as FontScale })} />
              {s}%
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Motion</legend>
        <div className="space-y-1.5">
          {MOTION_PREFS.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="motion" checked={prefs.motion === m} onChange={() => update({ motion: m })} className="accent-[var(--accent)]" />
              {MOTION_LABELS[m]}
            </label>
          ))}
        </div>
      </fieldset>

      <p role="status" aria-live="polite" className="text-sm text-muted">
        {status}
      </p>
    </div>
  );
}

const SWATCH: Record<Theme, [string, string, string]> = {
  system: ["#eeebe3", "#0e0f11", "#d8ec5b"],
  "intelligence-dark": ["#0e0f11", "#15171a", "#d8ec5b"],
  "command-navy": ["#08111d", "#0e1a2b", "#5cc8dc"],
  "forensic-light": ["#eeebe3", "#fbfaf6", "#1f3f8f"],
  "executive-graphite": ["#121213", "#1a1a1c", "#d6b066"],
  "high-contrast": ["#000000", "#000000", "#ffe14d"],
};

function ThemeSwatch({ theme }: { theme: Theme }) {
  const [a, b, c] = SWATCH[theme];
  return (
    <span className="flex h-7 w-10 overflow-hidden rounded border border-border-strong" aria-hidden>
      <span className="flex-1" style={{ background: a }} />
      <span className="flex-1" style={{ background: b }} />
      <span className="w-2" style={{ background: c }} />
    </span>
  );
}
