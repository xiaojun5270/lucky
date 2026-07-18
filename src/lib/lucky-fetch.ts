import { endLuckySession, luckySessionState, saveLuckyToken } from '@/src/store/lucky-session';
import type { LuckyRecord, LuckyResponse } from '@/src/types/lucky';

export class LuckyAuthError extends Error {
  constructor(message = '登录已失效，请重新登录') {
    super(message);
    this.name = 'LuckyAuthError';
  }
}

type LuckyRequestOptions = RequestInit & {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  retryAuth?: boolean;
  responseType?: 'auto' | 'json' | 'text' | 'blob';
};

const DEFAULT_REQUEST_TIMEOUT_MS = 12000;

let tokenRefreshPromise: Promise<string> | undefined;

function numericRet(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function payloadFromJson<T extends LuckyRecord>(parsed: unknown): LuckyResponse<T> {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as LuckyRecord;
    return { ...record, ret: numericRet(record.ret) ?? 0 } as unknown as LuckyResponse<T>;
  }
  return { ret: 0, data: parsed } as unknown as LuckyResponse<T>;
}

function decodeFilename(value: string | null) {
  if (!value) return undefined;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const raw = encoded ?? value.match(/filename="?([^";]+)"?/i)?.[1];
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getUrl(baseUrl: string, path: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function createLuckyRequestNonce(now = Date.now()) {
  const timestamp = String(now).slice(0, -1);
  const checksum = [...timestamp].reduce((sum, digit) => sum + Number(digit), 0) % 8;
  return `${timestamp}${checksum}`;
}

export function withLuckyRequestNonce(path: string, now = Date.now()) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}_=${createLuckyRequestNonce(now)}`;
}

export async function refreshLuckyToken() {
  if (tokenRefreshPromise) return tokenRefreshPromise;
  tokenRefreshPromise = (async () => {
    const { baseUrl, account, password } = luckySessionState;
    if (!baseUrl || !account || !password) throw new LuckyAuthError();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DEFAULT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(getUrl(baseUrl, withLuckyRequestNonce('/api/login')), {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ Account: account.trim(), Password: password, TwoFA: '', TwoFACode: '' }),
        signal: controller.signal,
      });
      let payload: LuckyRecord;
      try {
        payload = await response.json() as LuckyRecord;
      } catch {
        throw new LuckyAuthError(response.ok
          ? '重新登录失败：服务器返回了无法识别的数据'
          : `重新登录失败（HTTP ${response.status}）`);
      }
      if (!response.ok || numericRet(payload.ret) !== 0) throw new LuckyAuthError(typeof payload.msg === 'string' ? payload.msg : undefined);
      const nested = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as LuckyRecord : {};
      const token = [payload.token, payload.Token, payload.AdminToken, payload.LuckyAdminToken,
        typeof payload.data === 'string' ? payload.data : undefined,
        nested.token, nested.Token, nested.AdminToken, nested.LuckyAdminToken,
        response.headers.get('Lucky-Admin-Token')].find((value) => typeof value === 'string' && value.trim().length > 0);
      if (typeof token !== 'string') throw new LuckyAuthError('重新登录成功但未返回 Token');
      await saveLuckyToken(token);
      return token;
    } catch (error) {
      if (error instanceof LuckyAuthError) throw error;
      if (timedOut) throw new LuckyAuthError('重新登录超时，请检查服务器连接');
      if (error instanceof Error && error.name === 'AbortError') throw new LuckyAuthError('重新登录请求已取消');
      throw new LuckyAuthError('重新登录失败，请检查服务器连接');
    } finally {
      clearTimeout(timeout);
    }
  })();
  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = undefined;
  }
}

export async function luckyFetch<T extends LuckyRecord = LuckyRecord>(
  path: string,
  options: LuckyRequestOptions = {}
): Promise<LuckyResponse<T>> {
  const {
    baseUrl: optionBaseUrl,
    token: optionToken,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    retryAuth = true,
    responseType = 'auto',
    ...requestOptions
  } = options;
  const baseUrl = (optionBaseUrl ?? luckySessionState.baseUrl).trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('请输入 Lucky 服务地址');

  const controller = new AbortController();
  const externalSignal = requestOptions.signal;
  let timedOut = false;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', responseType === 'blob'
      ? 'application/octet-stream, application/json;q=0.8, text/plain;q=0.6'
      : 'application/json');
  }
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const isBlob = typeof Blob !== 'undefined' && options.body instanceof Blob;
  if (options.body && !isFormData && !isBlob && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = optionToken ?? luckySessionState.token;
  if (token) headers.set('Lucky-Admin-Token', token);

  try {
    const response = await fetch(getUrl(baseUrl, withLuckyRequestNonce(path)), { ...requestOptions, headers, signal: controller.signal });
    const contentType = response.headers.get('content-type') ?? '';
    const contentDisposition = response.headers.get('content-disposition') ?? '';
    const filename = decodeFilename(contentDisposition);

    // Lucky normally returns a JSON envelope, but file and log endpoints can
    // return plain text, an empty response, or binary data. Keep the same
    // `ret/data` contract for callers while preserving the original payload.
    let payload: LuckyResponse<T>;
    if (response.status === 401) {
      // Do not let an unusual, content-type-less auth response get swallowed
      // by the Blob branch below; the normal token refresh path still applies.
      try { await response.arrayBuffer(); } catch { /* ignore body read errors */ }
      payload = { ret: -1 } as LuckyResponse<T>;
    } else if (response.status === 204 || response.headers.get('content-length') === '0') {
      payload = { ret: 0 } as LuckyResponse<T>;
    } else if (responseType === 'blob' && !contentType.includes('application/json') && !contentType.includes('+json')) {
      const blob = await response.blob();
      if (!response.ok) {
        const detail = blob.size <= 65536 ? (await blob.text()).trim() : '';
        throw new Error(detail || `请求失败（HTTP ${response.status}）`);
      }
      let parsedPayload: LuckyResponse<T> | undefined;
      if (blob.size <= 1048576) {
        try { parsedPayload = payloadFromJson<T>(JSON.parse(await blob.text())); } catch { /* binary response */ }
      }
      payload = parsedPayload
        ?? { ret: 0, data: blob, contentType, filename, byteLength: blob.size } as unknown as LuckyResponse<T>;
    } else if (responseType === 'text' || contentType.startsWith('text/') || contentType.includes('xml') || contentType.includes('yaml')) {
      const raw = await response.text();
      if (!response.ok) throw new Error(raw || `请求失败（HTTP ${response.status}）`);
      payload = raw.trim() ? { ret: 0, data: raw } as unknown as LuckyResponse<T> : { ret: 0 } as LuckyResponse<T>;
    } else if (responseType === 'json' || contentType.includes('application/json') || contentType.includes('+json') || !contentType) {
      const raw = await response.text();
      try {
        payload = payloadFromJson<T>(JSON.parse(raw) as unknown);
      } catch {
        if (!response.ok) throw new Error(raw || `请求失败（HTTP ${response.status}）`);
        // Some proxies omit Content-Type for text responses.
        payload = raw.trim() ? { ret: 0, data: raw } as unknown as LuckyResponse<T> : { ret: 0 } as LuckyResponse<T>;
      }
    } else {
      const blob = await response.blob();
      if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
      payload = { ret: 0, data: blob, contentType, filename, byteLength: blob.size } as unknown as LuckyResponse<T>;
    }

    const ret = numericRet(payload.ret) ?? 0;
    if (response.status === 401 || ret === -1) {
      if (retryAuth) {
        try {
          const latestToken = token && luckySessionState.token && token !== luckySessionState.token
            ? luckySessionState.token
            : await refreshLuckyToken();
          return luckyFetch(path, { ...options, token: latestToken, retryAuth: false });
        } catch (refreshError) {
          await endLuckySession();
          if (refreshError instanceof LuckyAuthError) throw refreshError;
        }
      }
      throw new LuckyAuthError(payload.msg);
    }
    if (!response.ok || ret !== 0) {
      throw new Error(payload.msg || `请求失败（HTTP ${response.status}）`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      if (externalSignal?.aborted) throw new Error('请求已取消');
      if (timedOut) throw new Error('请求超时，请检查服务器连接');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

export function getLuckyToken(payload: LuckyRecord, responseHeaders?: Headers) {
  const nested = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as LuckyRecord : {};
  const candidates = [payload.token, payload.Token, payload.adminToken, payload.AdminToken, payload.LuckyAdminToken,
    typeof payload.data === 'string' ? payload.data : undefined,
    nested.token, nested.Token, nested.adminToken, nested.AdminToken, nested.LuckyAdminToken];
  const bodyToken = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return (bodyToken as string | undefined) ?? responseHeaders?.get('Lucky-Admin-Token') ?? '';
}
