import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Boxes, ChevronRight, Clock3, Container, Database, Globe2, Layers3, Network, Puzzle, RadioTower, RefreshCw, ShieldCheck, Star, Terminal } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Page, SearchField, SectionHeader, ServiceButton } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLuckyModules } from '@/src/services/lucky-endpoints';

export default function ServicesScreen() {
  const colors = useAppTheme();
  const [search, setSearch] = useState('');
  const modules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return getLuckyModules().filter((item) => !keyword || `${item.label} ${item.key}`.toLowerCase().includes(keyword));
  }, [search]);
  const go = (kind: string) => router.push((kind === 'webservice' ? '/webservice' : kind === 'docker' ? '/docker' : `/services/${kind}`) as never);

  const moduleVisual = (key: string): { icon: LucideIcon; color: string; background: string } => {
    if (/docker/i.test(key)) return { icon: Container, color: colors.warning, background: colors.warningBg };
    if (/ssl|auth|coraza/i.test(key)) return { icon: ShieldCheck, color: colors.success, background: colors.successBg };
    if (/ddns|cloudflared|frp|wol/i.test(key)) return { icon: RadioTower, color: colors.cyan, background: colors.cyanBg };
    if (/webservice|webdav|ftp|dlna/i.test(key)) return { icon: Globe2, color: colors.primary, background: colors.primarySoft };
    if (/cron|task/i.test(key)) return { icon: Clock3, color: colors.warning, background: colors.warningBg };
    if (/terminal/i.test(key)) return { icon: Terminal, color: colors.success, background: colors.successBg };
    if (/storage|rclone|backup|ipdb/i.test(key)) return { icon: Database, color: colors.cyan, background: colors.cyanBg };
    if (/network|port/i.test(key)) return { icon: Network, color: colors.primary, background: colors.primarySoft };
    return { icon: Puzzle, color: colors.subtext, background: colors.mutedCard };
  };

  return <Page title="服务" subtitle="45 个模块 · 328 条端点 · 448 个方法" icon={Layers3}>
    <SectionHeader icon={Star} title="常用服务" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <ServiceButton icon={Globe2} label="反向代理" detail="域名、后端与 TLS 规则" onPress={() => go('webservice')} />
      <ServiceButton icon={RefreshCw} label="动态域名" detail="DDNS 任务与手动同步" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => go('ddns')} />
      <ServiceButton icon={Container} label="Docker" detail="容器状态与启停操作" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => go('docker')} />
      <ServiceButton icon={ShieldCheck} label="SSL 证书" detail="证书状态与手动同步" iconColor={colors.success} iconBackground={colors.successBg} onPress={() => go('ssl')} />
    </View>
    <SectionHeader icon={Boxes} title="全部模块" meta={`${modules.length} 项`} />
    <SearchField value={search} onChangeText={setSearch} placeholder="搜索模块" />
    <View style={{ backgroundColor: colors.card, borderRadius: 8, overflow: 'hidden', paddingHorizontal: 14 }}>{modules.map((module, index) => <Pressable key={module.key} onPress={() => router.push(`/modules/${module.key}` as never)} style={({ pressed }) => ({ minHeight: 62, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, opacity: pressed ? 0.55 : 1 })}>
      {(() => { const visual = moduleVisual(module.key); const Icon = visual.icon; return <View style={{ width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: visual.background }}><Icon color={visual.color} size={18} strokeWidth={2.2} /></View>; })()}
      <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{module.label}</Text><Text style={{ color: colors.subtext, fontSize: 11, marginTop: 4 }}>{module.endpointCount} 个端点 · {module.methodCount} 个方法</Text></View>
      <ChevronRight color={colors.disabled} size={18} />
    </Pressable>)}</View>
  </Page>;
}
