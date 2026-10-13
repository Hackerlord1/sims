import type { Metadata } from "next";
import { RegisterPage } from "@/components/resources/register-page";

export const metadata: Metadata = { title: "Tasks and deadlines" };

export default function TasksPage() {
  return <RegisterPage resource="tasks" title="Tasks and deadlines" description="Every task across your cases. Overdue tasks are flagged; reminders are sent before due dates." />;
}
