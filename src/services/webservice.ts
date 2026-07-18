import { luckyFetch } from "@/src/lib/lucky-fetch";
import type { LuckyListItem, LuckyRecord } from "@/src/types/lucky";

function json(value: unknown) {
  return JSON.stringify(value);
}

function query(params: Record<string, string | number | undefined>) {
  const text = Object.entries(params)
    .filter(
      (entry): entry is [string, string | number] => entry[1] !== undefined,
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join("&");
  return text ? `?${text}` : "";
}

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function list(payload: LuckyRecord, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const wrappers = /^(?:data|result|response|payload)$/i;
  const queue: Array<{ value: unknown; depth: number; allowArray: boolean }> = [
    { value: payload, depth: 0, allowArray: true },
  ];
  const visited = new Set<object>();
  let emptyMatch: LuckyListItem[] | undefined;
  while (queue.length) {
    const { value, depth, allowArray } = queue.shift()!;
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      const records = value.filter(isRecord) as LuckyListItem[];
      if (allowArray && records.length) return records;
      if (allowArray) emptyMatch ??= records;
      if (depth < 5) value.forEach((item) => queue.push({ value: item, depth: depth + 1, allowArray: false }));
      continue;
    }
    const source = value as LuckyRecord;
    for (const [key, candidate] of Object.entries(source)) {
      if (!wanted.has(key.toLowerCase()) || !Array.isArray(candidate)) continue;
      const records = candidate.filter(isRecord) as LuckyListItem[];
      if (records.length) return records;
      emptyMatch ??= records;
    }
    if (depth >= 5) continue;
    const nested = Object.entries(source)
      .filter(([, candidate]) => Boolean(candidate) && typeof candidate === "object")
      .sort(([left], [right]) => Number(!wrappers.test(left)) - Number(!wrappers.test(right)));
    nested.forEach(([key, candidate]) => queue.push({
      value: candidate,
      depth: depth + 1,
      allowArray: wrappers.test(key),
    }));
  }
  return emptyMatch ?? [];
}

function record(payload: LuckyRecord, keys: string[]) {
  let value: LuckyRecord = payload;
  for (const wantedKey of keys) {
    const queue: Array<{ value: LuckyRecord; depth: number }> = [{ value: payload, depth: 0 }];
    const visited = new Set<object>();
    let found: LuckyRecord | undefined;
    while (queue.length && !found) {
      const current = queue.shift()!;
      if (visited.has(current.value)) continue;
      visited.add(current.value);
      for (const [key, candidate] of Object.entries(current.value)) {
        if (key.toLowerCase() === wantedKey.toLowerCase() && isRecord(candidate)) {
          found = candidate;
          break;
        }
      }
      if (current.depth >= 5) continue;
      for (const candidate of Object.values(current.value)) {
        if (isRecord(candidate)) queue.push({ value: candidate, depth: current.depth + 1 });
      }
    }
    if (found) {
      value = found;
      break;
    }
  }
  const result = { ...value };
  delete result.ret;
  delete result.msg;
  return result;
}

const WEB_SERVICE_GROUP_COUNT_CONCURRENCY = 4;
const WEB_SERVICE_GROUP_COUNT_KEYS = new Set([
  "subrulecount",
  "subrulenum",
  "subrulescount",
  "rulecount",
  "rulescount",
  "count",
]);

function toCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(0, Math.trunc(value));
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

function webServiceGroupSubRuleCount(value: LuckyRecord) {
  const queue: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const visited = new Set<object>();
  while (queue.length) {
    const current = queue.shift()!;
    const source = current.value;
    const directCount = toCount(source);
    if (directCount !== undefined) return directCount;
    if (!isRecord(source) || visited.has(source)) continue;
    visited.add(source);
    for (const [key, rawCount] of Object.entries(source)) {
      if (!WEB_SERVICE_GROUP_COUNT_KEYS.has(key.toLowerCase())) continue;
      const count = toCount(rawCount);
      if (count !== undefined) return count;
    }
    if (current.depth >= 4) continue;
    for (const candidate of Object.values(source)) {
      if (candidate && typeof candidate === "object") {
        queue.push({ value: candidate, depth: current.depth + 1 });
      }
    }
  }
  return undefined;
}

