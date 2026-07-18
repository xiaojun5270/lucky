import { createLuckyRequestNonce, luckyFetch } from '@/src/lib/lucky-fetch';
import { getDdnsLastLogs, getDdnsLogs, getDdnsTask, getDdnsTasks, setDdnsTaskEnabled, syncDdnsTask } from '@/src/services/ddns';
import { flushSslCertificate, getSslCertificate, getSslCertificates, getSslLastLogs, getSslLogs, setSslCertificateEnabled, syncSslCertificate } from '@/src/services/ssl';
import type { LuckyDashboard, LuckyListItem, LuckyLoginInput, LuckyRecord, LuckyServiceKind } from '@/src/types/lucky';

function body(value: LuckyRecord) {
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nestedArray(payload: unknown, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue: Array<{ value: unknown; depth: number; allowArray: boolean }> = [{ value: payload, depth: 0, allowArray: false }];
  const visited = new Set<object>();
  let emptyMatch: unknown[] | undefined;
  while (queue.length) {
    const { value, depth, allowArray } = queue.shift()!;
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      if (allowArray && value.length) return value;
      if (allowArray) emptyMatch ??= value;
      if (depth >= 4) continue;
      value.forEach((item) => queue.push({ value: item, depth: depth + 1, allowArray: false }));
      continue;
    }
    const record = value as LuckyRecord;
    for (const [key, candidate] of Object.entries(record)) {
      if (wanted.has(key.toLowerCase()) && Array.isArray(candidate)) {
        if (candidate.length) return candidate;
        emptyMatch ??= candidate;
      }
    }
    if (depth >= 4) continue;
    const nested = Object.entries(record).filter(([, candidate]) => Boolean(candidate) && typeof candidate === 'object');
    nested.sort(([left], [right]) =>
      Number(!/^(?:data|result|response|payload)$/i.test(left))
      - Number(!/^(?:data|result|response|payload)$/i.test(right)));
    nested.forEach(([key, candidate]) => queue.push({
      value: candidate,
      depth: depth + 1,
      allowArray: Array.isArray(candidate) && /^(?:data|result|response|payload)$/i.test(key),
    }));
  }
  return emptyMatch;
}

