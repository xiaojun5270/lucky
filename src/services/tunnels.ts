import { luckyFetch } from '@/src/lib/lucky-fetch';
import type { LuckyRecord } from '@/src/types/lucky';

export type TunnelKind = 'stun' | 'cloudflared' | 'frp';
export type TunnelCollection = 'ingress' | 'proxies' | 'visitors';
export const tunnelTitles: Record<TunnelKind, string> = {
  stun: 'STUN 内网穿透', cloudflared: 'Cloudflared', frp: 'FRP 内网穿透',
};
export function isTunnelKind(value: unknown): value is TunnelKind {
  return value === 'stun' || value === 'cloudflared' || value === 'frp';
}
export function record(value: unknown): LuckyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LuckyRecord : {};
}
export function tunnelData(payload: LuckyRecord, field: string): LuckyRecord {
  for (const source of [payload, record(payload.data), record(payload.result)]) {
    if (source[field] && typeof source[field] === 'object' && !Array.isArray(source[field])) return record(source[field]);
  }
  throw new Error('服务端未返回完整配置，请刷新后重试');
}
export function tunnelItems(payload: LuckyRecord, field = 'list'): LuckyRecord[] {
  for (const source of [payload, record(payload.data), record(payload.result)]) {
    if (Array.isArray(source[field])) return (source[field] as unknown[]).filter((v): v is LuckyRecord => Boolean(v) && typeof v === 'object' && !Array.isArray(v));
    if (source[field] === null) return [];
  }
  throw new Error('服务端未返回列表数据');
}
const keyPath = (key: string) => {
  if (!key.trim()) throw new Error('规则标识缺失，请刷新列表');
  return encodeURIComponent(key);
};
const query = (values: LuckyRecord) => new URLSearchParams(Object.entries(values).map(([key, value]) => [key, String(value)])).toString();
const write = (path: string, method: 'POST' | 'PUT' | 'DELETE', value?: unknown) =>
  luckyFetch(path, { method, body: value === undefined ? undefined : JSON.stringify(value) });

export async function listTunnels(kind: TunnelKind, signal?: AbortSignal) {
  try {
    const raw = await luckyFetch(kind === 'stun' ? '/api/stunrulelist' : `/api/${kind}/list`, { signal });
    return { items: tunnelItems(raw), raw };
  } catch (error) {
    if (error instanceof Error && /(?:404|Request URL .*not found)/i.test(error.message)) throw new Error(`当前 Lucky 服务端未提供 ${tunnelTitles[kind]} 模块，请确认服务端版本和模块支持情况`);
    throw error;
  }
}
export async function getTunnel(kind: TunnelKind, key: string, signal?: AbortSignal) {
  const raw = await luckyFetch(kind === 'stun' ? `/api/stun/${keyPath(key)}` : `/api/${kind}/list/${keyPath(key)}`, { signal });
  const value = tunnelData(raw, kind === 'stun' ? 'rule' : 'instance');
  if (kind === 'stun') return { ...value, DiaglogShowMode: value.DiaglogShowMode || 'simple' };
  return kind === 'frp' ? { ...value, Proxies: value.Proxies ?? value.proxies ?? [], Visitors: value.Visitors ?? value.visitors ?? [] } : value;
}
export function saveTunnel(kind: TunnelKind, value: LuckyRecord, editing: boolean) {
  return write(kind === 'stun' ? '/api/stunrule' : `/api/${kind}/list`, editing ? 'PUT' : 'POST', value);
}
export function deleteTunnel(kind: TunnelKind, key: string) {
  keyPath(key);
  return write(kind === 'stun' ? `/api/stunrule?${query({ key })}` : `/api/${kind}/list/${keyPath(key)}`, 'DELETE');
}
export function enableTunnel(kind: TunnelKind, key: string, enable: boolean) {
  keyPath(key);
  return luckyFetch(kind === 'stun' ? `/api/stunrule/enable?${query({ key, enable })}` : `/api/${kind}/list/${keyPath(key)}/${enable}`);
}
export const reorderTunnels = (kind: TunnelKind, keys: string[]) =>
  write(kind === 'stun' ? '/api/stun/ruleorderadjustment' : `/api/${kind}/orderadjustment`, 'PUT', keys);
export const getStunSettings = async (signal?: AbortSignal) => tunnelData(await luckyFetch('/api/stun/configure', { signal }), 'configure');
export const saveStunSettings = (value: LuckyRecord) => write('/api/stun/configure', 'PUT', value);
export const testStunWebhook = (key: string, value: LuckyRecord) => write(`/api/stunrule/webhooktest?${query({ key: key || '666' })}`, 'POST', value);
export const getTunnelLogs = (kind: TunnelKind, key: string, page: number, signal?: AbortSignal) =>
  luckyFetch(`/api/${kind}/${key ? `${keyPath(key)}/` : ''}logs?${query({ pageSize: 100, page })}`, { signal });
export const getTunnelLastLogs = (kind: TunnelKind, key: string, signal?: AbortSignal) =>
  luckyFetch(`/api/${kind}/${keyPath(key)}/lastlogs`, { signal });
export const getFrpStatus = (key: string, signal?: AbortSignal) => luckyFetch(`/api/frp/${keyPath(key)}/status`, { signal });
export async function listTunnelChildren(kind: 'cloudflared' | 'frp', key: string, collection: TunnelCollection, signal?: AbortSignal) {
  const raw = await luckyFetch(`/api/${kind}/${keyPath(key)}/${collection}`, { signal });
  return tunnelItems(raw, collection === 'ingress' ? 'rules' : collection);
}
export function saveTunnelChild(kind: 'cloudflared' | 'frp', key: string, collection: TunnelCollection, value: LuckyRecord, previous?: LuckyRecord) {
  const data = !previous ? value : collection === 'ingress'
    ? { oldHostname: previous.hostname ?? '', oldPath: previous.path ?? '', newRule: value }
    : collection === 'proxies' ? { oldName: previous.name, newProxy: value } : { oldName: previous.name, newVisitor: value };
  return write(`/api/${kind}/${keyPath(key)}/${collection}`, previous ? 'PUT' : 'POST', data);
}
export function deleteTunnelChild(kind: 'cloudflared' | 'frp', key: string, collection: TunnelCollection, value: LuckyRecord) {
  const suffix = collection === 'ingress' ? `?${query({ hostname: value.hostname ?? '', path: value.path ?? '' })}` : `/${keyPath(String(value.name ?? ''))}`;
  return write(`/api/${kind}/${keyPath(key)}/${collection}${suffix}`, 'DELETE');
}
export function cloudflareDns(key: string, hostname: string, action: 'check' | 'create' | 'delete') {
  const path = `/api/cloudflared/${keyPath(key)}/cname/${action}`;
  return action === 'create' ? write(path, 'POST', { hostname, proxied: true })
    : action === 'delete' ? write(`${path}?${query({ hostname })}`, 'DELETE') : luckyFetch(`${path}?${query({ hostname })}`);
}

export function tunnelLogLines(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return value.split(/\r?\n/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(tunnelLogLines);
  const item = record(value);
  if (item.LogContent != null) return [`${item.LogTime ?? ''} ${String(item.LogContent)}`.trim()];
  for (const key of ['logs', 'lastLogs', 'LastLogs', 'data', 'result', 'Response', 'message', 'output']) {
    if (key in item) return tunnelLogLines(item[key]);
  }
  return [];
}
