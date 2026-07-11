import { useQuery } from '@tanstack/react-query';
import { Activity, Boxes, CheckCircle2, Cpu, Download, Gauge, HardDrive, Network, Server, Upload } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { EmptyState, ErrorState, Page, Panel, SectionHeader } from '@/src/components/lucky-ui';
import { useLuckyStatus } from '@/src/hooks/use-lucky-status';
import { useAppTheme } from '@/src/lib/theme';
import { getLuckyDashboard } from '@/src/services/lucky';
import type { LuckyRecord, LuckyStatusSample } from '@/src/types/lucky';

function readable(record: LuckyRecord, keys: string[], fallback = '--') {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '正常' : '未启用';
  }
  return fallback;
}

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

  return <View style={{ height: 128, borderRadius: 8, backgroundColor: colors.chartPanel, overflow: 'hidden' }}><Svg width="100%" height="128" viewBox="0 0 320 120" preserveAspectRatio="none">
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
  const query = useQuery({ queryKey: ['lucky', 'dashboard'], queryFn: getLuckyDashboard, refetchInterval: 30000 });
  const live = useLuckyStatus();
  const status = query.data?.status ?? {};
  const info = query.data?.info ?? {};
  const memoryPercent = percent(live.data?.usedMem ?? 0, live.data?.totalMem ?? 0);
  const metrics = [
    { label: '运行状态', value: live.connected ? '在线' : live.data ? '重连中' : '连接中', icon: CheckCircle2, color: live.connected ? colors.success : colors.warning, background: live.connected ? colors.successBg : colors.warningBg },
    { label: 'Lucky 版本', value: readable(info, ['version', 'Version']), icon: Server, color: colors.primary, background: colors.primarySoft },
    { label: '系统 CPU', value: live.data ? `${live.data.usedCpu.toFixed(2)}%` : '--', icon: Cpu, color: colors.warning, background: colors.warningBg },
    { label: '系统内存', value: live.data ? `${bytes(live.data.usedMem)} / ${bytes(live.data.totalMem)}` : '--', icon: Activity, color: colors.cyan, background: colors.cyanBg },
  ];
  const history = live.data?.history ?? [];

  return <Page title="总览" subtitle="Lucky 服务运行状态" icon={Gauge} refreshing={query.isFetching} onRefresh={() => query.refetch()}>
    {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
    {live.error && !live.data ? <ErrorState message={live.error} /> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{metrics.map(({ label, value, icon: Icon, color, background }) => <View key={label} style={{ width: '48%', minHeight: 112, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14, justifyContent: 'space-between', shadowColor: colors.shadow, shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: background }}><Icon color={color} size={17} /></View><Text style={{ flex: 1, color: colors.subtext, fontSize: 12 }}>{label}</Text></View><Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.68} style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{value}</Text></View>)}</View>

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

    <Panel><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Boxes color={colors.primary} size={19} /><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' }}>模块状态</Text>{query.data?.modules.length ? <Text style={{ color: colors.subtext, fontSize: 11 }}>{query.data.modules.length} 项</Text> : null}</View>
      {query.isLoading ? <Text style={{ color: colors.subtext }}>正在加载...</Text> : query.data?.modules.length ? query.data.modules.map((module, index) => { const name = String(module.Name ?? module.name ?? module.Module ?? module.module ?? `模块 ${index + 1}`); const enabled = module.Enable ?? module.enable; return <View key={String(module.Key ?? module.key ?? index)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder }}><View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: enabled === false ? colors.mutedCard : colors.successBg }}><Network color={enabled === false ? colors.disabled : colors.success} size={15} /></View><Text style={{ flex: 1, marginLeft: 10, color: colors.text, fontWeight: '600' }}>{name}</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: enabled === false ? colors.disabled : colors.success }} /><Text style={{ color: enabled === false ? colors.subtext : colors.success, fontSize: 11 }}>{enabled === false ? '已停用' : '运行中'}</Text></View></View>; }) : <EmptyState message="接口未返回模块列表" icon={Boxes} />}
    </Panel>
  </Page>;
}
