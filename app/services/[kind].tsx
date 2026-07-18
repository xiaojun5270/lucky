import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Container, Ellipsis, FileKey2, FileText, FileUp, Globe2, List, ListOrdered, Pause, Pencil, Play, Plus, RefreshCw, RotateCw, Save, Settings2, ShieldCheck, SlidersHorizontal, Square, Terminal, TestTube, Trash2, Users, Webhook, Wifi, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, Page, Panel } from '@/src/components/lucky-ui';
import { StructuredDataView, StructuredForm } from '@/src/components/structured-form';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getServiceDetail, getServiceItems, getServiceLastLogs, getServiceLogs, runServiceAction, setServiceEnabled } from '@/src/services/lucky';
import { createDdnsTask, deleteDdnsRecord, deleteDdnsTask, getDdnsConfigure, getDdnsOdhcpdClients, getDdnsTask, reorderDdnsRecords, reorderDdnsTasks, setDdnsRecordOption, testDdnsIpCommand, testDdnsWebhook, updateDdnsConfigure, updateDdnsTask } from '@/src/services/ddns';
import { cancelSslAcme, createSslCertificate, deleteSslCertificate, getSslCertificate, getSslSetting, getSslSyncClientOptions, reorderSslCertificates, updateSslCertificate, updateSslSetting } from '@/src/services/ssl';
import type { LuckyListItem, LuckyRecord, LuckyServiceKind } from '@/src/types/lucky';

const config = {
  webservice: { title: '反向代理', subtitle: '域名、监听与后端规则', icon: Globe2 },
  ddns: { title: '动态域名', subtitle: 'DDNS 任务状态与同步', icon: RefreshCw },
  docker: { title: 'Docker 容器', subtitle: '容器运行状态与控制', icon: Container },
  ssl: { title: 'SSL 证书', subtitle: '证书有效期与同步状态', icon: ShieldCheck },
} as const;

function pick(item: LuckyRecord, keys: string[], fallback = '--') {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(String).join(', ');
  }
  return fallback;
}

function itemKey(item: LuckyListItem, index: number) {
  return pick(item, ['Key', 'key', 'TaskKey', 'taskKey', 'DDNSTaskKey', 'ID', 'Id', 'id'], String(index));
}

function isEnabled(item: LuckyListItem) {
  const value: unknown = (item as LuckyRecord).Enable ?? (item as LuckyRecord).enable ?? (item as LuckyRecord).Enabled;
  if (value === false || value === 0) return false;
  return typeof value !== 'string' || !/^(?:false|0|off|no|disabled)$/i.test(value.trim());
}

function isAcmeIssuing(item: LuckyRecord) {
  const sources = [item, childRecord(item, 'data'), childRecord(item, 'ssl'), childRecord(item, 'ExtParams')];
  for (const source of sources) {
    const value = source.ACMEing ?? source.Acmeing ?? source.acmeing ?? source.ACMEInProgress ?? source.acmeInProgress;
    if (value === true || value === 1) return true;
    if (typeof value === 'string' && /^(?:true|1|yes|running|pending|issuing|processing|in[_ -]?progress)$/i.test(value.trim())) return true;
  }
  return false;
}

function detailValue(payload?: LuckyRecord) {
  if (!payload) return {};
  const keys = ['rule', 'task', 'container', 'ssl', 'certificate', 'cert', 'configure', 'setting', 'data', 'result'];
  let value = payload;
  const visited = new Set<object>();
  for (let depth = 0; depth < 6 && !visited.has(value); depth += 1) {
    visited.add(value);
    const nested = keys
      .map((key) => value[key])
      .find((item): item is LuckyRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
    if (!nested) break;
    value = nested;
  }
  return value;
}

function editableValue(payload: LuckyRecord) {
  const value = { ...detailValue(payload) };
  delete value.ret;
  delete value.msg;
  return value;
}

function childRecord(item: LuckyRecord, key: string) {
  const value = item[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LuckyRecord : {};
}

function sslSummary(item: LuckyRecord) {
  const rawCerts = item.CertsInfo;
  const certs = Array.isArray(rawCerts)
    ? rawCerts.find((value): value is LuckyRecord => Boolean(value) && typeof value === 'object' && !Array.isArray(value)) ?? {}
    : childRecord(item, 'CertsInfo');
  const ext = childRecord(item, 'ExtParams');
  const domains = Array.isArray(certs.Domains)
    ? certs.Domains.map(String)
    : Array.isArray(item.Domains)
      ? item.Domains.map(String)
      : Array.isArray(ext.acmeDomains)
        ? ext.acmeDomains.map(String)
        : [];
  const type = pick(item, ['AddFrom', 'Type'], 'file');
  const expiry = pick(certs, ['NotAfterTime', 'NotAfter', 'ExpireTime'], pick(item, ['ExpireTime', 'UpdateTime'], ''));
  return [type.toUpperCase(), domains.join(', '), expiry ? `到期 ${expiry}` : ''].filter(Boolean).join(' · ');
}

function recordItems(value?: LuckyRecord) {
  if (!value) return [] as LuckyRecord[];
  const candidates: unknown[] = [value.Records, value.records, value.RecordList, value.recordList, childRecord(value, 'data').Records];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item): item is LuckyRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
  }
  return [] as LuckyRecord[];
}

function recordKey(item: LuckyRecord, index: number) {
  return pick(item, ['RecordKey', 'recordKey', 'Key', 'key', 'ID', 'Id', 'id', 'Name', 'name', 'Domain', 'domain'], String(index));
}

function recordLabel(item: LuckyRecord, index: number) {
  const domain = pick(item, ['Domain', 'domain', 'FQDN', 'RecordName', 'Name', 'name'], '记录');
  const type = pick(item, ['Type', 'type', 'RecordType', 'recordType'], '');
  const value = pick(item, ['Value', 'value', 'IPv4', 'IPv6', 'Address', 'address'], '');
  return [domain, type, value].filter((part) => part && part !== '--').join(' · ') || `记录 ${index + 1}`;
}

