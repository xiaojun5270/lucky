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
  for (const source of [payload, payload.data, payload.result]) {
    if (Array.isArray(source))
      return source.filter(isRecord) as LuckyListItem[];
    if (!isRecord(source)) continue;
    for (const key of keys)
      if (Array.isArray(source[key]))
        return (source[key] as unknown[]).filter(isRecord) as LuckyListItem[];
  }
  return [];
}

function record(payload: LuckyRecord, keys: string[]) {
  for (const key of keys)
    if (isRecord(payload[key])) return payload[key] as LuckyRecord;
  return payload;
}

export const newWebServiceRule = (): LuckyRecord => ({
  RuleName: "",
  RuleKey: "",
  DiaglogShowMode: "simple",
  Enable: true,
  Network: "tcp6",
  ListenIP: "",
  ListenPort: 16666,
  AutoOptionsFirewall: true,
  EnableTLS: false,
  TLSMinVersion: 2,
  MaxHeaderKBytes: 32,
  Http3: false,
  DefaultProxy: {
    Key: "default",
    WebServiceType: "reverseproxy",
    Locations: [],
    EnableAccessLog: false,
    LogLevel: 4,
    AccessLogMaxNum: 256,
    WebListShowLastLogMaxCount: 10,
    LocationInsecureSkipVerify: true,
    RemoteIPHeaders: ["X-Forwarded-For", "X-Real-IP"],
    EasyLucky: true,
    OtherParams: {},
  },
  ProxyList: [],
});

export const newWebServiceSubRule = (): LuckyRecord => ({
  Enable: true,
  Key: "",
  Remark: "",
  DiaglogShowMode: "simple",
  GroupKey: "",
  WebServiceType: "reverseproxy",
  Domains: [""],
  Locations: [""],
  CorazaWAFKey: "",
  LocationInsecureSkipVerify: true,
  UseTargetHost: false,
  AutoRedirect: false,
  EnableAccessLog: false,
  LogLevel: 4,
  AccessLogMaxNum: 256,
  WebListShowLastLogMaxCount: 10,
  RequestInfoLogFormat:
    "[#{clientIP}][#{remoteIP}]#{tab}[#{method}][#{host}#{url}]",
  RemoteIPHeaders: ["X-Forwarded-For", "X-Real-IP"],
  EasyLucky: true,
  EnableBasicAuth: false,
  BasicAuthUser: "",
  BasicAuthPasswd: "",
  EnableWebAuth: false,
  OtherParams: {},
});

export async function getWebServiceCorazaInstances() {
  const payload = await luckyFetch("/api/coraza/instancelist");
  return list(payload, ["list", "instanceList", "instances"]);
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

export async function getWebServiceRules(lite = false) {
  const payload = await luckyFetch(
    lite ? "/api/webservice/rules_lite" : "/api/webservice/rules",
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

export async function getWebServiceGroups() {
  const payload = await luckyFetch("/api/webservice/groups");
  const items = list(payload, ["groups", "groupList", "list"]);
  const enriched = await Promise.all(
    items.map(async (item) => {
      const key = typeof item.Key === "string" ? item.Key : "";
      if (!key) return item;
      try {
        const count = await getWebServiceGroupSubRuleCount(key);
        return {
          ...item,
          subRuleCount: count.count ?? count.subRuleCount ?? 0,
        };
      } catch {
        return item;
      }
    }),
  );
  return { items: enriched, raw: payload };
}

export async function getWebServiceGroupOptions() {
  const payload = await luckyFetch("/api/webservice/groups");
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

export function getWebServiceGroupSubRuleCount(groupKey: string) {
  return luckyFetch(
    `/api/webservice/groups/subrulecount${query({ groupKey })}`,
  );
}

export function reorderWebServiceGroups(keys: string[]) {
  return luckyFetch("/api/webservice/groups/orderadjustment", {
    method: "PUT",
    body: json(keys),
  });
}

export function reorderWebServiceGroupSubRules(
  ruleKey: string,
  value: unknown,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/subrulegrouporderupdate`,
    { method: "PUT", body: json(value) },
  );
}

export async function getWebServiceCgiList() {
  const payload = await luckyFetch("/api/webservice/cgi/list");
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

export async function getWebServiceSettings() {
  const payload = await luckyFetch("/api/webservice/modulesettings/frontend");
  return record(payload, ["settings", "data"]);
}

export function updateWebServiceSettings(value: LuckyRecord) {
  return luckyFetch("/api/webservice/modulesettings", {
    method: "PUT",
    body: json(value),
  });
}

export function getWebServiceLogs(pageSize = 100, page = 1) {
  return luckyFetch(`/api/webservice/logs${query({ pageSize, page })}`);
}

export function getWebServiceLastLogs() {
  return luckyFetch("/api/webservice/lastlogs");
}

export function getWebServiceRuleLogs(
  ruleKey: string,
  subKey: string,
  pageSize = 100,
  page = 1,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/logs${query({ pageSize, page })}`,
  );
}

export function getWebServiceRuleLastLogs(ruleKey: string, subKey: string) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/lastlogs`,
  );
}

export function getWebServiceAccessDetails(
  ruleKey: string,
  subKey: string,
  pageSize = 100,
  page = 1,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/accessdetail${query({ pageSize, page })}`,
  );
}

export function getWebServiceCorazaLogs(
  ruleKey: string,
  subKey: string,
  pageSize = 100,
  page = 1,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/${encodeURIComponent(subKey)}/corazalogs${query({ pageSize, page })}`,
  );
}

export function getWebServiceHttpLogs(
  ruleKey: string,
  pageSize = 100,
  page = 1,
) {
  return luckyFetch(
    `/api/webservice/${encodeURIComponent(ruleKey)}/httpserver/logs${query({ pageSize, page })}`,
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

export type WebServiceUploadFile = Blob | { uri: string; name: string; type?: string };

export function uploadWebServiceFolder(
  ruleKey: string,
  subKey: string,
  mountIndex: number,
  file: WebServiceUploadFile,
) {
  const data = new FormData();
  data.append('file', file as Blob);
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

export function getWebServiceTipInfo() {
  return luckyFetch("/api/webservice/tipinfo");
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
