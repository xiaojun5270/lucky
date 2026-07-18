import { luckyFetch } from "@/src/lib/lucky-fetch";
import type { LuckyListItem, LuckyRecord } from "@/src/types/lucky";

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function query(params: LuckyRecord) {
  const value = Object.entries(params)
    .filter(([, item]) => item !== undefined && item !== null && item !== "")
    .map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
    .join("&");
  return value ? `?${value}` : "";
}

function certificateScore(item: LuckyRecord) {
  return ["Key", "key", "Remark", "remark", "AddFrom", "CertsInfo", "ExtParams", "SyncInfo"]
    .reduce((score, key) => score + (item[key] !== undefined ? 1 : 0), 0);
}

function extractCertificates(payload: LuckyRecord): LuckyListItem[] {
  const queue: unknown[] = [payload];
  const visited = new Set<object>();
  let best: LuckyRecord[] = [];
  let bestScore = 0;
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      const records = current.filter(isRecord);
      const score = records.reduce((total, item) => total + certificateScore(item), 0);
      if (records.length && score > bestScore) {
        best = records;
        bestScore = score;
      }
      queue.push(...current);
      continue;
    }
    queue.push(...Object.values(current as LuckyRecord));
  }
  return bestScore > 0 ? best as LuckyListItem[] : [];
}

export async function getSslCertificates(signal?: AbortSignal) {
  const raw = await luckyFetch("/api/ssl", { signal });
  return { items: extractCertificates(raw), raw };
}

export const getSslCertificate = (key: string, signal?: AbortSignal) => luckyFetch(`/api/ssl/${encodeURIComponent(key)}`, { signal });
export const createSslCertificate = (value: LuckyRecord) => luckyFetch("/api/ssl", { method: "POST", body: JSON.stringify(value) });
export const updateSslCertificate = (value: LuckyRecord) => luckyFetch("/api/ssl", { method: "PUT", body: JSON.stringify(value) });
export const deleteSslCertificate = (key: string) => luckyFetch(`/api/ssl${query({ key })}`, { method: "DELETE" });
export const setSslCertificateEnabled = (key: string, enable: boolean) =>
  luckyFetch(`/api/ssl/${encodeURIComponent(key)}${query({ enable })}`, { method: "PUT" });
export const flushSslCertificate = (key: string) => luckyFetch(`/api/ssl/flush${query({ key })}`, { method: "PUT" });
export async function syncSslCertificate(key: string) {
  try {
    return await luckyFetch(`/api/ssl/manualsync/${encodeURIComponent(key)}`);
  } catch (error) {
    if (error instanceof Error && /PermissionDeniedCannotUseSyncFunction/i.test(error.message))
      throw new Error("当前账号没有证书分发同步权限");
    throw error;
  }
}
export const reorderSslCertificates = (keys: unknown) =>
  luckyFetch("/api/ssl/sslorderadjustment", { method: "PUT", body: JSON.stringify(keys) });
export const getSslSyncClients = (signal?: AbortSignal) => luckyFetch("/api/ssl/syncclients", { signal });
export async function getSslSyncClientOptions(signal?: AbortSignal) {
  const payload = await getSslSyncClients(signal);
  const queue: unknown[] = [payload];
  const visited = new Set<object>();
  let best: LuckyListItem[] = [];
  let bestScore = 0;
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      const records = current.filter(isRecord) as LuckyListItem[];
      const score = records.reduce((total, item) => total + ["Key", "ClientKey", "Name", "ClientName", "DeviceName"].filter((key) => item[key] !== undefined).length, 0);
      if (records.length && score > bestScore) {
        best = records;
        bestScore = score;
      }
      queue.push(...current);
    } else queue.push(...Object.values(current as LuckyRecord));
  }
  return best;
}
export const getSslSetting = (signal?: AbortSignal) => luckyFetch("/api/ssl/setting", { signal });
export const updateSslSetting = (value: LuckyRecord) =>
  luckyFetch("/api/ssl/setting", { method: "PUT", body: JSON.stringify(value) });
export const cancelSslAcme = (key: string) => luckyFetch(`/api/ssl/${encodeURIComponent(key)}/acmecancel`, { method: "DELETE" });
export const getSslLogs = (key = "", pageSize = 100, page = 1, signal?: AbortSignal) =>
  luckyFetch(`/api/ssl/logs${query({ key, pageSize, page })}`, { signal });
export const getSslLastLogs = (key = "", signal?: AbortSignal) => luckyFetch(`/api/ssl/lastlogs${query({ key })}`, { signal });
