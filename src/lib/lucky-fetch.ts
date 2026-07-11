import { luckySessionState } from '@/src/store/lucky-session';
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
};

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

export async function luckyFetch<T extends LuckyRecord = LuckyRecord>(
  path: string,
  options: LuckyRequestOptions = {}
): Promise<LuckyResponse<T>> {
  const baseUrl = options.baseUrl ?? luckySessionState.baseUrl;
  if (!baseUrl) throw new Error('请输入 Lucky 服务地址');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !isFormData) headers.set('Content-Type', 'application/json');
  const token = options.token ?? luckySessionState.token;
  if (token) headers.set('Lucky-Admin-Token', token);

  try {
    const response = await fetch(getUrl(baseUrl, withLuckyRequestNonce(path)), { ...options, headers, signal: controller.signal });
    const raw = await response.text();
    let payload: LuckyResponse<T>;
    try {
      payload = JSON.parse(raw) as LuckyResponse<T>;
    } catch {
      throw new Error(response.ok ? '服务器返回了无法识别的数据' : `请求失败（HTTP ${response.status}）`);
    }
    if (response.status === 401 || payload.ret === -1) throw new LuckyAuthError(payload.msg);
    if (!response.ok || payload.ret !== 0) throw new Error(payload.msg || `请求失败（HTTP ${response.status}）`);
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('请求超时，请检查服务器连接');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getLuckyToken(payload: LuckyRecord, responseHeaders?: Headers) {
  const candidates = [payload.token, payload.Token, payload.adminToken, payload.AdminToken, payload.data];
  const bodyToken = candidates.find((value) => typeof value === 'string' && value.length > 0);
  return (bodyToken as string | undefined) ?? responseHeaders?.get('Lucky-Admin-Token') ?? '';
}
