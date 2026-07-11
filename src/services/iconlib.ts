import { luckyFetch } from "@/src/lib/lucky-fetch";
import type { LuckyRecord } from "@/src/types/lucky";

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function getIconLibraryIcons() {
  const payload = await luckyFetch("/api/iconlib/icons");
  for (const source of [payload, payload.data, payload.result]) {
    if (!isRecord(source)) continue;
    if (Array.isArray(source.icons)) return source.icons.filter(isRecord);
  }
  return [];
}