export const newWebServiceDefaultProxy = (): LuckyRecord => ({
  Key: "default",
  GroupKey: "",
  WebServiceType: "reverseproxy",
  Locations: [],
  CorazaWAFInstance: "",
  SafeIPMode: "blacklist",
  EasyLucky: false,
  LocationInsecureSkipVerify: true,
  UseTargetHost: false,
  AutoProxyLocation: false,
  AutoProxyLocationWithoutSameHost: false,
  EnableAccessLog: true,
  LogLevel: 4,
  AccessLogMaxNum: 256,
  WebListShowLastLogMaxCount: 10,
  RequestInfoLogFormat:
    "[#{clientIP}][#{remoteIP}]#{tab}[#{method}][#{host}#{url}]",
  RemoteIPHeaders: ["X-Forwarded-For", "X-Real-IP"],
  EnableBasicAuth: false,
  BasicAuthUserList: "",
  UseRuleGlobalAuthSettings: false,
  OtherParams: { WebAuth: false },
});

export const newWebServiceRule = (): LuckyRecord => ({
  RuleName: "",
  RuleKey: "",
  DiaglogShowMode: "simple",
  Enable: true,
  Network: "tcp6",
  ListenIP: "",
  ListenPort: 16666,
  IPFilterRule: "disable",
  CorazaWAFInstance: "",
  AutoOptionsFirewall: true,
  EnableTLS: false,
  TLSMinVersion: 2,
  MaxHeaderKBytes: 32,
  Http3: false,
  DefaultProxy: newWebServiceDefaultProxy(),
  ProxyList: [],
});

export const newWebServiceSubRule = (): LuckyRecord => ({
  Enable: true,
  Key: "",
  Remark: "",
  GroupKey: "",
  WebServiceType: "reverseproxy",
  Domains: [""],
  Locations: [""],
  CorazaWAFInstance: "",
  SafeIPMode: "blacklist",
  LocationInsecureSkipVerify: true,
  UseTargetHost: false,
  AutoProxyLocation: false,
  AutoProxyLocationWithoutSameHost: false,
  EnableAccessLog: true,
  LogLevel: 4,
  AccessLogMaxNum: 256,
  WebListShowLastLogMaxCount: 10,
  RequestInfoLogFormat:
    "[#{clientIP}][#{remoteIP}]#{tab}[#{method}][#{host}#{url}]",
  RemoteIPHeaders: ["X-Forwarded-For", "X-Real-IP"],
  EasyLucky: true,
  EnableBasicAuth: false,
  BasicAuthUserList: "",
  UseRuleGlobalAuthSettings: false,
  OtherParams: { WebAuth: false },
});

export async function getWebServiceCorazaInstances({ signal }: { signal?: AbortSignal } = {}) {
  const payload = await luckyFetch("/api/coraza/instancelist", { signal });
  return list(payload, ["list", "instanceList", "instances"]);
}

export async function getWebServiceIpFilterRules({ signal }: { signal?: AbortSignal } = {}) {
  const payload = await luckyFetch("/api/ipfliter/list", { signal });
  return list(payload, ["list", "rules", "ruleList"]);
}

export const newWebServiceGroup = (): LuckyRecord => ({ Key: "", Name: "" });

export const newWebServiceCgi = (): LuckyRecord => ({
  Key: "",
  Name: "",
  Enable: true,
  CGIType: "php",
  Network: "tcp",
  Address: "127.0.0.1:9000",
  MaxConns: 10,
  ConnectTimeout: 30,
  ForbiddenPaths: "",
  DefaultDocRoot: "",
  DefaultIndexNames: "index.php\n",
  FileExtensions: ".php",
});

export async function getWebServiceRules(lite = false, signal?: AbortSignal) {
  const payload = await luckyFetch(
    lite ? "/api/webservice/rules_lite" : "/api/webservice/rules",
    { signal },
  );
  return { items: list(payload, ["rules", "ruleList", "list"]), raw: payload };
}

export async function getWebServiceRule(key: string) {
  const payload = await luckyFetch(
    `/api/webservice/rule/${encodeURIComponent(key)}`,
  );
  return record(payload, ["rule", "data"]);
}

export function createWebServiceRule(value: LuckyRecord) {
  return luckyFetch("/api/webservice/rules", {
    method: "POST",
    body: json(value),
  });
}

