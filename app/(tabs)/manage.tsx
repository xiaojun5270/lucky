import { router } from 'expo-router';
import { Container, Globe2, RefreshCw, Search, ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Page, ServiceButton } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLuckyModules } from '@/src/services/lucky-endpoints';

export default function ServicesScreen() {
  const colors = useAppTheme();
  const [search, setSearch] = useState('');
  const modules = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return getLuckyModules().filter((item) => !keyword || `${item.label} ${item.key}`.toLowerCase().includes(keyword));
  }, [search]);
  const go = (kind: string) => router.push(`/services/${kind}` as never);

  return <Page title="服务" subtitle="45 个模块 · 328 条端点 · 448 个方法">
    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>常用服务</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <ServiceButton icon={Globe2} label="反向代理" detail="域名、后端与 TLS 规则" onPress={() => go('webservice')} />
      <ServiceButton icon={RefreshCw} label="动态域名" detail="DDNS 任务与手动同步" onPress={() => go('ddns')} />
      <ServiceButton icon={Container} label="Docker" detail="容器状态与启停操作" onPress={() => go('docker')} />
      <ServiceButton icon={ShieldCheck} label="SSL 证书" detail="证书状态与手动同步" onPress={() => go('ssl')} />
    </View>
    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 4 }}>全部模块</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 }}>
      <Search color={colors.subtext} size={18} />
      <TextInput value={search} onChangeText={setSearch} placeholder="搜索模块" placeholderTextColor={colors.placeholder} style={{ flex: 1, color: colors.text, paddingVertical: 12 }} />
    </View>
    <View style={{ gap: 9 }}>{modules.map((module) => <Pressable key={module.key} onPress={() => router.push(`/modules/${module.key}` as never)} style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{module.label}</Text><Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{module.key}</Text></View>
      <View style={{ alignItems: 'flex-end' }}><Text style={{ color: colors.primary, fontWeight: '700' }}>{module.endpointCount}</Text><Text style={{ color: colors.subtext, fontSize: 11 }}>{module.methodCount} 个方法</Text></View>
    </Pressable>)}</View>
  </Page>;
}
