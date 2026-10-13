import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db";
import { APPROVABLE_RESOURCE_KEYS } from "@/lib/resources/registry";

/** Every configurable setting, its validation and default. */
export const SETTINGS = {
  "currency.default": { schema: z.string().regex(/^[A-Z]{3}$/), default: "KES", label: "Default currency (ISO code)" },
  "reminders.dueSoonDays": { schema: z.coerce.number().int().min(1).max(30), default: 3, label: "Days before a due date that a task counts as due soon" },
  "reminders.inactivityDays": { schema: z.coerce.number().int().min(3).max(180), default: 14, label: "Days without activity before a case is flagged inactive" },
  "reminders.courtDateDays": { schema: z.coerce.number().int().min(1).max(60), default: 7, label: "Days ahead to remind about court dates" },
  "retention.minRecycleDays": { schema: z.coerce.number().int().min(0).max(3650), default: 30, label: "Minimum days in the Recycle Bin before permanent deletion" },
  "retention.closedCaseYears": { schema: z.coerce.number().int().min(0).max(50), default: 7, label: "Years a closed case is retained before its records may be permanently deleted" },
  "writeOff.boardThreshold": { schema: z.string().regex(/^\d{1,16}(\.\d{1,2})?$/), default: "1000000.00", label: "Write-offs at or above this amount need board approval" },
  "uploads.maxFileMb": { schema: z.coerce.number().int().min(1).max(50), default: 25, label: "Maximum evidence or statement file size (MB)" },
  "imports.maxRows": { schema: z.coerce.number().int().min(10).max(100000), default: 20000, label: "Maximum rows per bulk-import file" },
  "imports.batchSize": { schema: z.coerce.number().int().min(50).max(5000), default: 500, label: "Rows written per database batch during import" },
  "approvals.recordTypes": {
    schema: z.array(z.enum(APPROVABLE_RESOURCE_KEYS as [string, ...string[]])).max(APPROVABLE_RESOURCE_KEYS.length),
    default: [] as string[],
    label: "Record types whose new records, edits and imports need approval before they take effect",
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.output<(typeof SETTINGS)[K]["schema"]>;

let cache: { at: number; values: Map<string, unknown> } | null = null;
const TTL_MS = 30_000;

async function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const rows = await prisma.systemSetting.findMany();
  cache = { at: Date.now(), values: new Map(rows.map((r) => [r.key, r.value])) };
  return cache.values;
}

export function invalidateSettings() {
  cache = null;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const def = SETTINGS[key];
  const raw = (await load()).get(key);
  const parsed = def.schema.safeParse(raw);
  return (parsed.success ? parsed.data : def.default) as SettingValue<K>;
}

export async function allSettings() {
  const values = await load();
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
    const def = SETTINGS[key];
    const parsed = def.schema.safeParse(values.get(key));
    return { key, label: def.label, value: parsed.success ? parsed.data : def.default, default: def.default };
  });
}
