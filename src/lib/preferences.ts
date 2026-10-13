// Display and accessibility preferences. Stored on the user record and mirrored in a cookie so the
// server renders the right theme on the first byte (no flash).

export const PREFS_COOKIE = "sims_prefs";

export const THEMES = ["system", "intelligence-dark", "command-navy", "forensic-light", "executive-graphite", "high-contrast"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  system: "System theme",
  "intelligence-dark": "Intelligence Dark",
  "command-navy": "Command Navy",
  "forensic-light": "Forensic Light",
  "executive-graphite": "Executive Graphite",
  "high-contrast": "High Contrast",
};

export const FONT_SCALES = [90, 100, 112, 125, 140] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const MOTION_PREFS = ["system", "reduce", "full"] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];

export interface UserPreferences {
  theme: Theme;
  fontScale: FontScale;
  motion: MotionPref;
}

export const DEFAULT_PREFERENCES: UserPreferences = { theme: "system", fontScale: 100, motion: "system" };

export function parsePreferences(raw: unknown): UserPreferences {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const theme = THEMES.includes(o.theme as Theme) ? (o.theme as Theme) : DEFAULT_PREFERENCES.theme;
  const fontScale = FONT_SCALES.includes(Number(o.fontScale) as FontScale) ? (Number(o.fontScale) as FontScale) : DEFAULT_PREFERENCES.fontScale;
  const motion = MOTION_PREFS.includes(o.motion as MotionPref) ? (o.motion as MotionPref) : DEFAULT_PREFERENCES.motion;
  return { theme, fontScale, motion };
}

export const serializePreferences = (p: UserPreferences) => encodeURIComponent(JSON.stringify(p));
export const readPreferencesCookie = (value: string | undefined) => parsePreferences(value ? safeDecode(value) : null);

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return "";
  }
}
