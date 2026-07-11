import { LUCKY_ENDPOINTS, LUCKY_MODULES } from '@/src/api/lucky-endpoints.generated';
import { LuckyAuthError, withLuckyRequestNonce } from '@/src/lib/lucky-fetch';
import { luckySessionState } from '@/src/store/lucky-session';
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

const dangerousActions = /\/(reboot_program|restoreconfigureconfirm|update\/comfire|manualsync|manualSync|flush|wakeup|shutdown|restart|start|stop|down|up|prune|remove|build|pull|push|import|export|load)(\/|$)/i;
const configurationPaths = /\/(configure|config|setting|baseconfigure)(\/|$)/i;

export function getLuckyModules() {
  return LUCKY_MODULES;
}

export function getLuckyEndpoints(module?: string) {
  return module ? LUCKY_ENDPOINTS.filter((endpoint) => endpoint.module === module) : LUCKY_ENDPOINTS;
}

export function getLuckyEndpoint(id: string) {
  return LUCKY_ENDPOINTS.find((endpoint) => endpoint.id === id);
}

export function isDangerousLuckyRequest(endpoint: LuckyEndpointDefinition, method: LuckyHttpMethod) {
  if (method === 'DELETE') return true;
  if (dangerousActions.test(endpoint.path)) return true;
  return method === 'PUT' && configurationPaths.test(endpoint.path);
}

function appendQuery(path: string, query?: LuckyRecord) {
  if (!query || Object.keys(query).length === 0) return path;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item)));
      return;
    }
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  const text = params.toString();
  return text ? `${path}${path.includes('?') ? '&' : '?'}${text}` : path;
}

export function resolveLuckyEndpointPath(call: LuckyEndpointCall) {
  let path = call.endpoint.path;
  call.endpoint.pathVariables.forEach((variable) => {
    const value = call.pathValues?.[variable] ?? call.suffix;
    if (!value?.trim()) throw new Error(`请填写路径参数 ${variable}`);
    path = path.replaceAll(`\${${variable}}`, encodeURIComponent(value.trim()));
  });
  if (path.endsWith('/') && call.suffix?.trim()) path += encodeURIComponent(call.suffix.trim());
  return appendQuery(path, call.query);
}

function getFilename(header: string | null) {
  if (!header) return undefined;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return decodeURIComponent(utf8);
  return header.match(/filename="?([^";]+)"?/i)?.[1];
}

function getBody(body: unknown) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) return body;
  return JSON.stringify(body);
}

export async function callLuckyEndpoint(call: LuckyEndpointCall): Promise<LuckyEndpointResult> {
  if (!call.endpoint.methods.includes(call.method)) throw new Error('该端点不支持所选请求方法');
  const baseUrl = luckySessionState.baseUrl.trim().replace(/\/$/, '');
  if (!baseUrl) throw new Error('请输入 Lucky 服务地址');
  const path = resolveLuckyEndpointPath(call);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const headers = new Headers({ Accept: 'application/json, text/plain, */*' });
  if (luckySessionState.token) headers.set('Lucky-Admin-Token', luckySessionState.token);
  const requestBody = ['GET', 'HEAD'].includes(call.method) ? undefined : getBody(call.body);
  if (requestBody && !(requestBody instanceof FormData) && !(requestBody instanceof Blob)) {
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
    if (response.status === 401) throw new LuckyAuthError();
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
      return { status: response.status, contentType, filename, kind: 'empty' };
    }
    if (contentType.includes('application/json') || contentType.includes('+json')) {
      const data = await response.json() as LuckyRecord;
      if (data.ret === -1) throw new LuckyAuthError(typeof data.msg === 'string' ? data.msg : undefined);
      if (!response.ok || (typeof data.ret === 'number' && data.ret !== 0)) {
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
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    return { status: response.status, contentType, filename, kind: 'binary', byteLength: blob.size, blob };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('请求超时，请检查服务器连接');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
