import { useQuery } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { ChevronRight, Cpu, Download, Gauge, Globe2, HardDrive, LockKeyhole, Network, Route, Upload } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { DockerOverviewDashboard, type DockerOverviewTarget } from '@/src/components/docker-overview';
import { ErrorState, IconTile, Page, Panel, SectionHeader } from '@/src/components/lucky-ui';
import { useLuckyStatus } from '@/src/hooks/use-lucky-status';
import { useAppTheme } from '@/src/lib/theme';
import { getDockerOverview } from '@/src/services/docker';
import { getWebServiceRules } from '@/src/services/webservice';
import type { LuckyRecord, LuckyStatusSample } from '@/src/types/lucky';

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

function asEnabled(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === false || value === 0) return false;
  if (typeof value === 'string' && /^(?:false|0|off|no|disabled)$/i.test(value.trim())) return false;
  return true;
}

function webRuleText(rule: LuckyRecord, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = rule[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return fallback;
}

function webSubRules(rule: LuckyRecord) {
  const value = rule.ProxyList ?? rule.proxyList ?? rule.proxies;
  return Array.isArray(value)
    ? value.filter((item): item is LuckyRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function ReverseProxyOverview({
  data,
  loading,
  error,
  onPress,
}: {
  data?: Awaited<ReturnType<typeof getWebServiceRules>>;
  loading: boolean;
  error?: string;
  onPress: () => void;
}) {
  const colors = useAppTheme();
  const summary = useMemo(() => {
    const rules = data?.items ?? [];
    const enabledRules = rules.filter((rule) => asEnabled(rule.Enable ?? rule.enable));
    const subRules = rules.flatMap(webSubRules);
    const enabledSubRules = subRules.filter((rule) => asEnabled(rule.Enable ?? rule.enable));
    const tlsRules = enabledRules.filter((rule) => asEnabled(rule.EnableTLS ?? rule.enableTLS ?? rule.TLS, false));
    return {
      rules,
      enabledRules,
      subRules,
      enabledSubRules,
      tlsRules,
      preview: enabledRules.slice(0, 2),
    };
  }, [data]);
  const ready = Boolean(data);
  const stats = [
    {
      label: '启用规则',
      value: ready ? `${summary.enabledRules.length}/${summary.rules.length}` : '--',
      color: colors.primary,
    },
    {
      label: '启用子规则',
      value: ready ? `${summary.enabledSubRules.length}/${summary.subRules.length}` : '--',
      color: colors.success,
    },
    {
      label: 'TLS 监听',
      value: ready ? String(summary.tlsRules.length) : '--',
      color: colors.warning,
    },
  ];

  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="打开反向代理规则"
    onPress={onPress}
    style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.992 : 1 }] })}
  >
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconTile icon={Globe2} size={42} iconSize={21} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800' }}>反向代理</Text>
          <Text numberOfLines={1} style={{ marginTop: 2, color: colors.subtext, fontSize: 11, lineHeight: 16 }}>
            {error ? '规则状态暂时无法读取' : loading && !ready ? '正在同步规则状态' : '域名、监听、后端与 TLS 规则'}
          </Text>
        </View>
        <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mutedCard }}>
          <ChevronRight color={colors.subtext} size={17} />
        </View>
      </View>

      <View style={{ minHeight: 66, borderRadius: 14, backgroundColor: colors.mutedCard, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
        {stats.map((item, index) => <View
          key={item.label}
          style={{ flex: 1, minWidth: 0, minHeight: 42, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderLeftWidth: index ? 1 : 0, borderLeftColor: colors.rowBorder }}
        >
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={{ color: item.color, fontSize: 19, lineHeight: 24, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{item.value}</Text>
          <Text numberOfLines={1} style={{ marginTop: 2, color: colors.subtext, fontSize: 10, lineHeight: 14 }}>{item.label}</Text>
        </View>)}
      </View>

      {summary.preview.length ? <View style={{ gap: 8 }}>
        {summary.preview.map((rule, index) => {
          const name = webRuleText(rule, ['RuleName', 'Name'], `规则 ${index + 1}`);
          const network = webRuleText(rule, ['Network'], 'tcp');
          const host = webRuleText(rule, ['ListenIP'], '*') || '*';
          const port = webRuleText(rule, ['ListenPort'], '--');
          const subCount = webSubRules(rule).length;
          const tls = asEnabled(rule.EnableTLS ?? rule.enableTLS ?? rule.TLS, false);
          return <View key={webRuleText(rule, ['RuleKey', 'Key', 'key'], String(index))} style={{ minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: tls ? colors.warningBg : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              {tls ? <LockKeyhole color={colors.warning} size={14} /> : <Route color={colors.primary} size={14} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '700' }}>{name}</Text>
              <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, lineHeight: 14 }}>{network} · {host}:{port}</Text>
            </View>
            <Text style={{ color: colors.subtext, fontSize: 10, fontWeight: '600' }}>{subCount} 个子规则</Text>
          </View>;
        })}
      </View> : ready && !error ? <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 16, textAlign: 'center' }}>暂无启用中的反向代理规则</Text> : null}
    </Panel>
  </Pressable>;
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
  const live = useLuckyStatus(dockerActive);
  const dockerOverview = useQuery({
    queryKey: ['docker', 'overview'],
    queryFn: getDockerOverview,
    enabled: dockerActive,
    staleTime: 30_000,
    refetchInterval: dockerActive ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
  const webServiceOverview = useQuery({
    queryKey: ['webservice', 'rules', 'overview'],
    queryFn: ({ signal }) => getWebServiceRules(true, signal),
    enabled: dockerActive,
    staleTime: 15_000,
    refetchInterval: dockerActive ? 30_000 : false,
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
        await Promise.all([dockerOverview.refetch(), webServiceOverview.refetch()]);
      } finally {
        setRefreshing(false);
      }
    })();
  };

  return <Page title="总览" subtitle="实时资源与服务状态" icon={Gauge} refreshing={refreshing || (!dockerOverview.data && dockerOverview.isFetching) || (!webServiceOverview.data && webServiceOverview.isFetching)} onRefresh={refresh}>
    {live.error && !live.data ? <ErrorState message={live.error} /> : null}
    {dockerOverview.error ? <ErrorState message={`Docker 总览：${dockerOverview.error.message}`} retry={() => dockerOverview.refetch()} /> : null}
    <DockerOverviewDashboard
      data={dockerOverview.data}
      active={dockerActive}
      liveStatus={live}
      statsLoading={false}
      showHeader={false}
      showDockerSummary={false}
      showContainerInsights={false}
      onSelectView={(view) => openDocker(view)}
      onSelectContainer={(name) => openDocker('containers', name)}
    />

    <ReverseProxyOverview
      data={webServiceOverview.data}
      loading={webServiceOverview.isFetching}
      error={webServiceOverview.error?.message}
      onPress={() => router.push('/webservice' as never)}
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

  </Page>;
}
