import { useQuery } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { Boxes, Cpu, Download, Gauge, HardDrive, Network, Upload } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { DockerOverviewDashboard, type DockerOverviewTarget } from '@/src/components/docker-overview';
import { EmptyState, ErrorState, Page, Panel, SectionHeader } from '@/src/components/lucky-ui';
import { useLuckyStatus } from '@/src/hooks/use-lucky-status';
import { useAppTheme } from '@/src/lib/theme';
import { getAllDockerContainerStats, getDockerOverview } from '@/src/services/docker';
import { getLuckyModules } from '@/src/services/lucky';
import type { LuckyStatusSample } from '@/src/types/lucky';

function bytes(value: number, speed = false) {
  if (!Number.isFinite(value) || value <= 0) return speed ? '0 B/s' : '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}${speed ? '/s' : ''}`;
}

function percent(used: number, total: number) {
  return total > 0 ? used / total * 100 : 0;
}

function TrendChart({ samples, series, maxValue }: { samples: LuckyStatusSample[]; series: { color: string; value: (sample: LuckyStatusSample) => number }[]; maxValue?: number }) {
  const colors = useAppTheme();
  const values = samples.slice(-90);
  const measuredMax = Math.max(1, ...values.flatMap((item) => series.map((line) => line.value(item))));
  const ceiling = maxValue ?? measuredMax * 1.12;
  const points = (line: (sample: LuckyStatusSample) => number) => values.map((item, index) => {
    const x = values.length <= 1 ? 0 : index / (values.length - 1) * 320;
    const y = 108 - Math.min(1, Math.max(0, line(item) / ceiling)) * 96;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return <View style={{ height: 128, borderRadius: 14, backgroundColor: colors.chartPanel, overflow: 'hidden' }}><Svg width="100%" height="128" viewBox="0 0 320 120" preserveAspectRatio="none">
    {[12, 36, 60, 84, 108].map((y) => <Line key={y} x1="0" x2="320" y1={y} y2={y} stroke={colors.chartTrack} strokeWidth="1" strokeDasharray="3 4" />)}
    {series.map((item, index) => <Polyline key={index} points={points(item.value)} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
  </Svg></View>;
}

function Legend({ color, label }: { color: string; label: string }) {
  const colors = useAppTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /><Text style={{ color: colors.subtext, fontSize: 10 }}>{label}</Text></View>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useAppTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 25 }}><Text style={{ flex: 1, color: colors.subtext, fontSize: 12 }}>{label}</Text><Text selectable style={{ maxWidth: '62%', color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'right' }}>{value}</Text></View>;
}

export default function DashboardScreen() {
  const colors = useAppTheme();
  const router = useRouter();
  const isFocused = useIsFocused();
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const [refreshing, setRefreshing] = useState(false);
  const dockerActive = isFocused && appIsActive;
  const modulesQuery = useQuery({
    queryKey: ['lucky', 'modules'],
    queryFn: getLuckyModules,
    enabled: dockerActive,
    refetchInterval: dockerActive ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const live = useLuckyStatus(dockerActive);
  const dockerOverview = useQuery({
    queryKey: ['docker', 'overview'],
    queryFn: getDockerOverview,
    enabled: dockerActive,
    staleTime: 30_000,
    refetchInterval: dockerActive ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
  const dockerStats = useQuery({
    queryKey: ['docker', 'container-stats'],
    queryFn: getAllDockerContainerStats,
    enabled: dockerActive && (Boolean(dockerOverview.data) || dockerOverview.isError),
    staleTime: 8_000,
    refetchInterval: dockerActive ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const memoryPercent = percent(live.data?.usedMem ?? 0, live.data?.totalMem ?? 0);
  const history = live.data?.history ?? [];

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const openDocker = (view: DockerOverviewTarget, search?: string) => {
    router.push({
      pathname: '/docker',
      params: search ? { view, search } : { view },
    } as never);
  };

  const refresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    void (async () => {
      try {
        await Promise.all([
          modulesQuery.refetch(),
          dockerOverview.refetch(),
        ]);
        await dockerStats.refetch();
      } finally {
        setRefreshing(false);
      }
    })();
  };

  return <Page title="总览" subtitle="Lucky 与 Docker 运行状态" icon={Gauge} refreshing={refreshing || (!modulesQuery.data && modulesQuery.isFetching) || (!dockerOverview.data && dockerOverview.isFetching)} onRefresh={refresh}>
    {modulesQuery.error ? <ErrorState message={modulesQuery.error.message} retry={() => modulesQuery.refetch()} /> : null}
    {live.error && !live.data ? <ErrorState message={live.error} /> : null}
    {dockerOverview.error ? <ErrorState message={`Docker 总览：${dockerOverview.error.message}`} retry={() => dockerOverview.refetch()} /> : null}
    <DockerOverviewDashboard
      data={dockerOverview.data}
      active={dockerActive}
      liveStatus={live}
      stats={dockerStats.data}
      statsLoading={dockerOverview.isLoading || dockerStats.isLoading}
      statsError={dockerStats.error?.message}
      onSelectView={(view) => openDocker(view)}
      onSelectContainer={(name) => openDocker('containers', name)}
    />

    {live.data ? <>
      <Panel><SectionHeader icon={Cpu} title="系统资源" meta={`内存 ${memoryPercent.toFixed(1)}%`} /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Legend color={colors.primary} label="系统 CPU" /><Legend color={colors.danger} label="进程 CPU" /><Legend color={colors.success} label="系统内存" /></View><TrendChart samples={history} maxValue={100} series={[
        { color: colors.primary, value: (item) => item.systemCpuPercent },
        { color: colors.danger, value: (item) => item.processCpuPercent },
        { color: colors.success, value: (item) => percent(item.usedMem, item.totalMem) },
      ]} /></Panel>

      <Panel><SectionHeader icon={Network} title="网络趋势" /><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><Legend color={colors.cyan} label={`下载 ${bytes(live.data.lastNetInSpeed, true)}`} /><Legend color={colors.warning} label={`上传 ${bytes(live.data.lastNetOutSpeed, true)}`} /></View><TrendChart samples={history} series={[
        { color: colors.cyan, value: (item) => item.netInSpeed },
        { color: colors.warning, value: (item) => item.netOutSpeed },
      ]} /><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}><Download color={colors.cyan} size={16} /><View><Text style={{ color: colors.subtext, fontSize: 10 }}>接收总量</Text><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{bytes(live.data.netIn)}</Text></View></View><View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}><Upload color={colors.warning} size={16} /><View><Text style={{ color: colors.subtext, fontSize: 10 }}>发送总量</Text><Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{bytes(live.data.netOut)}</Text></View></View></View></Panel>

      <Panel><SectionHeader icon={HardDrive} title="服务器信息" /><InfoRow label="进程启动时间" value={live.data.runTime || '--'} /><InfoRow label="查询时间" value={live.data.queryTime || '--'} /><InfoRow label="进程已打开句柄数" value={String(live.data.handleCount)} /><InfoRow label="协程数" value={String(live.data.goroutine)} /><InfoRow label="进程占用内存" value={bytes(live.data.processUsedMem)} /><View style={{ height: 1, backgroundColor: colors.rowBorder }} /><InfoRow label="GC 总次数" value={String(live.data.numGc)} /><InfoRow label="堆占用内存" value={bytes(live.data.heapInuse)} /></Panel>
    </> : null}

    <Panel><SectionHeader icon={Boxes} title="模块状态" meta={modulesQuery.data?.length ? `${modulesQuery.data.length} 项` : undefined} />
      {modulesQuery.isLoading ? <Text style={{ color: colors.subtext }}>正在加载...</Text> : modulesQuery.data?.length ? modulesQuery.data.map((module, index) => { const name = String(module.Name ?? module.name ?? module.Module ?? module.module ?? `模块 ${index + 1}`); const enabled = module.Enable ?? module.enable; return <View key={String(module.Key ?? module.key ?? index)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder }}><View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: enabled === false ? colors.mutedCard : colors.successBg }}><Network color={enabled === false ? colors.disabled : colors.success} size={15} /></View><Text style={{ flex: 1, marginLeft: 10, color: colors.text, fontWeight: '600' }}>{name}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: enabled === false ? colors.disabled : colors.success }} /><Text style={{ color: enabled === false ? colors.subtext : colors.success, fontSize: 11 }}>{enabled === false ? '已停用' : '运行中'}</Text></View></View>; }) : <EmptyState message="接口未返回模块列表" icon={Boxes} />}
    </Panel>
  </Page>;
}
