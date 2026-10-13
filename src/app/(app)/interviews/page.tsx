import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Interviews and statements" };

export default function InterviewsPage() {
  return <RegisterPage resource="interviews" title="Interviews and statements" description="Interview records across cases. Signed statements are protected once uploaded." />;
}
