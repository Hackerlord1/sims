import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Court diary" };

export default function CourtDiaryPage() {
  return (
    <RegisterPage
      resource="court-events"
      title="Court diary"
      description="Court events across all civil matters, soonest next court date first."
      table={{ columns: ["eventType", "eventDate", "nextCourtDate", "outcome", "matterId"] }}
    />
  );
}
