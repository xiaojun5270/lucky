import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Play, RefreshCw, RotateCw, Square } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';

import { EmptyState, ErrorState, Page, Panel } from '@/src/components/lucky-ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getServiceItems, runServiceAction } from '@/src/services/lucky';
import type { LuckyListItem, LuckyServiceKind } from '@/src/types/lucky';

const config = {
  webservice: { title: '反向代理', subtitle: '域名、监听与后端规则' },
  ddns: { title: '动态域名', subtitle: 'DDNS 任务状态与同步' },
  docker: { title: 'Docker 容器', subtitle: '容器运行状态与控制' },
  ssl: { title: 'SSL 证书', subtitle: '证书有效期与同步状态' },
} as const;

function pick(item: LuckyListItem, keys: string[], fallback = '--') { for (const key of keys) { const value = item[key]; if (typeof value === 'string' || typeof value === 'number') return String(value); if (Array.isArray(value)) return value.join(', '); } return fallback; }
function itemKey(item: LuckyListItem, index: number) { return pick(item, ['Key', 'key', 'id', 'ID', 'Id'], String(index)); }

export default function ServiceDetailScreen() {
  const colors = useAppTheme();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = (params.kind && params.kind in config ? params.kind : 'webservice') as LuckyServiceKind;
  const meta = config[kind];
  const query = useQuery({ queryKey: ['lucky', 'service', kind], queryFn: () => getServiceItems(kind) });
  const mutation = useMutation({ mutationFn: ({ key, action }: { key: string; action: string }) => runServiceAction(kind, key, action), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lucky', 'service', kind] }) });

  const confirm = (key: string, action: string, label: string) => Alert.alert(`确认${label}`, `该操作会修改 ${meta.title} 的运行状态，是否继续？`, [{ text: '取消', style: 'cancel' }, { text: '继续', style: 'destructive', onPress: () => mutation.mutate({ key, action }) }]);
  return <Page title={meta.title} subtitle={meta.subtitle} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}{mutation.error ? <ErrorState message={mutation.error.message} /> : null}
    {query.data?.items.length ? query.data.items.map((item, index) => { const key = itemKey(item, index); const name = pick(item, ['Name', 'name', 'TaskName', 'Names', 'Domain', 'Domains'], `项目 ${index + 1}`); const status = pick(item, ['Status', 'status', 'State', 'state', 'LastResult'], (item.Enable ?? item.enable) === false ? '已停用' : '正常'); const detail = kind === 'docker' ? pick(item, ['Image', 'image', 'ImageName']) : kind === 'ssl' ? pick(item, ['Domains', 'ExpireTime', 'Type']) : kind === 'ddns' ? pick(item, ['Domain', 'DNSProvider', 'LastRun']) : pick(item, ['BackendURL', 'ProxyURL', 'Listen', 'Domains']); return <Panel key={key}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{name}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, marginTop: 5 }}>{detail}</Text></View><Text style={{ color: /run|正常|success|active/i.test(status) ? colors.success : colors.subtext, fontSize: 12 }}>{status}</Text></View>
      {kind === 'docker' ? <View style={{ flexDirection: 'row', gap: 8 }}>{[['start', '启动', Play], ['stop', '停止', Square], ['restart', '重启', RotateCw]].map(([action, label, Icon]) => <Pressable key={String(action)} disabled={mutation.isPending} onPress={() => confirm(key, String(action), String(label))} style={{ flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Icon color={colors.text} size={15} /><Text style={{ color: colors.text, fontSize: 12 }}>{String(label)}</Text></Pressable>)}</View> : kind === 'ddns' || kind === 'ssl' ? <Pressable disabled={mutation.isPending} onPress={() => confirm(key, 'sync', '手动同步')} style={{ height: 40, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><RefreshCw color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '700' }}>手动同步</Text></Pressable> : null}</Panel>; }) : !query.isLoading && !query.error ? <EmptyState message="接口未返回列表数据" /> : null}
  </Page>;
}
