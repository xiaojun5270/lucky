import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight, Inbox, RefreshCw, Search } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';

export function Page({ title, subtitle, icon: Icon, children, refreshing, onRefresh, safeTop = true }: { title: string; subtitle?: string; icon?: LucideIcon; children: ReactNode; refreshing?: boolean; onRefresh?: () => void; safeTop?: boolean }) {
  const colors = useAppTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }} edges={safeTop ? ['top'] : []}>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 110, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{Icon ? <View style={{ width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft }}><Icon color={colors.primary} size={23} /></View> : null}<View style={{ flex: 1, gap: 3 }}><Text style={{ color: colors.text, fontSize: 26, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text style={{ color: colors.subtext, fontSize: 13 }}>{subtitle}</Text> : null}</View></View>
        {onRefresh ? <Pressable accessibilityLabel="刷新" onPress={onRefresh} disabled={refreshing} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}>{refreshing ? <ActivityIndicator color={colors.primary} /> : <RefreshCw color={colors.text} size={19} />}</Pressable> : null}
      </View>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

export function Panel({ children }: { children: ReactNode }) {
  const colors = useAppTheme();
  return <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 15, gap: 12, shadowColor: colors.shadow, shadowOpacity: 0.035, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}>{children}</View>;
}

export function EmptyState({ message, icon: Icon = Inbox }: { message: string; icon?: LucideIcon }) {
  const colors = useAppTheme();
  return <Panel><View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}><View style={{ width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mutedCard }}><Icon color={colors.subtext} size={21} /></View><Text style={{ color: colors.subtext, textAlign: 'center' }}>{message}</Text></View></Panel>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ padding: 14, borderRadius: 8, backgroundColor: colors.dangerBg, gap: 10 }}><Text style={{ color: colors.danger }}>{message}</Text>{retry ? <Pressable onPress={retry}><Text style={{ color: colors.danger, fontWeight: '700' }}>重试</Text></Pressable> : null}</View>;
}

export function SectionHeader({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 9 }}><Icon color={colors.primary} size={18} /><Text style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>{meta ? <Text style={{ color: colors.subtext, fontSize: 11 }}>{meta}</Text> : null}</View>;
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const colors = useAppTheme();
  return <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 13 }}><Search color={colors.subtext} size={18} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.text, paddingVertical: 11 }} /></View>;
}

export function ServiceButton({ icon: Icon, label, detail, onPress, iconColor, iconBackground }: { icon: LucideIcon; label: string; detail: string; onPress: () => void; iconColor?: string; iconBackground?: string }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={{ width: '48%', minHeight: 132, padding: 15, gap: 10, borderRadius: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: 0.04, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBackground ?? colors.iconSoftBg, borderRadius: 8 }}><Icon color={iconColor ?? colors.primary} size={20} /></View><ChevronRight color={colors.disabled} size={17} /></View>
    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{label}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{detail}</Text>
  </Pressable>;
}
