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

function taskScore(value: LuckyRecord) {
  return ["TaskKey", "taskKey", "DDNSTaskKey", "Key", "key", "TaskName", "taskName", "DDNSTaskName", "Name", "name", "Records", "records", "DNSProvider", "dnsProvider"]
    .reduce((score, key) => score + (value[key] !== undefined ? 1 : 0), 0);
}

function extractTasks(payload: LuckyRecord): LuckyListItem[] {
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
      const score = records.reduce((total, item) => total + taskScore(item), 0);
      if (records.length && score > bestScore) {
        best = records;
        bestScore = score;
      }
      queue.push(...current);
      continue;
    }
    const record = current as LuckyRecord;
    const mapped = Object.values(record).filter(isRecord);
    const mappedScore = mapped.reduce((total, item) => total + taskScore(item), 0);
    if (mapped.length && mappedScore > bestScore) {
      best = mapped;
      bestScore = mappedScore;
    }
    queue.push(...Object.values(record));
  }
  return bestScore > 0 ? best as LuckyListItem[] : [];
}

export async function getDdnsTasks(signal?: AbortSignal) {
  const raw = await luckyFetch("/api/ddnstasklist", { signal });
  return { items: extractTasks(raw), raw };
}

export const getDdnsTask = (key: string, signal?: AbortSignal) => luckyFetch(`/api/ddns/task/${encodeURIComponent(key)}`, { signal });
export const createDdnsTask = (value: LuckyRecord) => luckyFetch("/api/ddns", { method: "POST", body: JSON.stringify(value) });
export const updateDdnsTask = (key: string, value: LuckyRecord) =>
  luckyFetch(`/api/ddns${query({ key })}`, { method: "PUT", body: JSON.stringify(value) });
export const deleteDdnsTask = (key: string) => luckyFetch(`/api/ddns${query({ key })}`, { method: "DELETE" });
export const setDdnsTaskEnabled = (key: string, enable: boolean) =>
  luckyFetch(`/api/ddns/enable${query({ enable, key })}`);
export const setDdnsTaskExpanded = (key: string, expanded: boolean) =>
  luckyFetch(`/api/ddns/expanded${query({ expanded, key })}`);
export const setDdnsIpSectionExpanded = (key: string, expanded: boolean) =>
  luckyFetch(`/api/ddns/ipsectionexpanded${query({ expanded, key })}`);
export const syncDdnsTask = (key: string) => luckyFetch(`/api/ddns/manualSync/${encodeURIComponent(key)}`);
export const getDdnsConfigure = (signal?: AbortSignal) => luckyFetch("/api/ddns/configure", { signal });
export const updateDdnsConfigure = (value: LuckyRecord) =>
  luckyFetch("/api/ddns/configure", { method: "PUT", body: JSON.stringify(value) });
export const getDdnsOdhcpdClients = (signal?: AbortSignal) => luckyFetch("/api/ddns/odhcpdclients", { signal });
export const testDdnsIpCommand = (iptype: string, command: string, signal?: AbortSignal) =>
  luckyFetch(`/api/ddns/getipfromcmdtest${query({ iptype, command })}`, { signal });
export const testDdnsWebhook = (key: string, value: LuckyRecord, signal?: AbortSignal) =>
  luckyFetch(`/api/ddns/webhooktest${query({ key })}`, { method: "POST", body: JSON.stringify(value), signal });
export const reorderDdnsTasks = (keys: unknown) =>
  luckyFetch("/api/ddns/taskorderadjustment", { method: "PUT", body: JSON.stringify(keys) });
export const reorderDdnsRecords = (taskKey: string, keys: unknown) =>
  luckyFetch(`/api/ddns/recordOrderadjustment/${encodeURIComponent(taskKey)}`, { method: "PUT", body: JSON.stringify(keys) });
export const deleteDdnsRecord = (taskKey: string, recordKey: string) =>
  luckyFetch(`/api/ddns/${encodeURIComponent(taskKey)}/${encodeURIComponent(recordKey)}`, { method: "DELETE" });
export const setDdnsRecordOption = (taskKey: string, recordKey: string, option: string) =>
  luckyFetch(`/api/ddns/${encodeURIComponent(taskKey)}/${encodeURIComponent(recordKey)}/option/${encodeURIComponent(option)}`, { method: "PUT" });
export const getDdnsLogs = (pageSize = 100, page = 1, signal?: AbortSignal) =>
  luckyFetch(`/api/ddns/logs${query({ pageSize, page })}`, { signal });
export const getDdnsLastLogs = (signal?: AbortSignal) => luckyFetch("/api/ddns/lastlogs", { signal });
