"use server";

import { ApiError } from "@/server/api/errors";
import { accessRequestBody, submitAccessRequest } from "@/server/services/access-requests";

export interface RequestAccessState {
  done?: string;
  error?: string;
  fields?: Record<string, string>;
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v : undefined);

export async function requestAccessAction(_prev: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  const parsed = accessRequestBody.safeParse({
    fullName: text(formData.get("fullName")) ?? "",
    username: text(formData.get("username")) ?? "",
    // Passwords are taken as typed, never trimmed.
    password: String(formData.get("password") ?? ""),
    website: text(formData.get("website")),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] ??= i.message;
    return { error: "Some details need attention.", fields };
  }
  try {
    const res = await submitAccessRequest(parsed.data);
    return { done: res.message };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message };
    throw e;
  }
}
