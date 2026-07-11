import { createLuckyRequestNonce, luckyFetch } from '@/src/lib/lucky-fetch';
import type { LuckyDashboard, LuckyListItem, LuckyLoginInput, LuckyRecord, LuckyServiceKind } from '@/src/types/lucky';

function body(value: LuckyRecord) {
  return JSON.stringify(value);
}

function firstArray(payload: LuckyRecord, keys: string[]): LuckyListItem[] {
  for (const source of [payload, payload.data, payload.result]) {
    if (Array.isArray(source)) return source.filter(isRecord) as LuckyListItem[];
    if (!isRecord(source)) continue;
    for (const key of keys) {
      if (Array.isArray(source[key])) return (source[key] as unknown[]).filter(isRecord) as LuckyListItem[];
    }
  }
  return [];
}

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function query(params: Record<string, string | number | boolean | undefined>) {
  const value = Object.entries(params)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
    .map(([key, item]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)
    .join('&');
  return value ? `?${value}` : '';
}

export async function loginToLucky(input: LuckyLoginInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`${input.baseUrl.trim().replace(/\/$/, '')}/api/login?_=${createLuckyRequestNonce()}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body({ Account: input.account.trim(), Password: input.password, TwoFA: '' }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('登录超时，请检查服务器地址');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json() as LuckyRecord;
  if (!response.ok || payload.ret !== 0) throw new Error(typeof payload.msg === 'string' ? payload.msg : '登录失败');
  const nested = payload.data && typeof payload.data === 'object' ? payload.data as LuckyRecord : {};
  const token = [payload.token, payload.Token, payload.AdminToken, payload.LuckyAdminToken, nested.token, nested.Token,
    response.headers.get('Lucky-Admin-Token')]
    .find((value) => typeof value === 'string') as string | undefined;
  if (!token) throw new Error('登录成功但响应中没有 Token，请在联调环境确认登录响应字段');
  return token;
}

export async function getLuckyDashboard(): Promise<LuckyDashboard> {
  const [status, info, modules, version] = await Promise.all([
    luckyFetch('/api/status'),
    luckyFetch('/api/info'),
    luckyFetch('/api/modules/list'),
    luckyFetch('/version'),
  ]);
  const standardModules = Array.isArray(modules.Modules) ? modules.Modules : [];
  const extraModules = Array.isArray(modules.extraModules) ? modules.extraModules : [];
  const moduleItems = [...standardModules, ...extraModules]
    .filter((value): value is string => typeof value === 'string')
    .map((name) => ({ Key: name, Name: name, Enable: true }));
  return {
    status,
    info: { ...info, ...version },
    modules: moduleItems.length ? moduleItems : firstArray(modules, ['list', 'modules', 'moduleList']),
  };
}

const serviceEndpoints: Record<LuckyServiceKind, { path: string; keys: string[] }> = {
  webservice: { path: '/api/webservice/rules', keys: ['rules', 'ruleList', 'list'] },
  ddns: { path: '/api/ddnstasklist', keys: ['taskList', 'list', 'ddnsTaskList'] },
  docker: { path: '/api/docker/containers?all=true&includeStats=true&includeNetworkMode=true', keys: ['containers', 'list', 'data'] },
  ssl: { path: '/api/ssl', keys: ['list', 'sslList', 'certificates'] },
};

export async function getServiceItems(kind: LuckyServiceKind) {
  const endpoint = serviceEndpoints[kind];
  const payload = await luckyFetch(endpoint.path);
  return { items: firstArray(payload, endpoint.keys), raw: payload };
}

export async function getLogs(module?: LuckyServiceKind) {
  const payload = await luckyFetch(module ? `/api/${module}/logs` : '/api/logs');
  const value = payload.logs ?? payload.list ?? payload.text ?? payload.data ?? '';
  if (Array.isArray(value)) return value.map((line) => typeof line === 'string' ? line : JSON.stringify(line));
  return String(value || '').split('\n').filter(Boolean);
}

const detailPaths: Record<LuckyServiceKind, (key: string) => string> = {
  webservice: (key) => `/api/webservice/rule/${key}`,
  ddns: (key) => `/api/ddns/task/${key}`,
  docker: (key) => `/api/docker/containers/${key}`,
  ssl: (key) => `/api/ssl/${key}`,
};

export async function getServiceDetail(kind: LuckyServiceKind, key: string) {
  return luckyFetch(detailPaths[kind](encodeURIComponent(key)));
}

function appendLogLines(value: unknown, lines: string[]) {
  if (typeof value === 'string') {
    lines.push(...value.split('\n').filter(Boolean));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) appendLogLines(item, lines);
    return;
  }
  if (isRecord(value)) {
    const text = value.log ?? value.Log ?? value.message ?? value.Message ?? value.content ?? value.Content;
    lines.push(typeof text === 'string' ? text : JSON.stringify(value));
  }
}

export async function getServiceLogs(kind: LuckyServiceKind, key?: string) {
  const safeKey = key ? encodeURIComponent(key) : undefined;
  const path = kind === 'docker' && safeKey
    ? `/api/docker/containers/${safeKey}/logs${query({ tail: 100, timestamps: true })}`
    : kind === 'ssl'
      ? `/api/ssl/logs${query({ key, pageSize: 100, page: 1 })}`
      : `/api/${kind}/logs${query({ pageSize: 100, page: 1 })}`;
  const payload = await luckyFetch(path);
  const candidates = [payload.logs, payload.list, payload.data, payload.text, payload.result];
  const lines: string[] = [];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      appendLogLines(candidate, lines);
      if (lines.length) break;
    }
  }
  return { lines, raw: payload };
}

export async function setServiceEnabled(kind: LuckyServiceKind, key: string, enabled: boolean) {
  const safeKey = encodeURIComponent(key);
  if (kind === 'ddns') return luckyFetch(`/api/ddns/enable${query({ enable: enabled, key })}`);
  if (kind === 'ssl') return luckyFetch(`/api/ssl/${safeKey}${query({ enable: enabled })}`, { method: 'PUT' });
  throw new Error('该模块不支持直接启停');
}

export async function runServiceAction(kind: LuckyServiceKind, key: string, action: string) {
  const safeKey = encodeURIComponent(key);
  if (kind === 'docker') {
    const actionBody = action === 'stop' || action === 'restart' ? { timeout: 10 } : {};
    return luckyFetch(`/api/docker/containers/${safeKey}/${action}`, { method: 'POST', body: body(actionBody) });
  }
  if (kind === 'ddns' && action === 'sync') {
    return luckyFetch(`/api/ddns/manualSync/${safeKey}`);
  }
  if (kind === 'ssl' && action === 'sync') {
    return luckyFetch(`/api/ssl/manualsync/${safeKey}`);
  }
  throw new Error('不支持的操作');
}

export async function logoutLucky() {
  return luckyFetch('/api/logout', { method: 'PUT', body: '{}' });
}
