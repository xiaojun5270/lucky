import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const { proxy } = require('valtio');

const SESSION_KEY = 'lucky_app_session';

type PersistedSession = {
  baseUrl: string;
  account: string;
  token: string;
};

export const luckySessionState = proxy({
  baseUrl: '',
  account: '',
  token: '',
  hydrated: false,
});

async function readSession() {
  try {
    if (Platform.OS === 'web') {
      const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(SESSION_KEY);
      return raw;
    }
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

async function writeSession(value: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (typeof sessionStorage !== 'undefined') {
        value === null ? sessionStorage.removeItem(SESSION_KEY) : sessionStorage.setItem(SESSION_KEY, value);
      }
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(SESSION_KEY);
    else await SecureStore.setItemAsync(SESSION_KEY, value);
  } catch {
    // The in-memory session remains usable when secure persistence is unavailable.
  }
}

export async function hydrateLuckySession() {
  try {
    const raw = await readSession();
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PersistedSession>;
      luckySessionState.baseUrl = saved.baseUrl?.trim().replace(/\/$/, '') ?? '';
      luckySessionState.account = saved.account ?? '';
      luckySessionState.token = saved.token ?? '';
    }
  } catch {
    await writeSession(null);
  } finally {
    luckySessionState.hydrated = true;
  }
}

export async function saveLuckySession(session: PersistedSession) {
  const normalized = { ...session, baseUrl: session.baseUrl.trim().replace(/\/$/, '') };
  Object.assign(luckySessionState, normalized);
  await writeSession(JSON.stringify(normalized));
}

export async function clearLuckySession() {
  luckySessionState.baseUrl = '';
  luckySessionState.account = '';
  luckySessionState.token = '';
  await writeSession(null);
}

export function isLuckyAuthenticated() {
  return Boolean(luckySessionState.baseUrl && luckySessionState.token);
}
