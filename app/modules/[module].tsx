import { useLocalSearchParams, useRouter } from 'expo-router';
import { Braces, ChevronRight, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, Text, View } from 'react-native';

import { EmptyState, Page, SearchField, SectionHeader } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import { getLuckyEndpoints, getLuckyModules } from '@/src/services/lucky-endpoints';
import type { LuckyEndpointDefinition } from '@/src/types/lucky';

function routeParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] ?? '' : value ?? '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function methodColor(method: string, colors: ReturnType<typeof useAppTheme>) {
  if (method === 'GET') return colors.success;
  if (method === 'POST') return colors.primary;
  if (method === 'PUT') return colors.warning;
  return colors.danger;
}

export default function ModuleEndpointsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ module?: string | string[] }>();
  const moduleKey = routeParam(params.module);
  const module = useMemo(() => getLuckyModules().find((item) => item.key === moduleKey), [moduleKey]);
  const [search, setSearch] = useState('');
  const endpoints = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return getLuckyEndpoints(moduleKey).filter((endpoint) => !keyword || `${endpoint.path} ${endpoint.id} ${endpoint.source}`.toLowerCase().includes(keyword));
  }, [moduleKey, search]);

  if (!module) return <Page title="模块不存在" icon={Braces}><EmptyState message="接口清单中没有找到该模块" icon={Braces} /></Page>;

  return <Page title={module.label} subtitle={`${module.endpointCount} 个端点 · ${module.methodCount} 个方法`} icon={Braces} scrollable={false}>
    <SearchField value={search} onChangeText={setSearch} placeholder="搜索路径或接口" />
    <SectionHeader icon={Search} title="接口列表" meta={`${endpoints.length} 项`} />
    <FlatList
      data={endpoints}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      removeClippedSubviews={Platform.OS === 'android'}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={9}
      style={{ flex: 1, width: '100%' }}
      contentContainerStyle={{ gap: 10, paddingBottom: 96, flexGrow: endpoints.length ? 0 : 1 }}
      ListEmptyComponent={<EmptyState message="没有匹配的接口" icon={Search} />}
      renderItem={({ item }) => <EndpointRow endpoint={item} onPress={() => router.push(`/endpoints/${encodeURIComponent(item.id)}` as never)} />}
    />
  </Page>;
}

function EndpointRow({ endpoint, onPress }: { endpoint: LuckyEndpointDefinition; onPress: () => void }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => ({ minHeight: 82, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 13, gap: 8, opacity: pressed ? 0.65 : 1 })}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 }}>{endpoint.methods.map((method) => <View key={method} style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, backgroundColor: `${methodColor(method, colors)}22` }}><Text style={{ color: methodColor(method, colors), fontSize: 10, fontWeight: '800' }}>{method}</Text></View>)}</View>
      <ChevronRight color={colors.disabled} size={16} />
    </View>
    <Text numberOfLines={2} selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 12, lineHeight: 17 }}>{endpoint.path}</Text>
    <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{endpoint.source || 'Lucky API'}{endpoint.requiresSuffix ? ' · 需要路径参数' : ''}</Text>
  </Pressable>;
}
