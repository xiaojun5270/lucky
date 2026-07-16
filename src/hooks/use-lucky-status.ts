import { useFocusEffect } from 'expo-router';
import { Field, Root, Type } from 'protobufjs/light';
import { ungzip } from 'pako';
import { startTransition, useCallback, useState } from 'react';

import { refreshLuckyToken } from '@/src/lib/lucky-fetch';
import { endLuckySession, luckySessionState } from '@/src/store/lucky-session';
import type { LuckyLiveStatus, LuckyRecord, LuckyStatusSample } from '@/src/types/lucky';

const STATUS_UPDATE_INTERVAL = 1000;
const STATUS_HISTORY_LIMIT = 90;

const sampleType = new Type('SystemSample')
  .add(new Field('time', 1, 'int64'))
  .add(new Field('systemCpuPercent', 2, 'float'))
  .add(new Field('processCpuPercent', 3, 'float'))
  .add(new Field('totalMem', 4, 'uint64'))
  .add(new Field('usedMem', 5, 'uint64'))
  .add(new Field('netInTransfer', 6, 'uint64'))
  .add(new Field('netOutTransfer', 7, 'uint64'))
  .add(new Field('netInSpeed', 8, 'uint64'))
  .add(new Field('netOutSpeed', 9, 'uint64'));

const statusType = new Type('StatusMsg')
  .add(new Field('ok', 1, 'bool'))
  .add(new Field('error', 2, 'string'))
  .add(new Field('totalMem', 3, 'uint64'))
  .add(new Field('usedMem', 4, 'uint64'))
  .add(new Field('usedCpu', 5, 'float'))
  .add(new Field('currentProcessUsedCpu', 6, 'float'))
  .add(new Field('goroutine', 7, 'uint64'))
  .add(new Field('processUsedMem', 8, 'uint64'))
  .add(new Field('netIn', 9, 'uint64'))
  .add(new Field('netOut', 10, 'uint64'))
  .add(new Field('lastNetInSpeed', 11, 'uint64'))
  .add(new Field('lastNetOutSpeed', 12, 'uint64'))
  .add(new Field('handleCount', 13, 'uint64'))
  .add(new Field('numGc', 14, 'uint64'))
  .add(new Field('heapInuse', 15, 'uint64'))
  .add(new Field('runTime', 16, 'string'))
  .add(new Field('queryTime', 17, 'string'))
  .add(new Field('history', 50, 'SystemSample', 'repeated'));

new Root().define('statuspb').add(sampleType).add(statusType);

function number(value: unknown) {
  return typeof value === 'number' ? value : Number(value) || 0;
}

function sample(value: LuckyRecord): LuckyStatusSample {
  return {
    time: number(value.time),
    systemCpuPercent: number(value.systemCpuPercent),
    processCpuPercent: number(value.processCpuPercent),
    totalMem: number(value.totalMem),
    usedMem: number(value.usedMem),
    netInTransfer: number(value.netInTransfer),
    netOutTransfer: number(value.netOutTransfer),
    netInSpeed: number(value.netInSpeed),
    netOutSpeed: number(value.netOutSpeed),
  };
}

function decodeStatus(bytes: Uint8Array): LuckyLiveStatus {
  const value = statusType.decode(ungzip(bytes)) as unknown as LuckyRecord;
  if (value.ok === false) throw new Error(typeof value.error === 'string' ? value.error : '状态连接无效');
  return {
    totalMem: number(value.totalMem),
    usedMem: number(value.usedMem),
    usedCpu: number(value.usedCpu),
    currentProcessUsedCpu: number(value.currentProcessUsedCpu),
    goroutine: number(value.goroutine),
    processUsedMem: number(value.processUsedMem),
    netIn: number(value.netIn),
    netOut: number(value.netOut),
    lastNetInSpeed: number(value.lastNetInSpeed),
    lastNetOutSpeed: number(value.lastNetOutSpeed),
    handleCount: number(value.handleCount),
    numGc: number(value.numGc),
    heapInuse: number(value.heapInuse),
    runTime: typeof value.runTime === 'string' ? value.runTime : '',
    queryTime: typeof value.queryTime === 'string' ? value.queryTime : '',
    history: Array.isArray(value.history)
      ? value.history.slice(-STATUS_HISTORY_LIMIT).map((item) => sample(item as LuckyRecord))
      : [],
  };
}

async function messageBytes(data: unknown) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new Error('无法识别状态数据格式');
}

function statusSocketUrl() {
  const base = luckySessionState.baseUrl.trim().replace(/\/$/, '');
  const socketBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  return `${socketBase}/api/status/ws?Lucky-Admin-Token=${encodeURIComponent(luckySessionState.token)}&_=${Date.now()}`;
}

export function useLuckyStatus(enabled = true) {
  const [data, setData] = useState<LuckyLiveStatus>();
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }
    let disposed = false;
    let socket: WebSocket | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let statusTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = 1000;
    let lastStatusUpdate = 0;
    let pendingStatus: unknown;
    let decoding = false;

    async function flushStatus() {
      if (disposed || decoding || pendingStatus === undefined) return;
      const wait = STATUS_UPDATE_INTERVAL - (Date.now() - lastStatusUpdate);
      if (wait > 0) {
        if (!statusTimer) statusTimer = setTimeout(() => {
          statusTimer = undefined;
          void flushStatus();
        }, wait);
        return;
      }
      const message = pendingStatus;
      pendingStatus = undefined;
      decoding = true;
      try {
        const next = decodeStatus(await messageBytes(message));
        if (!disposed) {
          lastStatusUpdate = Date.now();
          startTransition(() => setData(next));
          setConnected(true);
          setError('');
        }
      } catch (caught) {
        if (!disposed) setError(caught instanceof Error ? caught.message : '状态数据解析失败');
      } finally {
        decoding = false;
        if (pendingStatus !== undefined) void flushStatus();
      }
    }

    function connect() {
      if (disposed || !luckySessionState.baseUrl || !luckySessionState.token) return;
      const socketToken = luckySessionState.token;
      socket = new WebSocket(statusSocketUrl());
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        reconnectDelay = 1000;
        setError('');
      };
      socket.onmessage = async (event) => {
        try {
          if (typeof event.data === 'string') {
            if (/token|login|invalid/i.test(event.data)) {
              try {
                if (socketToken === luckySessionState.token) await refreshLuckyToken();
                setError('');
              } catch {
                await endLuckySession();
                throw new Error('登录已失效，请重新登录');
              } finally {
                socket?.close();
              }
              return;
            }
            throw new Error(event.data || '状态服务返回了错误');
          }
          pendingStatus = event.data;
          void flushStatus();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : '状态数据解析失败');
        }
      };
      socket.onerror = () => setError('实时状态连接失败');
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) {
          reconnectTimer = setTimeout(connect, reconnectDelay);
          reconnectDelay = Math.min(reconnectDelay * 2, 15000);
        }
      };
    }

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (statusTimer) clearTimeout(statusTimer);
      socket?.close();
    };
  }, [enabled]));

  return { data, connected, error };
}
