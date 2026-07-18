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
};

let tokenRefreshPromise: Promise<string> | undefined;

function getUrl(baseUrl: string, path: string) {
  return `${baseUrl.trim().replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
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
    const response = await fetch(getUrl(baseUrl, withLuckyRequestNonce('/api/login')), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ Account: account.trim(), Password: password, TwoFA: '' }),
    });
    const payload = await response.json() as LuckyRecord;
    if (!response.ok || payload.ret !== 0) throw new LuckyAuthError(typeof payload.msg === 'string' ? payload.msg : undefined);
    const nested = payload.data && typeof payload.data === 'object' ? payload.data as LuckyRecord : {};
    const token = [payload.token, payload.Token, payload.AdminToken, payload.LuckyAdminToken, nested.token, nested.Token,
      response.headers.get('Lucky-Admin-Token')].find((value) => typeof value === 'string' && value.length > 0);
    if (typeof token !== 'string') throw new LuckyAuthError('重新登录成功但未返回 Token');
    await saveLuckyToken(token);
    return token;
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
    timeoutMs = 12000,
    retryAuth = true,
    ...requestOptions
  } = options;
  const baseUrl = optionBaseUrl ?? luckySessionState.baseUrl;
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
  headers.set('Accept', 'application/json');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !isFormData) headers.set('Content-Type', 'application/json');
  const token = optionToken ?? luckySessionState.token;
  if (token) headers.set('Lucky-Admin-Token', token);

  try {
    const response = await fetch(getUrl(baseUrl, withLuckyRequestNonce(path)), { ...requestOptions, headers, signal: controller.signal });
    const raw = await response.text();
    let payload: LuckyResponse<T>;
    try {
      payload = JSON.parse(raw) as LuckyResponse<T>;
    } catch {
      throw new Error(response.ok ? '服务器返回了无法识别的数据' : `请求失败（HTTP ${response.status}）`);
    }
    if (response.status === 401 || payload.ret === -1) {
      if (retryAuth) {
        try {
          const latestToken = token && luckySessionState.token && token !== luckySessionState.token
            ? luckySessionState.token
            : await refreshLuckyToken();
          return luckyFetch(path, { ...options, token: latestToken, retryAuth: false });
        } catch {
          await endLuckySession();
        }
      }
      throw new LuckyAuthError(payload.msg);
    }
    if (!response.ok || payload.ret !== 0) throw new Error(payload.msg || `请求失败（HTTP ${response.status}）`);
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
  const candidates = [payload.token, payload.Token, payload.adminToken, payload.AdminToken, payload.data];
  const bodyToken = candidates.find((value) => typeof value === 'string' && value.length > 0);
  return (bodyToken as string | undefined) ?? responseHeaders?.get('Lucky-Admin-Token') ?? '';
}
