import { requireUser } from "@/server/auth/current-user";
import { Providers } from "@/components/providers";
import { SessionProvider, type ClientSession } from "@/components/session-context";
import { AppShell } from "@/components/shell/app-shell";
import { ACTIONS, can, canApproveDataChanges, roleModules, ROLE_LABELS } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const session: ClientSession = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    permissions: Object.fromEntries(roleModules(user.role).map((m) => [m, ACTIONS.filter((a) => can(user, m, a))])),
    preferences: user.preferences,
    demoMode: process.env.DEMO_MODE === "true",
    dataApprover: canApproveDataChanges(user),
  };
  return (
    <SessionProvider value={session}>
      <Providers motion={user.preferences.motion}>
        <AppShell>{children}</AppShell>
      </Providers>
    </SessionProvider>
  );
}
