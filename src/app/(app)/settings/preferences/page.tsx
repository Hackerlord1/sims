import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current-user";
import { PreferencesForm } from "@/components/preference-controls";
import { Card, PageHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "Theme and accessibility" };

export default async function PreferencesPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Theme and accessibility" description="Choose a colour theme, text size and motion setting. Changes apply immediately and are saved to your profile." />
      <Card className="max-w-3xl">
        <PreferencesForm initial={user.preferences} />
      </Card>
    </>
  );
}
