import { LUCKY_ENDPOINTS, LUCKY_MODULES } from '@/src/api/lucky-endpoints.generated';
import { LuckyAuthError, refreshLuckyToken, withLuckyRequestNonce } from '@/src/lib/lucky-fetch';
import { endLuckySession, luckySessionState } from '@/src/store/lucky-session';
import type {
  LuckyEndpointCall,
  LuckyEndpointDefinition,
  LuckyHttpMethod,
  LuckyRecord,
} from '@/src/types/lucky';

export type LuckyEndpointResult = {
  status: number;
  contentType: string;
  filename?: string;
  kind: 'json' | 'text' | 'binary' | 'empty';
  data?: unknown;
  byteLength?: number;
  blob?: Blob;
};

type LuckyEndpointQuery = LuckyRecord | unknown[];
type LuckyEndpointRunnerCall = Omit<LuckyEndpointCall, 'query'> & { query?: LuckyEndpointQuery };

const dangerousGetActions = /\/(reboot_program|restoreconfigureconfirm|update\/comfire|manualsync|[^/]*flush[^/]*|enable|expanded|ipsectionexpanded|wakeup|shutdown|restart|start|stop|down|up|prune|remove|build|pull|push|import|export|load|dojobs|cancel|[^/]*test|[^/]*orderadjustment)(\/|$)/i;
const longRunningActions = /\/(upload|import|load|restore|export|build|pull|push|backup|download)(?:[/?]|$)/i;

export function getLuckyModules() {
  return LUCKY_MODULES;
}

export function getLuckyEndpoints(module?: string) {
  return module ? LUCKY_ENDPOINTS.filter((endpoint) => endpoint.module === module) : LUCKY_ENDPOINTS;
}

export function getLuckyEndpoint(id: string) {
  return LUCKY_ENDPOINTS.find((endpoint) => endpoint.id === id);
}

export function isDangerousLuckyRequest(endpoint: LuckyEndpointDefinition, method: LuckyHttpMethod, dynamicPath = '') {
  if (method !== 'GET') return true;
  const candidate = dynamicPath.trim()
    ? `${endpoint.path.replace(/\/+$/, '')}/${dynamicPath.replace(/^\/+/, '')}`
    : endpoint.path;
  return dangerousGetActions.test(candidate);
}

function appendQueryValue(params: string[], key: string, value: unknown) {
  if (!key || value === undefined || value === null || value === '') return;
  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryValue(params, key, item));
    return;
  }
  const encodedValue = encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value));
  params.push(`${encodeURIComponent(key)}=${encodedValue}`);
}

function appendQuery(path: string, query?: LuckyEndpointQuery) {
  if (!query || Object.keys(query).length === 0) return path;
  const params: string[] = [];
  if (Array.isArray(query)) {
    query.forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entry = item as LuckyRecord;
        const key = String(entry.key ?? entry.Key ?? entry.name ?? entry.Name ?? '').trim();
        const value = entry.value ?? entry.Value;
        appendQueryValue(params, key, value);
      } else appendQueryValue(params, 'value', item);
    });
  } else Object.entries(query).forEach(([key, value]) => appendQueryValue(params, key, value));
  const text = params.join('&');
  return text ? `${path}${path.includes('?') ? '&' : '?'}${text}` : path;
}

function encodePathSuffix(value: string) {
  const parts = value.trim().split('/').filter(Boolean);
  if (!parts.length) throw new Error('请填写资源 Key / 路径后缀');
  if (parts.some((part) => part === '.' || part === '..')) throw new Error('路径后缀不能包含 . 或 ..');
  return parts.map((part) => encodeURIComponent(part)).join('/');
}

export function resolveLuckyEndpointPath(call: LuckyEndpointRunnerCall) {
  let path = call.endpoint.path;
  call.endpoint.pathVariables.forEach((variable) => {
    const value = call.pathValues?.[variable] ?? call.suffix;
    if (!value?.trim()) throw new Error(`请填写路径参数 ${variable}`);
    path = path.replaceAll(`\${${variable}}`, encodeURIComponent(value.trim()));
  });
  if (path.endsWith('/') && call.suffix?.trim()) path += encodePathSuffix(call.suffix);
  return appendQuery(path, call.query);
}

