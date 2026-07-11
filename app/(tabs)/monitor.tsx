import { useQuery } from '@tanstack/react-query';
import { Activity, Box, CheckCircle2, Cpu, Network, Server } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { EmptyState, ErrorState, Page, Panel } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLuckyDashboard } from '@/src/services/lucky';
import type { LuckyRecord } from '@/src/types/lucky';

function readable(record: LuckyRecord, keys: string[], fallback = '--') {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '正常' : '未启用';
  }
  return fallback;
}

export default function DashboardScreen() {
  const colors = useAppTheme();
  const query = useQuery({ queryKey: ['lucky', 'dashboard'], queryFn: getLuckyDashboard, refetchInterval: 30000 });
  const status = query.data?.status ?? {};
  const info = query.data?.info ?? {};
  const metrics = [
    { label: '运行状态', value: readable(status, ['status', 'Status', 'running'], '在线'), icon: CheckCircle2 },
    { label: 'Lucky 版本', value: readable(info, ['version', 'Version'], readable(status, ['version', 'Version'])), icon: Server },
    { label: 'CPU', value: readable(status, ['cpu', 'CPU', 'cpuUsage']), icon: Cpu },
    { label: '内存', value: readable(status, ['memory', 'Memory', 'memUsage']), icon: Activity },
  ];

  return <Page title="总览" subtitle="Lucky 服务运行状态" refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{metrics.map(({ label, value, icon: Icon }) => <View key={label} style={{ width: '48%', minHeight: 105, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14, justifyContent: 'space-between' }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: colors.subtext, fontSize: 12 }}>{label}</Text><Icon color={colors.primary} size={17} /></View><Text numberOfLines={2} style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{value}</Text></View>)}</View>
    <Panel><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Box color={colors.primary} size={19} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>模块状态</Text></View>
      {query.isLoading ? <Text style={{ color: colors.subtext }}>正在加载...</Text> : query.data?.modules.length ? query.data.modules.map((module, index) => { const name = String(module.Name ?? module.name ?? module.Module ?? module.module ?? `模块 ${index + 1}`); const enabled = module.Enable ?? module.enable; return <View key={String(module.Key ?? module.key ?? index)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder }}><Network color={enabled === false ? colors.disabled : colors.success} size={17} /><Text style={{ flex: 1, marginLeft: 10, color: colors.text }}>{name}</Text><Text style={{ color: enabled === false ? colors.subtext : colors.success, fontSize: 12 }}>{enabled === false ? '已停用' : '运行中'}</Text></View>; }) : <EmptyState message="接口未返回模块列表" />}
    </Panel>
  </Page>;
}