export function updateWebServiceRule(key: string, value: LuckyRecord) {
  return luckyFetch(`/api/webservice/rule/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: json(value),
  });
}

export function deleteWebServiceRule(key: string) {
  return luckyFetch(`/api/webservice/rule/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

export function reorderWebServiceRules(keys: string[]) {
  return luckyFetch("/api/webservice/ruleorderadjustment", {
    method: "PUT",
    body: json(keys),
  });
}

export function getWebServiceSubRuleOption(
  ruleKey: string,
  subKey: string,
  option: string,
) {
  return luckyFetch(
    `/api/webservice/rule/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/${encodeURIComponent(option)}`,
  );
}

export function setWebServiceSubRuleEnabled(ruleKey: string, subKey: string, enabled: boolean) {
  return getWebServiceSubRuleOption(ruleKey, subKey, String(enabled));
}

export async function getWebServiceGroups(
  { signal, includeCounts = false }: { signal?: AbortSignal; includeCounts?: boolean } = {},
) {
  const payload = await luckyFetch("/api/webservice/groups", { signal });
  const items = list(payload, ["groups", "groupList", "list"]);
  if (!includeCounts) return { items, raw: payload };
  const enriched = items.map((item) => {
    const count = webServiceGroupSubRuleCount(item);
    return count === undefined ? item : { ...item, subRuleCount: count };
  });
  const missingIndexes = enriched.flatMap((item, index) => {
    const key = typeof item.Key === "string"
      ? item.Key
      : typeof item.key === "string"
        ? item.key
        : "";
    return key && webServiceGroupSubRuleCount(item) === undefined ? [index] : [];
  });
  let cursor = 0;
  const fillMissingCounts = async () => {
    while (cursor < missingIndexes.length) {
      const index = missingIndexes[cursor++];
      const item = enriched[index];
      const key = typeof item.Key === "string"
        ? item.Key
        : typeof item.key === "string"
          ? item.key
          : "";
      try {
        const response = await getWebServiceGroupSubRuleCount(key, signal);
        const count = webServiceGroupSubRuleCount(response);
        if (count !== undefined) enriched[index] = { ...item, subRuleCount: count };
      } catch (error) {
        if (signal?.aborted) throw error;
        // A failed count request must not hide the remaining groups.
      }
    }
  };
  await Promise.all(
    Array.from(
      {
        length: Math.min(
          WEB_SERVICE_GROUP_COUNT_CONCURRENCY,
          missingIndexes.length,
        ),
      },
      fillMissingCounts,
    ),
  );
  return { items: enriched, raw: payload };
}

export async function getWebServiceGroupOptions({ signal }: { signal?: AbortSignal } = {}) {
  const payload = await luckyFetch("/api/webservice/groups", { signal });
  return list(payload, ["list", "groups", "groupList"]);
}

export function createWebServiceGroup(value: LuckyRecord) {
  return luckyFetch("/api/webservice/groups", {
    method: "POST",
    body: json({ Name: value.Name }),
  });
}

export function updateWebServiceGroup(value: LuckyRecord) {
  return luckyFetch("/api/webservice/groups", {
    method: "PUT",
    body: json(value),
  });
}

export function deleteWebServiceGroup(key: string) {
  return luckyFetch(`/api/webservice/groups${query({ key })}`, {
    method: "DELETE",
  });
}

export function getWebServiceGroupSubRuleCount(
  groupKey: string,
  signal?: AbortSignal,
) {
  return luckyFetch(
    `/api/webservice/groups/subrulecount${query({ groupKey })}`,
    { signal },
  );
}

export function reorderWebServiceGroups(keys: string[]) {
  return luckyFetch("/api/webservice/groups/orderadjustment", {
    method: "PUT",
    body: json(keys),
  });
}

export async function getWebServiceCgiList({ signal }: { signal?: AbortSignal } = {}) {
  const payload = await luckyFetch("/api/webservice/cgi/list", { signal });
  return {
    items: list(payload, ["list", "cgiList", "instances"]),
    raw: payload,
  };
}

export function createWebServiceCgi(value: LuckyRecord) {
  return luckyFetch("/api/webservice/cgi", {
    method: "POST",
    body: json(value),
  });
}

export function updateWebServiceCgi(key: string, value: LuckyRecord) {
  return luckyFetch(`/api/webservice/cgi/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: json(value),
  });
}

export function deleteWebServiceCgi(key: string) {
  return luckyFetch(`/api/webservice/cgi/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
}

export function setWebServiceCgiEnabled(key: string, enabled: boolean) {
  return luckyFetch(
    `/api/webservice/cgi/${encodeURIComponent(key)}/${enabled ? "enable" : "disable"}`,
    { method: "PUT" },
  );
}

export async function getWebServiceSettings({ signal }: { signal?: AbortSignal } = {}) {
  const payload = await luckyFetch("/api/webservice/modulesettings/frontend", { signal });
  return record(payload, ["settings", "data"]);
}

export function updateWebServiceSettings(value: LuckyRecord) {
  return luckyFetch("/api/webservice/modulesettings", {
    method: "PUT",
    body: json(value),
  });
}

export function getWebServiceLogs(pageSize = 100, page = 1, signal?: AbortSignal) {
  return luckyFetch(`/api/webservice/logs${query({ pageSize, page })}`, { signal });
}

export function getWebServiceLastLogs({ signal }: { signal?: AbortSignal } = {}) {
  return luckyFetch("/api/webservice/lastlogs", { signal });
}

export function getWebServiceRuleLogs(
  ruleKey: string,
  subKey: string,
  pageSize = 100,
  page = 1,
  signal?: AbortSignal,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/logs${query({ pageSize, page })}`,
    { signal },
  );
}

export function getWebServiceRuleLastLogs(
  ruleKey: string,
  subKey: string,
  signal?: AbortSignal,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/lastlogs`,
    { signal },
  );
}

export function getWebServiceAccessDetails(
  ruleKey: string,
  subKey: string,
  pageSize = 100,
  page = 1,
  signal?: AbortSignal,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/accessdetail${query({ pageSize, page })}`,
    { signal },
  );
}

export function getWebServiceCorazaLogs(
  ruleKey: string,
  subKey: string,
  pageSize = 100,
  page = 1,
  signal?: AbortSignal,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/corazalogs${query({ pageSize, page })}`,
    { signal },
  );
}

export function getWebServiceHttpLogs(
  ruleKey: string,
  pageSize = 100,
  page = 1,
  signal?: AbortSignal,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/httpserver/logs${query({ pageSize, page })}`,
    { signal },
  );
}

export function disconnectWebServiceClient(ruleKey: string, clientKey: string) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/disconnect/${encodeURIComponent(clientKey)}`,
    { method: "DELETE" },
  );
}