function resultText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(resultText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const record = value as LuckyRecord;
    for (const key of ['result', 'output', 'Output', 'ip', 'IP', 'data', 'logs', 'LastLogs', 'text', 'Text', 'msg', 'message']) {
      if (record[key] !== undefined && record[key] !== null) {
        const text: string = resultText(record[key]);
        if (text) return text;
      }
    }
    return Object.entries(record)
      .map(([key, item]) => {
        const text = resultText(item);
        return text ? `${key}: ${text.replace(/\n/g, '\n  ')}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(value);
}

type ServiceAdvancedSheetProps = {
  kind: 'ddns' | 'ssl';
  itemKeyValue: string;
  name: string;
  item: LuckyRecord;
  orderKeys: string[];
  onClose: () => void;
  onChanged: () => void;
  onReorderTasks: (keys: string[]) => Promise<void>;
  onShowLogs: () => void;
};

function ServiceAdvancedSheet({ kind, itemKeyValue, name, item, orderKeys, onClose, onChanged, onReorderTasks, onShowLogs }: ServiceAdvancedSheetProps) {
  const colors = useAppTheme();
  const [records, setRecords] = useState<LuckyRecord[]>(() => recordItems(item));
  const [option, setOption] = useState('enable');
  const [ipType, setIpType] = useState('IPv4');
  const [command, setCommand] = useState('');
  const [operationError, setOperationError] = useState('');
  const [operationResult, setOperationResult] = useState('');
  const [clientsOpen, setClientsOpen] = useState(false);
  const [order, setOrder] = useState(orderKeys);
  const [orderBusy, setOrderBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const detailQuery = useQuery({
    queryKey: ['lucky', 'service', kind, 'advanced-detail', itemKeyValue],
    queryFn: ({ signal }) => kind === 'ddns' ? getDdnsTask(itemKeyValue, signal) : getSslCertificate(itemKeyValue, signal),
  });
  const clientsQuery = useQuery({
    queryKey: ['lucky', 'service', 'ddns', 'odhcpd-clients'],
    queryFn: ({ signal }) => getDdnsOdhcpdClients(signal),
    enabled: kind === 'ddns' && clientsOpen,
  });
  const detail = useMemo(() => detailQuery.data ? editableValue(detailQuery.data) : item, [detailQuery.data, item]);
  useEffect(() => setRecords(recordItems(detail)), [detail]);
  useEffect(() => setOrder(orderKeys), [orderKeys]);
  const inputStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12 } as const;
  const clients = useMemo(() => {
    const payload = clientsQuery.data;
    if (!payload) return [] as LuckyRecord[];
    const candidates = [payload.clients, payload.list, payload.data, payload.result];
    for (const candidate of candidates) if (Array.isArray(candidate)) return candidate.filter((entry): entry is LuckyRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry));
    return [] as LuckyRecord[];
  }, [clientsQuery.data]);

  async function perform(label: string, task: () => Promise<unknown>) {
    setActionBusy(label);
    setOperationError('');
    setOperationResult('');
    try {
      const result = await task();
      setOperationResult(resultText(result) || '操作成功');
      onChanged();
      return true;
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '请求失败');
      return false;
    } finally {
      setActionBusy('');
    }
  }

  async function moveRecord(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= records.length || actionBusy) return;
    const next = records.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setRecords(next);
    const keys = next.map((entry, entryIndex) => recordKey(entry, entryIndex));
    const succeeded = await perform('reorder-record', () => reorderDdnsRecords(itemKeyValue, keys));
    if (!succeeded) setRecords(records);
  }

  function removeRecord(entry: LuckyRecord, index: number) {
    const key = recordKey(entry, index);
    Alert.alert('删除记录', `确定删除“${recordLabel(entry, index)}”吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => perform('delete-record', async () => {
        await deleteDdnsRecord(itemKeyValue, key);
        setRecords((current) => current.filter((_, currentIndex) => currentIndex !== index));
        return '记录已删除';
      }) },
    ]);
  }

  function changeRecordOption(entry: LuckyRecord, index: number) {
    const key = recordKey(entry, index);
    if (!option.trim()) return setOperationError('请输入记录选项');
    void perform('record-option', () => setDdnsRecordOption(itemKeyValue, key, option.trim()));
  }

  function moveTask(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= order.length || orderBusy) return;
    const next = order.slice();
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setOrder(next);
    setOrderBusy(true);
    setOperationError('');
    onReorderTasks(next).catch((error) => {
      setOrder(order);
      setOperationError(error instanceof Error ? error.message : '排序失败');
    }).finally(() => setOrderBusy(false));
  }

  function cancelAcme() {
    Alert.alert('取消 ACME 签发', `确定取消“${name}”当前的证书签发吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '取消签发', style: 'destructive', onPress: () => void perform('cancel-acme', () => cancelSslAcme(itemKeyValue)) },
    ]);
  }

  function testCommand() {
    if (!command.trim()) return setOperationError('请输入要测试的命令');
    void perform('test-command', () => testDdnsIpCommand(ipType, command.trim()));
  }

  function testWebhook() {
    void perform('test-webhook', () => testDdnsWebhook(itemKeyValue, detail));
  }

  return <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <FullScreenSafeArea style={{ flex: 1, backgroundColor: colors.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, padding: 18, gap: 13 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon={SlidersHorizontal} size={38} iconSize={19} /><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 19, fontWeight: '800' }}>高级操作</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{name}</Text></View><Pressable accessibilityLabel="关闭" onPress={onClose} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={19} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: 13, paddingBottom: 24 }} style={{ flex: 1 }}>
            {detailQuery.isLoading ? <Panel><Text style={{ color: colors.subtext }}>正在读取详细配置...</Text></Panel> : null}
            {detailQuery.error ? <ErrorState message={detailQuery.error.message} retry={() => detailQuery.refetch()} /> : null}
            {operationError ? <ErrorState message={operationError} /> : null}
            {operationResult ? <Panel><Text style={{ color: colors.success, fontWeight: '700' }}>操作结果</Text><Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 }}>{operationResult}</Text></Panel> : null}
            <Panel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ListOrdered color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontWeight: '800' }}>任务顺序</Text><Text style={{ color: colors.subtext, fontSize: 12 }}>{order.length} 项</Text></View>
              {order.length ? order.map((key, index) => <View key={`${key}-${index}`} style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder }}><Text numberOfLines={1} style={{ flex: 1, color: key === itemKeyValue ? colors.primary : colors.text, fontSize: 13 }}>{key === itemKeyValue ? `${index + 1}. ${name}` : `${index + 1}. ${key}`}</Text><Pressable accessibilityLabel="上移" disabled={index === 0 || orderBusy} onPress={() => moveTask(index, -1)} style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><ArrowUp color={index === 0 ? colors.disabled : colors.text} size={16} /></Pressable><Pressable accessibilityLabel="下移" disabled={index === order.length - 1 || orderBusy} onPress={() => moveTask(index, 1)} style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><ArrowDown color={index === order.length - 1 ? colors.disabled : colors.text} size={16} /></Pressable></View>) : <Text style={{ color: colors.subtext }}>暂无排序数据</Text>}
            </Panel>
            {kind === 'ddns' ? <>
              <Panel>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ListOrdered color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontWeight: '800' }}>DNS 记录</Text><Text style={{ color: colors.subtext, fontSize: 12 }}>{records.length} 项</Text></View>
                {records.length ? records.slice(0, 100).map((entry, index) => <View key={`${recordKey(entry, index)}-${index}`} style={{ gap: 8, paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 }}>{recordLabel(entry, index)}</Text><Pressable accessibilityLabel="上移记录" disabled={index === 0 || Boolean(actionBusy)} onPress={() => void moveRecord(index, -1)} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><ArrowUp color={index === 0 ? colors.disabled : colors.text} size={15} /></Pressable><Pressable accessibilityLabel="下移记录" disabled={index === records.length - 1 || Boolean(actionBusy)} onPress={() => void moveRecord(index, 1)} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><ArrowDown color={index === records.length - 1 ? colors.disabled : colors.text} size={15} /></Pressable><Pressable accessibilityLabel="删除记录" disabled={Boolean(actionBusy)} onPress={() => removeRecord(entry, index)} style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}><Trash2 color={colors.danger} size={15} /></Pressable></View><View style={{ flexDirection: 'row', gap: 8 }}><TextInput value={option} onChangeText={setOption} placeholder="选项，如 enable" placeholderTextColor={colors.placeholder} autoCapitalize="none" style={[inputStyle, { flex: 1, minHeight: 40, fontSize: 12 }]} /><Pressable disabled={Boolean(actionBusy)} onPress={() => changeRecordOption(entry, index)} style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>应用选项</Text></Pressable></View></View>) : <Text style={{ color: colors.subtext }}>当前任务没有记录</Text>}
                {records.length > 100 ? <Text style={{ color: colors.subtext, fontSize: 12 }}>仅显示前 100 条记录，请在编辑器中继续管理。</Text> : null}
              </Panel>
              <Panel>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Terminal color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontWeight: '800' }}>IP 命令测试</Text><TestTube color={colors.subtext} size={16} /></View>
                <View style={{ flexDirection: 'row', gap: 8 }}><Pressable onPress={() => setIpType((current) => current === 'IPv4' ? 'IPv6' : 'IPv4')} style={[inputStyle, { flex: 0.35, justifyContent: 'center' }]}><Text style={{ color: colors.text, textAlign: 'center' }}>{ipType}</Text></Pressable><TextInput value={command} onChangeText={setCommand} placeholder="输入获取 IP 的命令" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={[inputStyle, { flex: 1 }]} /><Pressable disabled={Boolean(actionBusy)} onPress={testCommand} style={{ minWidth: 64, minHeight: 44, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{actionBusy === 'test-command' ? '测试中' : '测试'}</Text></Pressable></View>
              </Panel>
              <Panel>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Webhook color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontWeight: '800' }}>Webhook 测试</Text></View>
                <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>使用当前任务配置发送一次测试请求，不会改变任务内容。</Text>
                <Pressable disabled={Boolean(actionBusy)} onPress={testWebhook} style={{ height: 44, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><Webhook color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>{actionBusy === 'test-webhook' ? '发送中...' : '发送测试'}</Text></Pressable>
              </Panel>
              <Panel>
                <Pressable onPress={() => setClientsOpen((current) => !current)} style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Wifi color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontWeight: '800' }}>odhcpd 客户端</Text>{clientsOpen ? <ChevronUp color={colors.subtext} size={17} /> : <ChevronDown color={colors.subtext} size={17} />}</Pressable>
                {clientsOpen ? clientsQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在读取客户端...</Text> : clientsQuery.error ? <ErrorState message={clientsQuery.error.message} retry={() => clientsQuery.refetch()} /> : clients.length ? clients.slice(0, 100).map((client, index) => <View key={`${pick(client, ['Mac', 'MAC', 'mac', 'IP', 'ip', 'Hostname', 'hostname'], String(index))}-${index}`} style={{ minHeight: 40, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Users color={colors.subtext} size={15} /><Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 13 }}>{pick(client, ['Hostname', 'hostname', 'Name', 'name', 'IP', 'ip'], '客户端')}</Text><Text style={{ color: colors.subtext, fontSize: 12 }}>{pick(client, ['Mac', 'MAC', 'mac', 'IP', 'ip'], '--')}</Text></View>) : <Text style={{ color: colors.subtext }}>暂无客户端</Text> : null}
              </Panel>
            </> : <Panel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ShieldCheck color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontWeight: '800' }}>ACME 操作</Text></View>
              {isAcmeIssuing(detail) ? <Pressable disabled={Boolean(actionBusy)} onPress={cancelAcme} style={{ height: 44, borderRadius: 11, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><X color={colors.danger} size={16} /><Text style={{ color: colors.danger, fontWeight: '800' }}>{actionBusy === 'cancel-acme' ? '取消中...' : '取消 ACME 签发'}</Text></Pressable> : <Text style={{ color: colors.subtext }}>当前没有正在签发的 ACME 任务。</Text>}
            </Panel>}
            <Panel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><FileText color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontWeight: '800' }}>运行日志</Text></View>
              <Pressable onPress={onShowLogs} style={{ height: 44, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><FileText color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>查看分页日志</Text></Pressable>
            </Panel>
          </ScrollView>
          <Pressable onPress={onClose} style={{ height: 48, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>完成</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </FullScreenSafeArea>
  </Modal>;
}

type ServiceEditor = { type: 'item' | 'settings'; title: string; value: LuckyRecord; key?: string };

function ServiceFormEditor({ editor, busy, close, save }: { editor: ServiceEditor; busy: boolean; close: () => void; save: (value: LuckyRecord) => void }) {
  const colors = useAppTheme();
  const [value, setValue] = useState(() => JSON.parse(JSON.stringify(editor.value)) as LuckyRecord);
  return <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <FullScreenSafeArea style={{ flex: 1, backgroundColor: colors.card }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, width: '100%', backgroundColor: colors.card, padding: 18, gap: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><IconTile icon={Settings2} size={36} iconSize={18} /><Text style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' }}>{editor.title}</Text><Pressable accessibilityLabel="关闭" onPress={close} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={18} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: 12, paddingBottom: 4 }} style={{ flex: 1 }}><StructuredForm value={value} onChange={setValue} /></ScrollView>
        <Pressable disabled={busy} onPress={() => save(value)} style={{ height: 48, borderRadius: 12, backgroundColor: busy ? colors.disabled : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Save color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? '保存中' : '保存'}</Text></Pressable>
      </View>
      </KeyboardAvoidingView>
    </FullScreenSafeArea>
  </Modal>;
}

type SslAddMethod = 'file' | 'path' | 'acme';

function SslCertificateEditor({ busy, syncClients, close, save }: { busy: boolean; syncClients: LuckyListItem[]; close: () => void; save: (value: LuckyRecord) => void }) {
  const colors = useAppTheme();
  const [remark, setRemark] = useState('');
  const [addFrom, setAddFrom] = useState<SslAddMethod>('file');
  const [methodOpen, setMethodOpen] = useState(false);
  const [certName, setCertName] = useState('');
  const [keyName, setKeyName] = useState('');
  const [certBase64, setCertBase64] = useState('');
  const [keyBase64, setKeyBase64] = useState('');
  const [certPath, setCertPath] = useState('');
  const [keyPath, setKeyPath] = useState('');
  const [domains, setDomains] = useState('');
  const [syncAll, setSyncAll] = useState(false);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [fileBusy, setFileBusy] = useState<'cert' | 'key' | ''>('');
  const [error, setError] = useState('');
  const methods: Array<{ label: string; value: SslAddMethod }> = [
    { label: '文件', value: 'file' },
    { label: '文件路径', value: 'path' },
    { label: 'ACME 自动签发', value: 'acme' },
  ];
  const inputStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12 } as const;

  function clientKey(item: LuckyListItem, index: number) {
    return pick(item, ['Key', 'ClientKey', 'key', 'ID', 'id'], String(index));
  }

  async function chooseFile(type: 'cert' | 'key') {
    setFileBusy(type);
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/x-pem-file', 'application/pkix-cert', 'application/x-x509-ca-cert', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const base64 = asset.base64 ?? await new File(asset.uri).base64();
      if (type === 'cert') {
        setCertName(asset.name);
        setCertBase64(base64);
      } else {
        setKeyName(asset.name);
        setKeyBase64(base64);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法读取所选文件');
    } finally {
      setFileBusy('');
    }
  }

  function toggleClient(key: string) {
    setSelectedClients((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function submit() {
    const acmeDomains = domains.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    if (addFrom === 'file' && !certBase64) return setError('请选择证书文件');
    if (addFrom === 'file' && !keyBase64) return setError('请选择 Key 文件');
    if (addFrom === 'path' && !certPath.trim()) return setError('请填写证书文件路径');
    if (addFrom === 'path' && !keyPath.trim()) return setError('请填写 Key 文件路径');
    if (addFrom === 'acme' && !acmeDomains.length) return setError('请至少填写一个签发域名');
    const allClientKeys = syncClients.map(clientKey);
    const syncKeys = syncAll ? allClientKeys : selectedClients;
    setError('');
    save({
      Remark: remark.trim(),
      AddFrom: addFrom,
      Enable: true,
      CertBase64: addFrom === 'file' ? certBase64 : '',
      KeyBase64: addFrom === 'file' ? keyBase64 : '',
      CertFile: addFrom === 'path' ? certPath.trim() : certName,
      KeyFile: addFrom === 'path' ? keyPath.trim() : keyName,
      Domains: addFrom === 'acme' ? acmeDomains : [],
      ExtParams: addFrom === 'acme' ? { acmeDomains } : {},
      SyncAllClients: syncAll,
      SyncClients: syncKeys,
      SyncInfo: { SyncAllClients: syncAll, SyncClients: syncKeys },
    });
  }

  return <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <FullScreenSafeArea style={{ flex: 1, backgroundColor: colors.card }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, width: '100%', backgroundColor: colors.card, padding: 18, gap: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <IconTile icon={ShieldCheck} color={colors.success} background={colors.successBg} size={36} iconSize={18} />
          <Text style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' }}>添加证书</Text>
          <Pressable accessibilityLabel="关闭" onPress={close} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={18} /></Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: 13, paddingBottom: 4 }} style={{ flex: 1 }}>
          <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>证书备注</Text><TextInput value={remark} onChangeText={setRemark} placeholder="可留空" placeholderTextColor={colors.placeholder} style={inputStyle} /></View>
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>添加方式</Text>
            <Pressable onPress={() => setMethodOpen(!methodOpen)} style={[inputStyle, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}><Text style={{ flex: 1, color: colors.text }}>{methods.find((item) => item.value === addFrom)?.label}</Text><ChevronDown color={colors.subtext} size={17} /></Pressable>
            {methodOpen ? <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>{methods.map((method, index) => <Pressable key={method.value} onPress={() => { setAddFrom(method.value); setMethodOpen(false); setError(''); }} style={{ minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, backgroundColor: addFrom === method.value ? colors.primarySoft : colors.card }}><Text style={{ flex: 1, color: addFrom === method.value ? colors.primary : colors.text, fontWeight: addFrom === method.value ? '700' : '500' }}>{method.label}</Text>{addFrom === method.value ? <Check color={colors.primary} size={16} /> : null}</Pressable>)}</View> : null}
          </View>
          {addFrom === 'file' ? <>
            <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>证书</Text><Pressable disabled={Boolean(fileBusy)} onPress={() => chooseFile('cert')} style={{ minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: certBase64 ? colors.success : colors.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}><FileUp color={certBase64 ? colors.success : colors.primary} size={17} /><Text numberOfLines={1} style={{ flex: 1, color: certName ? colors.text : colors.subtext }}>{fileBusy === 'cert' ? '正在读取...' : certName || '选择要上传的证书文件'}</Text>{certBase64 ? <Check color={colors.success} size={16} /> : null}</Pressable></View>
            <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Key</Text><Pressable disabled={Boolean(fileBusy)} onPress={() => chooseFile('key')} style={{ minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: keyBase64 ? colors.success : colors.border, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}><FileKey2 color={keyBase64 ? colors.success : colors.primary} size={17} /><Text numberOfLines={1} style={{ flex: 1, color: keyName ? colors.text : colors.subtext }}>{fileBusy === 'key' ? '正在读取...' : keyName || '选择要上传的 Key 文件'}</Text>{keyBase64 ? <Check color={colors.success} size={16} /> : null}</Pressable></View>
          </> : null}
          {addFrom === 'path' ? <><View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>证书路径</Text><TextInput value={certPath} onChangeText={setCertPath} autoCapitalize="none" style={inputStyle} /></View><View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Key 路径</Text><TextInput value={keyPath} onChangeText={setKeyPath} autoCapitalize="none" style={inputStyle} /></View></> : null}
          {addFrom === 'acme' ? <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>签发域名</Text><TextInput value={domains} onChangeText={setDomains} multiline placeholder="每行填写一个域名" placeholderTextColor={colors.placeholder} textAlignVertical="top" style={[inputStyle, { minHeight: 88, paddingTop: 11 }]} /></View> : null}
          <View style={{ gap: 11, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>证书同步</Text>
            <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>同步到所有同步客户端</Text><Switch value={syncAll} onValueChange={setSyncAll} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>
            {!syncAll ? <View style={{ gap: 7 }}><Text style={{ color: colors.subtext, fontSize: 12 }}>同步客户端列表</Text>{syncClients.length ? syncClients.map((client, index) => { const key = clientKey(client, index); const active = selectedClients.includes(key); return <Pressable key={key} onPress={() => toggleClient(key)} style={{ minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.card, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center' }}>{active ? <Check color="#fff" size={13} /> : null}</View><Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>{pick(client, ['Name', 'ClientName', 'DeviceName'], key)}</Text></Pressable>; }) : <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无可用同步客户端</Text>}</View> : <Text style={{ color: colors.subtext, fontSize: 12 }}>将同步到当前全部 {syncClients.length} 个客户端</Text>}
          </View>
          {error ? <ErrorState message={error} /> : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}><Pressable disabled={busy} onPress={close} style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.subtext, fontWeight: '700' }}>取消</Text></Pressable><Pressable disabled={busy || Boolean(fileBusy)} onPress={submit} style={{ flex: 1.35, height: 48, borderRadius: 12, backgroundColor: busy || fileBusy ? colors.disabled : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><Plus color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? '添加中...' : '添加'}</Text></Pressable></View>
      </View>
      </KeyboardAvoidingView>
    </FullScreenSafeArea>
  </Modal>;
}

function SslAcmeEditor({ editor, busy, syncClients, close, save }: { editor: ServiceEditor; busy: boolean; syncClients: LuckyListItem[]; close: () => void; save: (value: LuckyRecord) => void }) {
  const colors = useAppTheme();
  const initial = editor.value;
  const [remark, setRemark] = useState(() => String(initial.Remark ?? ''));
  const [ext, setExt] = useState<LuckyRecord>(() => ({ ...childRecord(initial, 'ExtParams') }));
  const initialSync = childRecord(initial, 'SyncInfo');
  const [syncAll, setSyncAll] = useState(() => Boolean(initial.SyncAllClients ?? initialSync.SyncAllClients));
  const [selectedClients, setSelectedClients] = useState<string[]>(() => {
    const value = initial.SyncClients ?? initialSync.SyncClients;
    return Array.isArray(value) ? value.map(String) : [];
  });
  const [openSelect, setOpenSelect] = useState('');
  const [error, setError] = useState('');
  const inputStyle = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12 } as const;
  const dns = childRecord(ext, 'DNS');

  function existingKey(keys: string[]) {
    return keys.find((key) => ext[key] !== undefined) ?? keys[0];
  }

  function read(keys: string[], fallback: unknown = '') {
    for (const key of keys) if (ext[key] !== undefined) return ext[key];
    return fallback;
  }

  function write(keys: string[], next: unknown) {
    const key = existingKey(keys);
    setExt((current) => ({ ...current, [key]: next }));
  }

  function readDns(keys: string[], fallback: unknown = '') {
    for (const key of keys) if (dns[key] !== undefined) return dns[key];
    return read(keys, fallback);
  }

  function writeDns(keys: string[], next: unknown) {
    if (Object.keys(dns).length) {
      const key = keys.find((item) => dns[item] !== undefined) ?? keys[0];
      setExt((current) => ({ ...current, DNS: { ...childRecord(current, 'DNS'), [key]: next } }));
    } else write(keys, next);
  }

  function clientKey(item: LuckyListItem, index: number) {
    return pick(item, ['Key', 'ClientKey', 'key', 'ID', 'id'], String(index));
  }

  function Field({ label, keys, fallback = '', multiline = false, secret = false, dnsField = false }: { label: string; keys: string[]; fallback?: string; multiline?: boolean; secret?: boolean; dnsField?: boolean }) {
    const raw = dnsField ? readDns(keys, fallback) : read(keys, fallback);
    const text = Array.isArray(raw) ? raw.map(String).join('\n') : String(raw ?? '');
    return <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text><TextInput value={text} onChangeText={(next) => { const value = multiline && keys.some((key) => /domains|list/i.test(key)) ? next.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) : next; dnsField ? writeDns(keys, value) : write(keys, value); }} secureTextEntry={secret} multiline={multiline} autoCapitalize="none" autoCorrect={false} textAlignVertical={multiline ? 'top' : 'center'} style={[inputStyle, multiline ? { minHeight: 86, paddingTop: 11 } : null]} /></View>;
  }

  function Toggle({ label, keys }: { label: string; keys: string[] }) {
    return <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>{label}</Text><Switch value={Boolean(read(keys, false))} onValueChange={(next) => write(keys, next)} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>;
  }

  function SelectField({ label, keys, options, dnsField = false }: { label: string; keys: string[]; options: Array<{ label: string; value: string }>; dnsField?: boolean }) {
    const field = keys[0];
    const current = String(dnsField ? readDns(keys, options[0]?.value ?? '') : read(keys, options[0]?.value ?? ''));
    const open = openSelect === field;
    return <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text><Pressable onPress={() => setOpenSelect(open ? '' : field)} style={[inputStyle, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}><Text style={{ flex: 1, color: colors.text }}>{options.find((item) => item.value === current)?.label ?? current}</Text><ChevronDown color={open ? colors.primary : colors.subtext} size={17} /></Pressable>{open ? <View style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>{options.map((option, index) => <Pressable key={option.value} onPress={() => { dnsField ? writeDns(keys, option.value) : write(keys, option.value); setOpenSelect(''); }} style={{ minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, backgroundColor: current === option.value ? colors.primarySoft : colors.card }}><Text style={{ flex: 1, color: current === option.value ? colors.primary : colors.text, fontWeight: current === option.value ? '700' : '500' }}>{option.label}</Text>{current === option.value ? <Check color={colors.primary} size={16} /> : null}</Pressable>)}</View> : null}</View>;
  }

  function Stepper({ label, keys, fallback }: { label: string; keys: string[]; fallback: number }) {
    const current = Number(read(keys, fallback)) || fallback;
    return <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>{label}</Text><Pressable onPress={() => write(keys, Math.max(0, current - 10))} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 18 }}>-</Text></Pressable><TextInput value={String(current)} onChangeText={(next) => write(keys, Number.parseInt(next, 10) || 0)} keyboardType="number-pad" style={{ width: 64, height: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, textAlign: 'center', backgroundColor: colors.card }} /><Pressable onPress={() => write(keys, current + 10)} style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 18 }}>+</Text></Pressable></View>;
  }

  function toggleClient(key: string) {
    setSelectedClients((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function submit() {
    const domainValue = read(['acmeDomains', 'Domains'], initial.Domains ?? []);
    const domains = Array.isArray(domainValue) ? domainValue.map(String).filter((item) => item.trim()) : String(domainValue).split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    if (!domains.length) return setError('请至少填写一个域名或 IP');
    const allClientKeys = syncClients.map(clientKey);
    const syncKeys = syncAll ? allClientKeys : selectedClients;
    setError('');
    save({ ...initial, Remark: remark.trim(), AddFrom: 'acme', Domains: domains, ExtParams: { ...ext, [existingKey(['acmeDomains', 'Domains'])]: domains }, SyncAllClients: syncAll, SyncClients: syncKeys, SyncInfo: { ...initialSync, SyncAllClients: syncAll, SyncClients: syncKeys } });
  }

  return <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={close}><FullScreenSafeArea style={{ flex: 1, backgroundColor: colors.card }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><View style={{ flex: 1, width: '100%', backgroundColor: colors.card, padding: 18, gap: 13 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><IconTile icon={ShieldCheck} color={colors.success} background={colors.successBg} size={36} iconSize={18} /><Text style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' }}>编辑证书</Text><Pressable accessibilityLabel="关闭" onPress={close} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center' }}><X color={colors.subtext} size={18} /></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: 13, paddingBottom: 4 }} style={{ flex: 1 }}>
      <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>证书备注</Text><TextInput value={remark} onChangeText={setRemark} style={inputStyle} /></View>
      {SelectField({ label: '添加方式', keys: ['AddFrom'], options: [{ label: 'ACME', value: 'acme' }] })}
      {SelectField({ label: '证书颁发机构', keys: ['acmeCA', 'ACMECA', 'CA'], options: [{ label: "Let's Encrypt", value: 'letsencrypt' }, { label: 'ZeroSSL', value: 'zerossl' }, { label: 'Google Trust Services', value: 'google' }, { label: '自定义 ACME', value: 'custom' }] })}
      {Toggle({ label: 'EAB 认证', keys: ['enableEAB', 'EnableEAB', 'EABEnable'] })}
      {Boolean(read(['enableEAB', 'EnableEAB', 'EABEnable'], false)) ? <>{Field({ label: 'EAB Key ID', keys: ['eabKid', 'EABKid', 'EABKeyID'] })}{Field({ label: 'EAB HMAC Key', keys: ['eabHmacKey', 'EABHmacKey'], secret: true })}</> : null}
      {SelectField({ label: '验证方式', keys: ['dnsProvider', 'DNSProvider', 'Provider', 'Type'], dnsField: true, options: [{ label: '阿里云', value: 'alidns' }, { label: '腾讯云 DNSPod', value: 'dnspod' }, { label: 'Cloudflare', value: 'cloudflare' }, { label: '华为云', value: 'huaweicloud' }, { label: '手动 DNS', value: 'manual' }] })}
      {Field({ label: 'ID', keys: ['ID', 'id', 'AccessKeyID', 'AccessKeyId'], dnsField: true })}
      {Field({ label: 'Secret', keys: ['Secret', 'secret', 'AccessKeySecret'], dnsField: true, secret: true })}
      {Field({ label: '域名/IP 列表', keys: ['acmeDomains', 'Domains'], fallback: Array.isArray(initial.Domains) ? initial.Domains.map(String).join('\n') : '', multiline: true })}
      {Field({ label: '电子邮箱', keys: ['email', 'Email'] })}
      {SelectField({ label: '算法选择', keys: ['algorithm', 'Algorithm', 'KeyType'], options: [{ label: 'RSA2048', value: 'RSA2048' }, { label: 'RSA4096', value: 'RSA4096' }, { label: 'EC256', value: 'EC256' }, { label: 'EC384', value: 'EC384' }] })}
      {SelectField({ label: '证书配置', keys: ['certConfig', 'CertConfig', 'CertificateProfile'], options: [{ label: '默认（普通域名证书）', value: 'default' }, { label: '短期证书', value: 'shortlived' }, { label: '自定义', value: 'custom' }] })}
      <View style={{ gap: 9, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>更多设置</Text>
        {Toggle({ label: '每次请求轮换私钥', keys: ['renewPrivateKey', 'RenewPrivateKey'] })}{Toggle({ label: '使用全局私钥', keys: ['useGlobalPrivateKey', 'UseGlobalPrivateKey'] })}{Toggle({ label: '串行化验证', keys: ['sequential', 'Sequential'] })}{Toggle({ label: '通过 DNS 查询获取主域名', keys: ['findZoneByFqdn', 'FindZoneByFqdn'] })}{Toggle({ label: 'CNAME 支持', keys: ['cnameSupport', 'CNAMEFollow'] })}{Toggle({ label: '使用 IPv4 网络申请证书', keys: ['useIPv4', 'UseIPv4'] })}{Toggle({ label: 'DNS 查询强制 IPv4', keys: ['dnsQueryIPv4', 'DNSQueryIPv4'] })}{Toggle({ label: 'DNS 查询仅使用 TCP', keys: ['dnsQueryTCP', 'DNSQueryTCP'] })}{Toggle({ label: '禁用完整传播要求', keys: ['disableCompletePropagationRequirement', 'DisableCompletePropagationRequirement'] })}{Toggle({ label: '忽略传播检查错误', keys: ['ignorePropagationCheckError', 'IgnorePropagationCheckError'] })}{Toggle({ label: '禁用权威 NS 传播检查', keys: ['disableAuthoritativeNssPropagationRequirement', 'DisableAuthoritativeNssPropagationRequirement'] })}{Stepper({ label: '传播检测超时（秒）', keys: ['propagationTimeout', 'PropagationTimeout'], fallback: 600 })}{Stepper({ label: '等待证书最长时间（秒）', keys: ['certTimeout', 'CertTimeout', 'WaitCertificateTimeout'], fallback: 120 })}
      </View>
      <View style={{ gap: 9, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>代理设置</Text>{SelectField({ label: '代理类型', keys: ['proxyType', 'ProxyType'], options: [{ label: '禁用', value: 'disabled' }, { label: 'HTTP', value: 'http' }, { label: 'SOCKS5', value: 'socks5' }] })}{String(read(['proxyType', 'ProxyType'], 'disabled')) !== 'disabled' ? Field({ label: '代理地址', keys: ['proxyURL', 'ProxyURL'] }) : null}</View>
      <View style={{ gap: 9, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard }}>{Toggle({ label: '证书映射', keys: ['enableCertMapping', 'EnableCertMapping', 'CertMapping'] })}</View>
      <View style={{ gap: 11, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>证书同步</Text><View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>同步到所有同步客户端</Text><Switch value={syncAll} onValueChange={setSyncAll} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>{!syncAll ? <View style={{ gap: 7 }}>{syncClients.length ? syncClients.map((client, index) => { const key = clientKey(client, index); const active = selectedClients.includes(key); return <Pressable key={key} onPress={() => toggleClient(key)} style={{ minHeight: 42, borderRadius: 8, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primarySoft : colors.card, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card, alignItems: 'center', justifyContent: 'center' }}>{active ? <Check color="#fff" size={13} /> : null}</View><Text style={{ flex: 1, color: colors.text }}>{pick(client, ['Name', 'ClientName', 'DeviceName'], key)}</Text></Pressable>; }) : <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无可用同步客户端</Text>}</View> : null}</View>
      {error ? <ErrorState message={error} /> : null}
    </ScrollView>
    <View style={{ flexDirection: 'row', gap: 8 }}><Pressable disabled={busy} onPress={close} style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.subtext, fontWeight: '700' }}>取消</Text></Pressable><Pressable disabled={busy} onPress={submit} style={{ flex: 1.35, height: 48, borderRadius: 12, backgroundColor: busy ? colors.disabled : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><Save color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? '保存中...' : '修改'}</Text></Pressable></View>
  </View></KeyboardAvoidingView></FullScreenSafeArea></Modal>;
}

export default function ServiceDetailScreen() {
  const colors = useAppTheme();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = (params.kind && params.kind in config ? params.kind : 'webservice') as LuckyServiceKind;
  const meta = config[kind];
  const [view, setView] = useState<'list' | 'logs'>('list');
  const [selectedKey, setSelectedKey] = useState('');
  const [logKey, setLogKey] = useState<string>();
  const [logPage, setLogPage] = useState(1);
  const [logMode, setLogMode] = useState<'page' | 'recent'>('page');
  const [ddnsEditor, setDdnsEditor] = useState<ServiceEditor>();
  const [sslEditor, setSslEditor] = useState<ServiceEditor>();
  const [sslAddOpen, setSslAddOpen] = useState(false);
  const [advanced, setAdvanced] = useState<{ key: string; name: string; item: LuckyRecord }>();
  const isFocused = useIsFocused();
  const logsEnabled = view === 'logs';
  const query = useQuery({ queryKey: ['lucky', 'service', kind], queryFn: ({ signal }) => getServiceItems(kind, signal) });
  const detailQuery = useQuery({
    queryKey: ['lucky', 'service', kind, 'detail', selectedKey],
    queryFn: ({ signal }) => getServiceDetail(kind, selectedKey, signal),
    enabled: Boolean(selectedKey),
  });
  const logsQuery = useQuery({
    queryKey: ['lucky', 'service', kind, 'logs', logKey, logPage, logMode],
    queryFn: ({ signal }) => logMode === 'recent' ? getServiceLastLogs(kind, logKey, signal) : getServiceLogs(kind, logKey, signal, logPage),
    enabled: logsEnabled && isFocused,
    refetchInterval: logsEnabled && isFocused && (logMode === 'recent' || logPage === 1) ? 10000 : false,
    refetchIntervalInBackground: false,
  });
  const sslSyncClients = useQuery({
    queryKey: ['lucky', 'service', 'ssl', 'sync-clients'],
    queryFn: ({ signal }) => getSslSyncClientOptions(signal),
    enabled: kind === 'ssl' && (sslAddOpen || sslEditor?.type === 'item'),
  });
  const mutation = useMutation({
    mutationFn: (input: { key: string; action?: string; enabled?: boolean }) => input.action
      ? runServiceAction(kind, input.key, input.action)
      : setServiceEnabled(kind, input.key, Boolean(input.enabled)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', kind] });
      if (selectedKey) await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', kind, 'detail', selectedKey] });
    },
  });
  const ddnsMutation = useMutation({
    mutationFn: async ({ editor, value }: { editor: ServiceEditor; value: LuckyRecord }) => {
      if (editor.type === 'settings') return updateDdnsConfigure(value);
      return editor.key ? updateDdnsTask(editor.key, value) : createDdnsTask(value);
    },
    onSuccess: async () => {
      setDdnsEditor(undefined);
      await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ddns'] });
    },
  });
  const sslMutation = useMutation({
    mutationFn: async ({ editor, value }: { editor: ServiceEditor; value: LuckyRecord }) => {
      if (editor.type === 'settings') return updateSslSetting(value);
      return editor.key ? updateSslCertificate(value) : createSslCertificate(value);
    },
    onSuccess: async () => {
      setSslEditor(undefined);
      setSslAddOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ssl'] });
    },
  });

  async function editDdnsTask(key: string) {
    try {
      const payload = await getDdnsTask(key);
      setDdnsEditor({ type: 'item', title: '编辑 DDNS 任务', key, value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 DDNS 任务');
    }
  }

  async function editDdnsConfigure() {
    try {
      const payload = await getDdnsConfigure();
      setDdnsEditor({ type: 'settings', title: 'DDNS 模块设置', value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 DDNS 设置');
    }
  }

  function removeDdnsTask(key: string, name: string) {
    Alert.alert('确认删除', `确定删除 DDNS 任务“${name}”吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { try { await deleteDdnsTask(key); await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ddns'] }); } catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : '请求失败'); } } },
    ]);
  }

  async function editSslCertificate(key: string) {
    try {
      const payload = await getSslCertificate(key);
      setSslEditor({ type: 'item', title: '编辑 SSL 证书', key, value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 SSL 证书');
    }
  }

  async function editSslSetting() {
    try {
      const payload = await getSslSetting();
      setSslEditor({ type: 'settings', title: 'SSL 模块设置', value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 SSL 设置');
    }
  }

  function removeSslCertificate(key: string, name: string) {
    Alert.alert('确认删除', `确定删除 SSL 证书“${name}”吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { try { await deleteSslCertificate(key); await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ssl'] }); } catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : '请求失败'); } } },
    ]);
  }

  function confirmAction(key: string, action: string, label: string) {
    Alert.alert(`确认${label}`, `该操作会修改 ${meta.title} 的运行状态，是否继续？`, [
      { text: '取消', style: 'cancel' },
      { text: '继续', style: 'destructive', onPress: () => mutation.mutate({ key, action }) },
    ]);
  }

  function confirmEnabled(key: string, enabled: boolean) {
    const label = enabled ? '启用' : '停用';
    Alert.alert(`确认${label}`, `是否${label}这项${meta.title}配置？`, [
      { text: '取消', style: 'cancel' },
      { text: label, style: enabled ? 'default' : 'destructive', onPress: () => mutation.mutate({ key, enabled }) },
    ]);
  }

  function showLogs(key?: string) {
    setLogKey(key);
    setLogPage(1);
    setLogMode('page');
    setView('logs');
  }

  function openAdvanced(key: string, name: string, item: LuckyRecord) {
    setAdvanced({ key, name, item });
  }

  function openOrdering() {
    const first = query.data?.items?.[0];
    if (!first) return Alert.alert('暂无项目', '请先添加一项配置');
    const key = itemKey(first, 0);
    const name = pick(first, kind === 'ssl' ? ['Remark', 'remark', 'Name', 'name'] : ['Name', 'name', 'TaskName', 'taskName', 'DDNSTaskName'], '项目 1');
    openAdvanced(key, name, first);
  }

  async function reorderServiceTasks(keys: string[]) {
    if (kind === 'ddns') {
      await reorderDdnsTasks(keys);
    } else {
      await reorderSslCertificates(keys);
    }
    await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', kind] });
  }

  return <Page title={meta.title} subtitle={meta.subtitle} icon={meta.icon} safeTop={false} scrollable={false} refreshing={query.isFetching || logsQuery.isFetching} onRefresh={() => view === 'logs' && logsEnabled ? logsQuery.refetch() : query.refetch()}>
    <View style={{ padding: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', gap: 4 }}>
      {([['list', '列表', List], ['logs', '日志', FileText]] as const).map(([value, label, Icon]) => {
        const selected = view === value;
        return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => { setView(value); if (value === 'logs') setLogKey(undefined); }} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: selected ? colors.card : 'transparent', opacity: pressed ? 0.62 : 1 })}><Icon color={selected ? colors.primary : colors.subtext} size={16} strokeWidth={selected ? 2.4 : 2.1} /><Text style={{ color: selected ? colors.primary : colors.subtext, fontWeight: '700' }}>{label}</Text></Pressable>;
      })}
    </View>
    {mutation.error ? <ErrorState message={mutation.error.message} /> : null}
    {ddnsMutation.error ? <ErrorState message={ddnsMutation.error.message} /> : null}
    {sslMutation.error ? <ErrorState message={sslMutation.error.message} /> : null}

    {view === 'logs' ? <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {logKey ? <Pressable onPress={() => { setLogKey(undefined); setLogPage(1); }} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 9, backgroundColor: colors.mutedCard, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>查看模块日志</Text></Pressable> : null}
        <Pressable onPress={() => { setLogMode((current) => current === 'recent' ? 'page' : 'recent'); setLogPage(1); }} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 9, backgroundColor: logMode === 'recent' ? colors.primarySoft : colors.mutedCard, flexDirection: 'row', alignItems: 'center', gap: 5 }}><RotateCw color={logMode === 'recent' ? colors.primary : colors.subtext} size={14} /><Text style={{ color: logMode === 'recent' ? colors.primary : colors.subtext, fontWeight: '700', fontSize: 12 }}>{logMode === 'recent' ? '最近日志' : '分页日志'}</Text></Pressable>
      </View>
      {logsEnabled && logsQuery.error ? <ErrorState message={logsQuery.error.message} retry={() => logsQuery.refetch()} /> : null}
      {logsEnabled ? <FlatList
        data={logsQuery.data?.lines ?? []}
        keyExtractor={(line, index) => `${index}-${line.slice(0, 24)}`}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={30}
        maxToRenderPerBatch={30}
        windowSize={9}
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ paddingBottom: 98, flexGrow: logsQuery.data?.lines.length ? 0 : 1 }}
        ListEmptyComponent={!logsQuery.isLoading && !logsQuery.error ? <EmptyState message="暂无日志" /> : null}
        renderItem={({ item: line, index }) => <Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 18, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, backgroundColor: colors.card }}>{line}</Text>}
        ListFooterComponent={logsQuery.data?.lines.length ? <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center', paddingVertical: 8 }}>本页显示 {logsQuery.data.lines.length} 行</Text> : null}
      /> : null}
      {logsEnabled && logMode === 'page' ? <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }}><Pressable accessibilityLabel="上一页日志" disabled={logPage <= 1 || logsQuery.isFetching} onPress={() => setLogPage((page) => Math.max(1, page - 1))} style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: logPage <= 1 ? colors.muted : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><ChevronLeft color={logPage <= 1 ? colors.disabled : colors.primary} size={18} /></Pressable><Text style={{ minWidth: 82, color: colors.subtext, fontSize: 12, textAlign: 'center' }}>{logsQuery.data?.total === undefined ? `第 ${logPage} 页` : `${logPage} / ${Math.max(1, Math.ceil(logsQuery.data.total / logsQuery.data.pageSize))}`}</Text><Pressable accessibilityLabel="下一页日志" disabled={logsQuery.isFetching || !logsQuery.data?.hasMore} onPress={() => setLogPage((page) => page + 1)} style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: !logsQuery.data?.hasMore ? colors.muted : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><ChevronRight color={!logsQuery.data?.hasMore ? colors.disabled : colors.primary} size={18} /></Pressable></View> : null}
    </> : <>
      {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
      {kind === 'ddns' ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setDdnsEditor({ type: 'item', title: '添加 DDNS 任务', value: { TaskName: '', Enable: true, Records: [] } })} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>添加任务</Text></Pressable>
        <Pressable onPress={editDdnsConfigure} style={{ flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Settings2 color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>模块设置</Text></Pressable>
        <Pressable accessibilityLabel="排序和测试工具" onPress={openOrdering} style={{ width: 82, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ListOrdered color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>排序</Text></Pressable>
      </View> : null}
      {kind === 'ssl' ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setSslAddOpen(true)} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>添加证书</Text></Pressable>
        <Pressable onPress={editSslSetting} style={{ flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Settings2 color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>模块设置</Text></Pressable>
        <Pressable accessibilityLabel="证书排序" onPress={openOrdering} style={{ width: 82, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><ListOrdered color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>排序</Text></Pressable>
      </View> : null}
      <FlatList
        data={query.data?.items ?? []}
        keyExtractor={(item, index) => itemKey(item, index)}
        extraData={`${selectedKey}:${mutation.isPending}:${detailQuery.dataUpdatedAt}`}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={{ paddingBottom: 98, flexGrow: query.data?.items.length ? 0 : 1 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={!query.isLoading && !query.error ? <EmptyState message="接口未返回列表数据" /> : null}
        renderItem={({ item, index }) => {
        const key = itemKey(item, index);
        const expanded = selectedKey === key;
        const name = pick(item, kind === 'ssl' ? ['Remark', 'remark', 'Name', 'name'] : ['Name', 'name', 'TaskName', 'taskName', 'DDNSTaskName', 'Names', 'Domain', 'Domains'], `项目 ${index + 1}`);
        const status = isAcmeIssuing(item) ? '签发中' : pick(item, ['Status', 'status', 'State', 'state', 'LastResult'], isEnabled(item) ? '正常' : '已停用');
        const detail = kind === 'docker' ? pick(item, ['Image', 'image', 'ImageName']) : kind === 'ssl' ? sslSummary(item) : kind === 'ddns' ? pick(item, ['Domain', 'Domains', 'DNSProvider', 'Provider', 'LastRun', 'LastSyncTime']) : pick(item, ['BackendURL', 'ProxyURL', 'Listen', 'Domains']);
        const sslIsSyncSource = kind === 'ssl' && pick(item, ['AddFrom', 'Type'], 'file').trim().toLowerCase() === 'sync';
        return <Panel>
          <Pressable onPress={() => setSelectedKey(expanded ? '' : key)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{name}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, marginTop: 5 }}>{detail}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}><Text style={{ color: /run|正常|success|active|up/i.test(status) ? colors.success : colors.subtext, fontSize: 12 }}>{status}</Text>{expanded ? <ChevronUp color={colors.subtext} size={17} /> : <ChevronDown color={colors.subtext} size={17} />}</View>
          </Pressable>
          {kind === 'ddns' || kind === 'ssl' ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.text, fontSize: 13 }}>启用</Text><Switch value={isEnabled(item)} disabled={mutation.isPending} onValueChange={(value) => confirmEnabled(key, value)} trackColor={{ false: colors.disabled, true: colors.primary }} /></View> : null}
          {kind === 'docker' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[
            ['start', '启动', Play], ['stop', '停止', Square], ['restart', '重启', RotateCw], ['pause', '暂停', Pause], ['unpause', '恢复', Play],
          ].map(([action, label, Icon]) => <Pressable key={String(action)} disabled={mutation.isPending} onPress={() => confirmAction(key, String(action), String(label))} style={{ width: '31%', minWidth: 82, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Icon color={colors.text} size={15} /><Text style={{ color: colors.text, fontSize: 12 }}>{String(label)}</Text></Pressable>)}</View> : kind === 'ddns' ? <View style={{ flexDirection: 'row', gap: 7 }}>
            <Pressable disabled={mutation.isPending} onPress={() => confirmAction(key, 'sync', '手动同步')} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><RefreshCw color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>同步</Text></Pressable>
            <Pressable onPress={() => editDdnsTask(key)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Pencil color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>编辑</Text></Pressable>
            <Pressable onPress={() => removeDdnsTask(key, name)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Trash2 color={colors.danger} size={15} /><Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>删除</Text></Pressable>
          </View> : kind === 'ssl' ? <View style={{ flexDirection: 'row', gap: 7 }}>
            <Pressable disabled={mutation.isPending} onPress={() => confirmAction(key, sslIsSyncSource ? 'sync' : 'flush', sslIsSyncSource ? '同步证书' : '刷新证书')} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><RefreshCw color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{sslIsSyncSource ? '同步' : '刷新'}</Text></Pressable>
            <Pressable onPress={() => editSslCertificate(key)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Pencil color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>编辑</Text></Pressable>
            <Pressable onPress={() => removeSslCertificate(key, name)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Trash2 color={colors.danger} size={15} /><Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>删除</Text></Pressable>
          </View> : null}
          {kind === 'ddns' || kind === 'ssl' ? <Pressable accessibilityLabel="更多操作" onPress={() => openAdvanced(key, name, item)} style={{ height: 38, borderRadius: 9, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}><Ellipsis color={colors.primary} size={17} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>更多操作</Text></Pressable> : null}
          {kind === 'docker' || kind === 'ssl' ? <Pressable onPress={() => showLogs(key)} style={{ height: 38, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}><FileText color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>查看日志</Text></Pressable> : null}
          {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 }}>
            {detailQuery.error ? <ErrorState message={detailQuery.error.message} retry={() => detailQuery.refetch()} /> : null}
            {detailQuery.data ? <StructuredDataView value={detailValue(detailQuery.data)} /> : null}
          </View> : null}
        </Panel>;
        }}
      />
    </>}
    {ddnsEditor ? <ServiceFormEditor key={`${ddnsEditor.type}-${ddnsEditor.key ?? 'new'}`} editor={ddnsEditor} busy={ddnsMutation.isPending} close={() => setDdnsEditor(undefined)} save={(value) => ddnsMutation.mutate({ editor: ddnsEditor, value })} /> : null}
    {sslAddOpen ? <SslCertificateEditor busy={sslMutation.isPending} syncClients={sslSyncClients.data ?? []} close={() => setSslAddOpen(false)} save={(value) => sslMutation.mutate({ editor: { type: 'item', title: '添加 SSL 证书', value }, value })} /> : null}
    {sslEditor && sslEditor.type === 'item' && pick(sslEditor.value, ['AddFrom', 'Type'], 'file').toLowerCase() === 'acme' ? <SslAcmeEditor key={sslEditor.key} editor={sslEditor} busy={sslMutation.isPending} syncClients={sslSyncClients.data ?? []} close={() => setSslEditor(undefined)} save={(value) => sslMutation.mutate({ editor: sslEditor, value })} /> : sslEditor ? <ServiceFormEditor key={`${sslEditor.type}-${sslEditor.key ?? 'new'}`} editor={sslEditor} busy={sslMutation.isPending} close={() => setSslEditor(undefined)} save={(value) => sslMutation.mutate({ editor: sslEditor, value })} /> : null}
    {advanced ? <ServiceAdvancedSheet
      kind={kind === 'ssl' ? 'ssl' : 'ddns'}
      itemKeyValue={advanced.key}
      name={advanced.name}
      item={advanced.item}
      orderKeys={(query.data?.items ?? []).map((entry, index) => itemKey(entry, index))}
      onClose={() => setAdvanced(undefined)}
      onChanged={() => { void queryClient.invalidateQueries({ queryKey: ['lucky', 'service', kind] }); }}
      onReorderTasks={reorderServiceTasks}
      onShowLogs={() => { setAdvanced(undefined); showLogs(advanced.key); }}
    /> : null}
  </Page>;
}