function getFilename(header: string | null) {
  if (!header) return undefined;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try { return decodeURIComponent(utf8); } catch { return utf8; }
  }
  return header.match(/filename="?([^";]+)"?/i)?.[1];
}

function getBody(body: unknown) {
  if (body === undefined || body === null) return undefined;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
  if (typeof body === 'string' || isFormData || isBlob) return body;
  return JSON.stringify(body);
}

function numericRet(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function callLuckyEndpoint(call: LuckyEndpointRunnerCall): Promise<LuckyEndpointResult> {
  if (!call.endpoint.methods.includes(call.method)) throw new Error('该端点不支持所选请求方法');
  const baseUrl = luckySessionState.baseUrl.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('请输入 Lucky 服务地址');
  const path = resolveLuckyEndpointPath(call);
  const controller = new AbortController();
  const externalSignal = call.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timeout = setTimeout(() => controller.abort(), longRunningActions.test(path) ? 600000 : 20000);
  const headers = new Headers({ Accept: 'application/json, text/plain, */*' });
  if (luckySessionState.token) headers.set('Lucky-Admin-Token', luckySessionState.token);
  const requestBody = ['GET', 'HEAD'].includes(call.method) ? undefined : getBody(call.body);
  const multipart = typeof FormData !== 'undefined' && requestBody instanceof FormData;
  const binary = typeof Blob !== 'undefined' && requestBody instanceof Blob;
  if (requestBody && !multipart && !binary) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${baseUrl}${withLuckyRequestNonce(path)}`, {
      method: call.method,
      headers,
      body: requestBody as BodyInit | undefined,
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const filename = getFilename(response.headers.get('content-disposition'));
    const likelyBinaryPath = /\/(?:download|export|backup|file|[^/]*\.tar\.gz)(?:[/?]|$)/i.test(path);
    if (response.status === 401) {
      try { await response.arrayBuffer(); } catch { /* release the response before retrying */ }
      if (call.retryAuth !== false) {
        try {
          await refreshLuckyToken();
          return callLuckyEndpoint({ ...call, retryAuth: false });
        } catch (error) {
          await endLuckySession();
          if (error instanceof LuckyAuthError) throw error;
        }
      }
      throw new LuckyAuthError();
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
      return { status: response.status, contentType, filename, kind: 'empty' };
    }
    if (contentType.includes('application/json') || contentType.includes('+json') || (!contentType && !filename && !likelyBinaryPath)) {
      const raw = await response.text();
      let data: LuckyRecord;
      try {
        const parsed = JSON.parse(raw) as unknown;
        data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed as LuckyRecord
          : { data: parsed };
      } catch {
        if (!response.ok) throw new Error(raw || `请求失败（HTTP ${response.status}）`);
        return raw.trim()
          ? { status: response.status, contentType, filename, kind: 'text', data: raw }
          : { status: response.status, contentType, filename, kind: 'empty' };
      }
      const ret = numericRet(data.ret);
      if (ret === -1) {
        if (call.retryAuth !== false) {
          try {
            await refreshLuckyToken();
            return callLuckyEndpoint({ ...call, retryAuth: false });
          } catch (error) {
            await endLuckySession();
            if (error instanceof LuckyAuthError) throw error;
          }
        }
        throw new LuckyAuthError(typeof data.msg === 'string' ? data.msg : undefined);
      }
      if (!response.ok || (ret !== undefined && ret !== 0)) {
        throw new Error(typeof data.msg === 'string' ? data.msg : `请求失败（HTTP ${response.status}）`);
      }
      return { status: response.status, contentType, filename, kind: 'json', data };
    }
    if (contentType.startsWith('text/') || contentType.includes('xml') || contentType.includes('yaml')) {
      const data = await response.text();
      if (!response.ok) throw new Error(data || `请求失败（HTTP ${response.status}）`);
      return { status: response.status, contentType, filename, kind: 'text', data };
    }
    const blob = await response.blob();
    if (!response.ok) {
      const detail = blob.size <= 65536 ? (await blob.text()).trim() : '';
      throw new Error(detail || `请求失败（HTTP ${response.status}）`);
    }
    if (blob.size === 0) return { status: response.status, contentType, filename, kind: 'empty' };
    return { status: response.status, contentType, filename, kind: 'binary', byteLength: blob.size, blob };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) throw new Error('请求已取消');
      throw new Error('请求超时，请检查服务器连接');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}
