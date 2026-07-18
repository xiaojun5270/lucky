import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Boxes, ChevronRight, Clock3, Container, Database, Globe2, Layers3, Network, Puzzle, RadioTower, RefreshCw, Search, ShieldCheck, Star, Terminal } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Page, SearchField, SectionHeader, ServiceButton } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLuckyEndpoints, getLuckyModules } from '@/src/services/lucky-endpoints';

export default function ServicesScreen() {
  const colors = useAppTheme();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const modules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return getLuckyModules().filter((item) => {
      if (!keyword) return true;
      const moduleText = `${item.label} ${item.key}`.toLowerCase();
      if (moduleText.includes(keyword)) return true;
      return getLuckyEndpoints(item.key).some((endpoint) =>
        `${endpoint.path} ${endpoint.id} ${endpoint.source}`.toLowerCase().includes(keyword),
      );
    });
  }, [search]);
  const moduleVisual = (key: string): { icon: LucideIcon; color: string; background: string } => {
    if (/docker/i.test(key)) return { icon: Container, color: colors.warning, background: colors.warningBg };
    if (/ssl|auth|coraza|ipfliter/i.test(key)) return { icon: ShieldCheck, color: colors.success, background: colors.successBg };
    if (/ddns|cloudflared|frp|wol|stun/i.test(key)) return { icon: RadioTower, color: colors.cyan, background: colors.cyanBg };
    if (/webservice|webdav|ftp|dlna/i.test(key)) return { icon: Globe2, color: colors.primary, background: colors.primarySoft };
    if (/cron|task|update/i.test(key)) return { icon: Clock3, color: colors.warning, background: colors.warningBg };
    if (/terminal|logs/i.test(key)) return { icon: Terminal, color: colors.success, background: colors.successBg };
    if (/storage|rclone|backup|ipdb/i.test(key)) return { icon: Database, color: colors.cyan, background: colors.cyanBg };
    if (/network|port|interface/i.test(key)) return { icon: Network, color: colors.primary, background: colors.primarySoft };
    return { icon: Puzzle, color: colors.subtext, background: colors.mutedCard };
  };
  const go = (kind: string) => router.push((kind === 'webservice' ? '/webservice' : kind === 'docker' ? '/docker' : `/services/${kind}`) as never);

  return <Page title="服务" icon={Layers3}>
    <SectionHeader icon={Star} title="常用服务" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <ServiceButton icon={Globe2} label="反向代理" detail="域名、后端与 TLS 规则" onPress={() => go('webservice')} />
      <ServiceButton icon={RefreshCw} label="动态域名" detail="DDNS 任务与手动同步" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => go('ddns')} />
      <ServiceButton icon={Container} label="Docker" detail="容器状态与启停操作" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => go('docker')} />
      <ServiceButton icon={ShieldCheck} label="SSL 证书" detail="证书状态与手动同步" iconColor={colors.success} iconBackground={colors.successBg} onPress={() => go('ssl')} />
    </View>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: showAll }}
      onPress={() => setShowAll((value) => !value)}
      style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Boxes color={colors.primary} size={17} /></View>
      <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '800' }}>全部模块</Text><Text style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>文档注册的 45 个模块与全部接口</Text></View>
      <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>{showAll ? '收起' : `${getLuckyModules().length} 项`}</Text>
      <ChevronRight color={colors.subtext} size={17} style={{ transform: [{ rotate: showAll ? '90deg' : '0deg' }] }} />
    </Pressable>
    {showAll ? <View style={{ gap: 10 }}>
      <SearchField value={search} onChangeText={setSearch} placeholder="搜索模块或接口" />
      {modules.map((module) => { const visual = moduleVisual(module.key); const ModuleIcon = visual.icon; return <Pressable key={module.key} onPress={() => router.push(`/modules/${encodeURIComponent(module.key)}` as never)} style={({ pressed }) => ({ minHeight: 62, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11, opacity: pressed ? 0.65 : 1 })}>
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: visual.background, alignItems: 'center', justifyContent: 'center' }}><ModuleIcon color={visual.color} size={17} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700' }}>{module.label}</Text><Text style={{ color: colors.subtext, fontSize: 11, marginTop: 3 }}>{module.endpointCount} 个端点 · {module.methodCount} 个方法</Text></View>
        <ChevronRight color={colors.disabled} size={17} />
      </Pressable>; })}
      {!modules.length ? <View style={{ alignItems: 'center', paddingVertical: 20 }}><Search color={colors.subtext} size={20} /><Text style={{ color: colors.subtext, marginTop: 7 }}>没有匹配的模块</Text></View> : null}
    </View> : null}
  </Page>;
}