export function flushWebServiceCache(ruleKey: string, subKey: string) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/flushcachedirspaceinfo`,
  );
}

export type WebServiceUploadFile = Blob | { uri: string; name: string; type?: string; file?: Blob };

export function uploadWebServiceFolder(
  ruleKey: string,
  subKey: string,
  mountIndex: number,
  file: WebServiceUploadFile,
) {
  if (typeof FormData === "undefined") throw new Error("当前运行环境不支持文件上传");
  const data = new FormData();
  const browserFile = typeof file === 'object' && file !== null && 'file' in file ? file.file : undefined;
  data.append('file', (browserFile ?? file) as Blob);
  data.append('mountIndex', String(mountIndex));
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/updatefolder/upload`,
    { method: 'POST', body: data, timeoutMs: 600000 },
  );
}

export function confirmWebServiceFolderUpdate(ruleKey: string, subKey: string, tempId: string) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/updatefolder/confirm`,
    { method: 'POST', body: json({ tempId }) },
  );
}

export function cancelWebServiceFolderUpdate(ruleKey: string, subKey: string, tempId: string) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/updatefolder/cancel/${encodeURIComponent(tempId)}`,
    { method: 'DELETE' },
  );
}

export function getWebServiceTipInfo({ signal }: { signal?: AbortSignal } = {}) {
  return luckyFetch("/api/webservice/tipinfo", { signal });
}

export function markWebServiceTipRead(version: string) {
  return luckyFetch("/api/webservice/tipread", {
    method: "PUT",
    body: json({ version }),
  });
}

export function getLightPanelConfigTemplate(value: LuckyRecord) {
  return luckyFetch("/api/webservice/lightpanel/configtemplate", {
    method: "POST",
    body: json(value),
  });
}
