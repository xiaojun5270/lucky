import { luckyFetch } from '@/src/lib/lucky-fetch';
import type { LuckyDashboard, LuckyListItem, LuckyLoginInput, LuckyRecord, LuckyServiceKind } from '@/src/types/lucky';

function body(value: LuckyRecord) {
  return JSON.stringify(value);
}

function firstArray(payload: LuckyRecord, keys: string[]): LuckyListItem[] {
  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key] as LuckyListItem[];
  }
  return [];
}

export async function loginToLucky(input: LuckyLoginInput) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(`${input.baseUrl.trim().replace(/\/$/, '')}/api/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body({ Account: input.account, Password: input.password, TwoFACode: input.twoFACode ?? '' }),
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
  const [status, info, modules] = await Promise.all([
    luckyFetch('/api/status'),
    luckyFetch('/api/info'),
    luckyFetch('/api/modules/list'),
  ]);
  return {
    status,
    info,
    modules: firstArray(modules, ['list', 'modules', 'moduleList']),
  };
}

const serviceEndpoints: Record<LuckyServiceKind, { path: string; keys: string[] }> = {
  webservice: { path: '/api/webservice/rules', keys: ['rules', 'ruleList', 'list'] },
  ddns: { path: '/api/ddnstasklist', keys: ['taskList', 'list', 'ddnsTaskList'] },
  docker: { path: '/api/docker/containers', keys: ['containers', 'list', 'data'] },
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

export async function runServiceAction(kind: LuckyServiceKind, key: string, action: string) {
  const safeKey = encodeURIComponent(key);
  if (kind === 'docker') {
    return luckyFetch(`/api/docker/containers/${safeKey}/${action}`, { method: 'POST', body: '{}' });
  }
  if (kind === 'ddns' && action === 'sync') {
    return luckyFetch(`/api/ddns/manualSync/${safeKey}`, { method: 'PUT', body: '{}' });
  }
  if (kind === 'ssl' && action === 'sync') {
    return luckyFetch(`/api/ssl/manualsync/${safeKey}`, { method: 'PUT', body: '{}' });
  }
  throw new Error('不支持的操作');
}

export async function logoutLucky() {
  return luckyFetch('/api/logout', { method: 'PUT', body: '{}' });
}
