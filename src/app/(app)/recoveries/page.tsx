import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Recoveries" };

export default function RecoveriesPage() {
  return <RegisterPage resource="recoveries" title="Recoveries" description="Every recovery recorded, with verification status. Only verified recoveries count toward gross recovery." />;
}