function firstArray(payload: LuckyRecord, keys: string[]): LuckyListItem[] {
  return (nestedArray(payload, keys) ?? []).filter(isRecord) as LuckyListItem[];
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
  let payload: LuckyRecord;
  try {
    const twoFACode = input.twoFACode?.trim() ?? '';
    response = await fetch(`${input.baseUrl.trim().replace(/\/+$/, '')}/api/login?_=${createLuckyRequestNonce()}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body({ Account: input.account.trim(), Password: input.password, TwoFA: '', TwoFACode: twoFACode }),
      signal: controller.signal,
    });
    try {
      payload = await response.json() as LuckyRecord;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new Error(response.ok ? '登录失败：服务器返回了无法识别的数据' : `登录失败（HTTP ${response.status}）`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('登录超时，请检查服务器地址');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const ret = typeof payload.ret === 'number'
    ? payload.ret
    : typeof payload.ret === 'string' && payload.ret.trim() !== ''
      ? Number(payload.ret)
      : undefined;
  if (!response.ok || ret !== 0) throw new Error(typeof payload.msg === 'string' ? payload.msg : '登录失败');
  const nested = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as LuckyRecord : {};
  const token = [payload.token, payload.Token, payload.AdminToken, payload.LuckyAdminToken,
    typeof payload.data === 'string' ? payload.data : undefined,
    nested.token, nested.Token, nested.AdminToken, nested.LuckyAdminToken,
    response.headers.get('Lucky-Admin-Token')]
    .find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined;
  if (!token) throw new Error('登录成功但响应中没有 Token，请在联调环境确认登录响应字段');
  return token;
}

function luckyModuleItems(modules: LuckyRecord): LuckyListItem[] {
  const standardModules = nestedArray(modules, ['Modules', 'modules']) ?? [];
  const extraModules = nestedArray(modules, ['extraModules', 'ExtraModules']) ?? [];
  const moduleItems = [...standardModules, ...extraModules]
    .map((value): LuckyListItem | undefined => typeof value === 'string'
      ? { Key: value, Name: value, Enable: true }
      : isRecord(value) ? value as LuckyListItem : undefined)
    .filter((value): value is LuckyListItem => Boolean(value));
  if (!moduleItems.length) return firstArray(modules, ['list', 'Modules', 'modules', 'moduleList', 'extraModules']);
  const seen = new Set<string>();
  return moduleItems.filter((item, index) => {
    const key = String(item.Key ?? item.key ?? item.Name ?? item.name ?? index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function getLuckyModules() {
  return luckyModuleItems(await luckyFetch('/api/modules/list'));
}

export async function getLuckyDashboard(): Promise<LuckyDashboard> {
  const [status, info, modules, version] = await Promise.all([
    luckyFetch('/api/status'),
    luckyFetch('/api/info'),
    luckyFetch('/api/modules/list'),
    luckyFetch('/version'),
  ]);
  return {
    status,
    info: { ...info, ...version },
    modules: luckyModuleItems(modules),
  };
}

const serviceEndpoints: Record<LuckyServiceKind, { path: string; keys: string[] }> = {
  webservice: { path: '/api/webservice/rules', keys: ['rules', 'ruleList', 'list'] },
  ddns: { path: '/api/ddnstasklist', keys: ['taskList', 'list', 'ddnsTaskList'] },
  docker: { path: '/api/docker/containers?all=true&includeStats=true&includeNetworkMode=true', keys: ['containers', 'list', 'data'] },
  ssl: { path: '/api/ssl', keys: ['list', 'sslList', 'certificates'] },
};

export async function getServiceItems(kind: LuckyServiceKind, signal?: AbortSignal) {
  if (kind === 'ddns') return getDdnsTasks(signal);
  if (kind === 'ssl') return getSslCertificates(signal);
  const endpoint = serviceEndpoints[kind];
  const payload = await luckyFetch(endpoint.path, { signal });
  return { items: firstArray(payload, endpoint.keys), raw: payload };
}

export async function getLogs(module?: LuckyServiceKind, signal?: AbortSignal) {
  const payload = await luckyFetch(module ? `/api/${module}/logs` : '/api/logs', { signal });
  return extractLogLines(payload);
}

export async function getGlobalLogBatch(pre = '', signal?: AbortSignal) {
  const payload = await luckyFetch(`/api/logs${query({ pre: pre || undefined })}`, { signal });
  return globalLogBatch(payload, pre);
}

const detailPaths: Record<LuckyServiceKind, (key: string) => string> = {
  webservice: (key) => `/api/webservice/rule/${key}`,
  ddns: (key) => `/api/ddns/task/${key}`,
  docker: (key) => `/api/docker/containers/${key}`,
  ssl: (key) => `/api/ssl/${key}`,
};

export async function getServiceDetail(kind: LuckyServiceKind, key: string, signal?: AbortSignal) {
  if (kind === 'ddns') return getDdnsTask(key, signal);
  if (kind === 'ssl') return getSslCertificate(key, signal);
  return luckyFetch(detailPaths[kind](encodeURIComponent(key)), { signal });
}

const logTextKeys = [
  'log', 'Log', 'message', 'Message', 'content', 'Content', 'LogContent',
  'text', 'Text', 'line', 'Line', 'output', 'Output',
];
const logCollectionKeys = [
  'logs', 'Logs', 'lastLogs', 'LastLogs', 'lastlogs', 'rows', 'Rows',
  'entries', 'Entries', 'records', 'Records', 'items', 'Items', 'list', 'List',
];
const logWrapperKeys = ['data', 'Data', 'result', 'Result', 'response', 'Response', 'payload', 'Payload'];
const logEnvelopeKeys = new Set([
  'ret', 'msg', 'code', 'success', 'total', 'Total', 'totalCount', 'TotalCount', 'logsCount', 'LogsCount',
  'count', 'Count', 'page', 'Page', 'pageSize', 'PageSize', 'currentPage', 'CurrentPage',
]);

function appendLogLines(value: unknown, lines: string[], seen = new Set<object>(), allowFallback = true) {
  if (typeof value === 'string') {
    lines.push(...value.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim().length > 0));
    return lines.length > 0;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    lines.push(String(value));
    return true;
  }
  if (Array.isArray(value)) {
    const before = lines.length;
    for (const item of value) appendLogLines(item, lines, seen, true);
    return lines.length > before;
  }
  if (isRecord(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    let recognizedEnvelope = false;

    // A log entry can carry several aliases for the same message. Use the
    // first populated field so the UI does not render duplicate lines.
    for (const key of logTextKeys) {
      if (value[key] === undefined || value[key] === null) continue;
      recognizedEnvelope = true;
      const before = lines.length;
      appendLogLines(value[key], lines, seen, true);
      if (lines.length > before) return true;
    }
    if (value.msg !== undefined && ['timestamp', 'Timestamp', 'time', 'Time', 'level', 'Level', 'LogTime']
      .some((key) => value[key] !== undefined)) {
      recognizedEnvelope = true;
      const before = lines.length;
      appendLogLines(value.msg, lines, seen, true);
      if (lines.length > before) return true;
    }
    for (const key of logCollectionKeys) {
      if (value[key] === undefined || value[key] === null) continue;
      recognizedEnvelope = true;
      const before = lines.length;
      appendLogLines(value[key], lines, seen, true);
      if (lines.length > before) return true;
    }
    for (const key of logWrapperKeys) {
      if (value[key] === undefined || value[key] === null) continue;
      recognizedEnvelope = true;
      const before = lines.length;
      appendLogLines(value[key], lines, seen, true);
      if (lines.length > before) return true;
    }

    // Some Lucky builds add one more named wrapper around the normal log
    // envelope. Walk object values as a final structured fallback.
    let sawNestedValue = false;
    for (const [key, nested] of Object.entries(value)) {
      if (logEnvelopeKeys.has(key) || logTextKeys.includes(key) || logCollectionKeys.includes(key) || logWrapperKeys.includes(key)) continue;
      if (!nested || typeof nested !== 'object') continue;
      sawNestedValue = true;
      const before = lines.length;
      appendLogLines(nested, lines, seen, false);
      if (lines.length > before) return true;
    }
    if (recognizedEnvelope || sawNestedValue) return false;
    if (allowFallback) {
      const visible = Object.fromEntries(Object.entries(value).filter(([key]) => !logEnvelopeKeys.has(key)));
      if (Object.keys(visible).length) {
        lines.push(JSON.stringify(visible));
        return true;
      }
    }
  }
  return false;
}

function nestedLogNumber(payload: LuckyRecord, keys: string[]) {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: payload, depth: 0 }];
  const seen = new Set<object>();
  while (queue.length) {
    const { value, depth } = queue.shift()!;
    if (!isRecord(value) || seen.has(value)) continue;
    seen.add(value);
    for (const key of keys) {
      const raw = value[key];
      const number = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
      if (Number.isFinite(number) && number >= 0) return Math.trunc(number);
    }
    if (depth >= 3) continue;
    for (const key of [...logWrapperKeys, 'pagination', 'Pagination', 'meta', 'Meta']) {
      if (isRecord(value[key])) queue.push({ value: value[key], depth: depth + 1 });
    }
  }
  return undefined;
}

function nestedLogCollection(payload: LuckyRecord): unknown[] | string | undefined {
  const queue: unknown[] = [payload];
  const seen = new Set<object>();
  while (queue.length) {
    const value = queue.shift();
    if (!isRecord(value) || seen.has(value)) continue;
    seen.add(value);
    for (const key of logCollectionKeys) {
      const candidate = value[key];
      if (Array.isArray(candidate) || typeof candidate === 'string') return candidate;
    }
    for (const key of logWrapperKeys) {
      const nested = value[key];
      if (isRecord(nested)) queue.push(nested);
      else if (Array.isArray(nested) || typeof nested === 'string') return nested;
    }
  }
  return undefined;
}

function logEntryCursor(value: unknown) {
  if (!isRecord(value)) return '';
  for (const key of ['timestamp', 'Timestamp', 'timeStamp', 'TimeStamp', 'LogTimestamp', 'logTimestamp']) {
    const cursor = value[key];
    if (typeof cursor === 'string' && cursor.trim()) return cursor.trim();
    if (typeof cursor === 'number' && Number.isFinite(cursor)) return String(cursor);
  }
  return '';
}

function compareLogCursor(left: string, right: string) {
  if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
    const normalizedLeft = left.replace(/^0+(?=\d)/, '');
    const normalizedRight = right.replace(/^0+(?=\d)/, '');
    if (normalizedLeft.length !== normalizedRight.length) return normalizedLeft.length - normalizedRight.length;
    return normalizedLeft.localeCompare(normalizedRight);
  }
  return left.localeCompare(right);
}

function logStartTime(payload: LuckyRecord) {
  for (const source of [payload, payload.data, payload.result]) {
    if (!isRecord(source)) continue;
    for (const key of ['starttime', 'startTime', 'StartTime']) {
      const value = source[key];
      if (typeof value === 'string' || typeof value === 'number') return String(value);
    }
  }
  return '';
}

function extractLogValue(value: unknown) {
  const lines: string[] = [];
  appendLogLines(value, lines);
  return lines;
}

function globalLogBatch(payload: LuckyRecord, previousCursor: string) {
  const collection = nestedLogCollection(payload);
  const entries = Array.isArray(collection) ? collection : undefined;
  const cursors = entries?.map(logEntryCursor) ?? [];
  const supportsCursor = entries !== undefined && (entries.length ? cursors.every(Boolean) : Boolean(previousCursor));
  const latestCursor = supportsCursor ? cursors[cursors.length - 1] : previousCursor;
  const reset = Boolean(previousCursor && latestCursor && compareLogCursor(latestCursor, previousCursor) < 0);
  const selectedEntries = supportsCursor && previousCursor && !reset
    ? entries!.filter((_, index) => compareLogCursor(cursors[index], previousCursor) > 0)
    : entries;
  const lines = selectedEntries ? extractLogValue(selectedEntries) : extractLogLines(payload);
  return {
    lines,
    raw: payload,
    cursor: latestCursor,
    startTime: logStartTime(payload),
    incremental: supportsCursor,
    reset,
  };
}

function logResult(payload: LuckyRecord, page = 1, requestedPageSize = 100, paged = true) {
  const lines = extractLogLines(payload);
  const responsePageSize = nestedLogNumber(payload, ['pageSize', 'PageSize', 'limit', 'Limit']);
  const pageSize = responsePageSize && responsePageSize > 0 ? responsePageSize : requestedPageSize;
  const total = nestedLogNumber(payload, ['total', 'Total', 'totalCount', 'TotalCount', 'logsCount', 'LogsCount', 'count', 'Count']);
  const collection = nestedLogCollection(payload);
  const entryCount = Array.isArray(collection)
    ? collection.length
    : typeof collection === 'string'
      ? collection.split(/\r?\n/).filter((line) => line.trim()).length
      : lines.length;
  const hasMore = paged && (total !== undefined ? page * pageSize < total : entryCount >= pageSize);
  return { lines, raw: payload, total, pageSize, page, hasMore };
}

export async function getServiceLogs(kind: LuckyServiceKind, key?: string, signal?: AbortSignal, page = 1) {
  if (kind === 'ddns') {
    const payload = await getDdnsLogs(100, page, signal);
    return logResult(payload, page);
  }
  if (kind === 'ssl') {
    const payload = await getSslLogs(key ?? '', 100, page, signal);
    return logResult(payload, page);
  }
  const safeKey = key ? encodeURIComponent(key) : undefined;
  const path = kind === 'docker' && safeKey
    ? `/api/docker/containers/${safeKey}/logs${query({ tail: 100, timestamps: true })}`
    : `/api/${kind}/logs${query({ pageSize: 100, page })}`;
  const payload = await luckyFetch(path, { signal });
  return logResult(payload, page, 100, !(kind === 'docker' && safeKey));
}

function extractLogLines(payload: LuckyRecord) {
  return extractLogValue(payload);
}

export async function getServiceLastLogs(kind: LuckyServiceKind, key?: string, signal?: AbortSignal) {
  if (kind === 'ddns') {
    const payload = await getDdnsLastLogs(signal);
    return logResult(payload, 1, 100, false);
  }
  if (kind === 'ssl') {
    const payload = await getSslLastLogs(key ?? '', signal);
    return logResult(payload, 1, 100, false);
  }
  if (kind === 'docker') return getServiceLogs(kind, key, signal, 1);
  const payload = await luckyFetch(`/api/${kind}/lastlogs`, { signal });
  return logResult(payload, 1, 100, false);
}

export async function setServiceEnabled(kind: LuckyServiceKind, key: string, enabled: boolean) {
  if (kind === 'ddns') return setDdnsTaskEnabled(key, enabled);
  if (kind === 'ssl') return setSslCertificateEnabled(key, enabled);
  throw new Error('该模块不支持直接启停');
}

export async function runServiceAction(kind: LuckyServiceKind, key: string, action: string) {
  const safeKey = encodeURIComponent(key);
  if (kind === 'docker') {
    const actionBody = action === 'stop' || action === 'restart' ? { timeout: 10 } : {};
    return luckyFetch(`/api/docker/containers/${safeKey}/${action}`, { method: 'POST', body: body(actionBody) });
  }
  if (kind === 'ddns' && action === 'sync') {
    return syncDdnsTask(key);
  }
  if (kind === 'ssl' && action === 'sync') {
    return syncSslCertificate(key);
  }
  if (kind === 'ssl' && action === 'flush') {
    return flushSslCertificate(key);
  }
  throw new Error('不支持的操作');
}

export async function logoutLucky() {
  return luckyFetch('/api/logout', { method: 'PUT', body: '{}' });
}
