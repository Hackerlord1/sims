import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { PREFS_COOKIE, readPreferencesCookie } from "@/lib/preferences";

export const metadata: Metadata = {
  title: { default: "SIMS — Savemore Investigation Management System", template: "%s · SIMS" },
  description: "Open, investigate, track, escalate, recover and close internal investigation cases.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const prefs = readPreferencesCookie((await cookies()).get(PREFS_COOKIE)?.value);
  return (
    <html
      lang="en-KE"
      data-theme={prefs.theme === "system" ? undefined : prefs.theme}
      data-motion={prefs.motion === "system" ? undefined : prefs.motion}
      style={{ "--font-scale": prefs.fontScale / 100 } as React.CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
