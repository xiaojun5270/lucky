import type { LucideIcon } from 'lucide-react-native';
import { RefreshCw } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';

export function Page({ title, subtitle, children, refreshing, onRefresh }: { title: string; subtitle?: string; children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const colors = useAppTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }} edges={['top']}>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 110, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontSize: 27, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text style={{ color: colors.subtext, fontSize: 13 }}>{subtitle}</Text> : null}</View>
        {onRefresh ? <Pressable accessibilityLabel="刷新" onPress={onRefresh} disabled={refreshing} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>{refreshing ? <ActivityIndicator color={colors.primary} /> : <RefreshCw color={colors.text} size={19} />}</Pressable> : null}
      </View>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

export function Panel({ children }: { children: ReactNode }) {
  const colors = useAppTheme();
  return <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 15, gap: 12 }}>{children}</View>;
}

export function EmptyState({ message }: { message: string }) {
  const colors = useAppTheme();
  return <Panel><Text style={{ color: colors.subtext, textAlign: 'center', paddingVertical: 24 }}>{message}</Text></Panel>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ padding: 14, borderRadius: 8, backgroundColor: colors.dangerBg, gap: 10 }}><Text style={{ color: colors.danger }}>{message}</Text>{retry ? <Pressable onPress={retry}><Text style={{ color: colors.danger, fontWeight: '700' }}>重试</Text></Pressable> : null}</View>;
}

export function ServiceButton({ icon: Icon, label, detail, onPress }: { icon: LucideIcon; label: string; detail: string; onPress: () => void }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={{ width: '48%', minHeight: 122, padding: 15, gap: 10, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
    <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSoftBg, borderRadius: 8 }}><Icon color={colors.primary} size={20} /></View>
    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{label}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{detail}</Text>
  </Pressable>;
}
