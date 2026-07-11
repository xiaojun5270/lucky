import { router, useLocalSearchParams } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { EmptyState, Page } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLuckyEndpoints, getLuckyModules } from '@/src/services/lucky-endpoints';

export default function ModuleEndpointsScreen() {
  const colors = useAppTheme();
  const params = useLocalSearchParams<{ module?: string }>();
  const moduleKey = params.module ?? '';
  const module = getLuckyModules().find((item) => item.key === moduleKey);
  const [search, setSearch] = useState('');
  const endpoints = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return getLuckyEndpoints(moduleKey).filter((endpoint) => !keyword || `${endpoint.path} ${endpoint.methods.join(' ')}`.toLowerCase().includes(keyword));
  }, [moduleKey, search]);

  return <Page title={module?.label ?? moduleKey} subtitle={`${module?.endpointCount ?? 0} 条端点 · ${module?.methodCount ?? 0} 个方法`}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 }}>
      <Search color={colors.subtext} size={18} /><TextInput value={search} onChangeText={setSearch} placeholder="搜索路径或方法" placeholderTextColor={colors.placeholder} autoCapitalize="none" style={{ flex: 1, color: colors.text, paddingVertical: 12 }} />
    </View>
    {endpoints.length ? endpoints.map((endpoint) => <Pressable key={endpoint.id} onPress={() => router.push(`/endpoints/${endpoint.id}` as never)} style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 14, gap: 10 }}>
      <Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 }}>{endpoint.path}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{endpoint.methods.map((method) => <View key={method} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: method === 'GET' ? colors.successBg : method === 'DELETE' ? colors.dangerBg : colors.iconSoftBg }}><Text style={{ color: method === 'GET' ? colors.success : method === 'DELETE' ? colors.danger : colors.primary, fontSize: 10, fontWeight: '800' }}>{method}</Text></View>)}</View>
    </Pressable>) : <EmptyState message="没有匹配的接口" />}
  </Page>;
}
