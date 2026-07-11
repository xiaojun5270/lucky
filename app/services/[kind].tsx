import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Container, FileText, Globe2, List, Pause, Play, RefreshCw, RotateCw, ShieldCheck, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { EmptyState, ErrorState, Page, Panel } from '@/src/components/lucky-ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getServiceDetail, getServiceItems, getServiceLogs, runServiceAction, setServiceEnabled } from '@/src/services/lucky';
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
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(String).join(', ');
  }
  return fallback;
}

function itemKey(item: LuckyListItem, index: number) {
  return pick(item, ['Key', 'key', 'TaskKey', 'ID', 'Id', 'id'], String(index));
}

function isEnabled(item: LuckyListItem) {
  const value: unknown = (item as LuckyRecord).Enable ?? (item as LuckyRecord).enable;
  return value !== false && value !== 0 && value !== 'false';
}

function detailRows(payload?: LuckyRecord) {
  if (!payload) return [];
  const nested = [payload.data, payload.rule, payload.task, payload.container, payload.ssl]
    .find((value) => value && typeof value === 'object' && !Array.isArray(value));
  const source = (nested ?? payload) as LuckyRecord;
  return Object.entries(source)
    .filter(([key]) => !['ret', 'msg'].includes(key))
    .slice(0, 18)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return [key, text.length > 240 ? `${text.slice(0, 240)}...` : text] as const;
    });
}

export default function ServiceDetailScreen() {
  const colors = useAppTheme();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = (params.kind && params.kind in config ? params.kind : 'webservice') as LuckyServiceKind;
  const meta = config[kind];
  const [view, setView] = useState<'list' | 'logs'>('list');
  const [selectedKey, setSelectedKey] = useState('');
  const [logKey, setLogKey] = useState<string>();
  const logsEnabled = view === 'logs' && (kind !== 'ssl' || Boolean(logKey));
  const query = useQuery({ queryKey: ['lucky', 'service', kind], queryFn: () => getServiceItems(kind) });
  const detailQuery = useQuery({
    queryKey: ['lucky', 'service', kind, 'detail', selectedKey],
    queryFn: () => getServiceDetail(kind, selectedKey),
    enabled: Boolean(selectedKey),
  });
  const logsQuery = useQuery({
    queryKey: ['lucky', 'service', kind, 'logs', logKey],
    queryFn: () => getServiceLogs(kind, logKey),
    enabled: logsEnabled,
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
    setView('logs');
  }

  return <Page title={meta.title} subtitle={meta.subtitle} icon={meta.icon} refreshing={query.isFetching || logsQuery.isFetching} onRefresh={() => view === 'logs' && logsEnabled ? logsQuery.refetch() : query.refetch()}>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {([['list', '列表', List], ['logs', '日志', FileText]] as const).map(([value, label, Icon]) => <Pressable key={value} onPress={() => { setView(value); if (value === 'logs') setLogKey(undefined); }} style={{ flex: 1, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: view === value ? colors.primary : colors.card, borderWidth: 1, borderColor: view === value ? colors.primary : colors.border }}><Icon color={view === value ? '#fff' : colors.text} size={16} /><Text style={{ color: view === value ? '#fff' : colors.text, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </View>
    {mutation.error ? <ErrorState message={mutation.error.message} /> : null}

    {view === 'logs' ? <>
      {logKey ? <Pressable onPress={() => setLogKey(undefined)}><Text style={{ color: colors.primary, fontWeight: '700' }}>查看模块日志</Text></Pressable> : null}
      {!logsEnabled ? <EmptyState message="请从证书列表中选择要查看日志的证书" /> : null}
      {logsEnabled && logsQuery.error ? <ErrorState message={logsQuery.error.message} retry={() => logsQuery.refetch()} /> : null}
      {logsEnabled && logsQuery.data?.lines.length ? <Panel>{logsQuery.data.lines.map((line, index) => <Text key={`${index}-${line.slice(0, 16)}`} selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 18 }}>{line}</Text>)}</Panel> : logsEnabled && !logsQuery.isLoading && !logsQuery.error ? <EmptyState message="暂无日志" /> : null}
    </> : <>
      {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
      {query.data?.items.length ? query.data.items.map((item, index) => {
        const key = itemKey(item, index);
        const expanded = selectedKey === key;
        const name = pick(item, ['Name', 'name', 'TaskName', 'Names', 'Domain', 'Domains'], `项目 ${index + 1}`);
        const status = pick(item, ['Status', 'status', 'State', 'state', 'LastResult'], isEnabled(item) ? '正常' : '已停用');
        const detail = kind === 'docker' ? pick(item, ['Image', 'image', 'ImageName']) : kind === 'ssl' ? pick(item, ['Domains', 'ExpireTime', 'Type']) : kind === 'ddns' ? pick(item, ['Domain', 'DNSProvider', 'LastRun']) : pick(item, ['BackendURL', 'ProxyURL', 'Listen', 'Domains']);
        return <Panel key={key}>
          <Pressable onPress={() => setSelectedKey(expanded ? '' : key)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{name}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, marginTop: 5 }}>{detail}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}><Text style={{ color: /run|正常|success|active|up/i.test(status) ? colors.success : colors.subtext, fontSize: 12 }}>{status}</Text>{expanded ? <ChevronUp color={colors.subtext} size={17} /> : <ChevronDown color={colors.subtext} size={17} />}</View>
          </Pressable>
          {kind === 'ddns' || kind === 'ssl' ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.text, fontSize: 13 }}>启用</Text><Switch value={isEnabled(item)} disabled={mutation.isPending} onValueChange={(value) => confirmEnabled(key, value)} trackColor={{ false: colors.disabled, true: colors.primary }} /></View> : null}
          {kind === 'docker' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[
            ['start', '启动', Play], ['stop', '停止', Square], ['restart', '重启', RotateCw], ['pause', '暂停', Pause], ['unpause', '恢复', Play],
          ].map(([action, label, Icon]) => <Pressable key={String(action)} disabled={mutation.isPending} onPress={() => confirmAction(key, String(action), String(label))} style={{ width: '31%', minWidth: 82, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Icon color={colors.text} size={15} /><Text style={{ color: colors.text, fontSize: 12 }}>{String(label)}</Text></Pressable>)}</View> : kind === 'ddns' || kind === 'ssl' ? <Pressable disabled={mutation.isPending} onPress={() => confirmAction(key, 'sync', '手动同步')} style={{ height: 40, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><RefreshCw color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '700' }}>手动同步</Text></Pressable> : null}
          {kind === 'docker' || kind === 'ssl' ? <Pressable onPress={() => showLogs(key)} style={{ height: 38, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}><FileText color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>查看日志</Text></Pressable> : null}
          {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 }}>
            {detailQuery.error ? <ErrorState message={detailQuery.error.message} retry={() => detailQuery.refetch()} /> : null}
            {detailRows(detailQuery.data).map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 10 }}><Text style={{ width: 100, color: colors.subtext, fontSize: 11 }}>{label}</Text><Text selectable style={{ flex: 1, color: colors.text, fontSize: 11, lineHeight: 17 }}>{value}</Text></View>)}
          </View> : null}
        </Panel>;
      }) : !query.isLoading && !query.error ? <EmptyState message="接口未返回列表数据" /> : null}
    </>}
  </Page>;
}
