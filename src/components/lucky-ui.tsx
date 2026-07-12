import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight, Inbox, RefreshCw, Search, TriangleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';

export function Page({ title, subtitle, icon: Icon, children, refreshing, onRefresh, safeTop = true }: { title: string; subtitle?: string; icon?: LucideIcon; children: ReactNode; refreshing?: boolean; onRefresh?: () => void; safeTop?: boolean }) {
  const colors = useAppTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }} edges={safeTop ? ['top'] : []}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" removeClippedSubviews={Platform.OS === 'android'} contentContainerStyle={{ width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 110, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{Icon ? <IconTile icon={Icon} size={44} iconSize={22} /> : null}<View style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 30, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text style={{ color: colors.subtext, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text> : null}</View></View>
        {onRefresh ? <Pressable accessibilityLabel="刷新" onPress={onRefresh} disabled={refreshing} style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.card, borderWidth: Platform.OS === 'ios' ? 0 : 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: Platform.OS === 'ios' || Platform.OS === 'web' ? 0.07 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: Platform.OS === 'android' ? 1 : 0, opacity: pressed ? 0.55 : 1 })}>{refreshing ? <ActivityIndicator color={colors.primary} /> : <RefreshCw color={colors.primary} size={19} strokeWidth={2.2} />}</Pressable> : null}
      </View>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

export function Panel({ children }: { children: ReactNode }) {
  const colors = useAppTheme();
  return <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: Platform.OS === 'ios' ? 0 : 1, borderRadius: 8, padding: 16, gap: 12, shadowColor: colors.shadow, shadowOpacity: Platform.OS === 'ios' || Platform.OS === 'web' ? 0.06 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: Platform.OS === 'android' ? 1 : 0 }}>{children}</View>;
}

export function IconTile({ icon: Icon, color, background, size = 36, iconSize = 18 }: { icon: LucideIcon; color?: string; background?: string; size?: number; iconSize?: number }) {
  const colors = useAppTheme();
  return <View style={{ width: size, height: size, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: background ?? colors.primarySoft }}><Icon color={color ?? colors.primary} size={iconSize} strokeWidth={2.2} /></View>;
}

export function MetricCard({ icon, label, value, color, background, valueColor }: { icon: LucideIcon; label: string; value: string; color: string; background: string; valueColor?: string }) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexBasis: 150, minHeight: 116, borderRadius: 8, padding: 14, justifyContent: 'space-between', backgroundColor: colors.card, borderWidth: Platform.OS === 'ios' ? 0 : 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: Platform.OS === 'ios' || Platform.OS === 'web' ? 0.07 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: Platform.OS === 'android' ? 1 : 0 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><IconTile icon={icon} color={color} background={background} /><Text style={{ flex: 1, color: colors.subtext, fontSize: 12, fontWeight: '600' }}>{label}</Text></View><Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: valueColor ?? colors.text, fontSize: 21, fontWeight: '800' }}>{value || '--'}</Text></View>;
}

export function EmptyState({ message, icon: Icon = Inbox }: { message: string; icon?: LucideIcon }) {
  const colors = useAppTheme();
  return <Panel><View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}><IconTile icon={Icon} color={colors.subtext} background={colors.mutedCard} size={42} iconSize={21} /><Text style={{ color: colors.subtext, textAlign: 'center' }}>{message}</Text></View></Panel>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ padding: 14, borderRadius: 8, backgroundColor: colors.dangerBg, gap: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon={TriangleAlert} color={colors.danger} background={colors.card} size={34} iconSize={17} /><Text style={{ flex: 1, color: colors.danger, lineHeight: 19 }}>{message}</Text></View>{retry ? <Pressable onPress={retry} style={{ alignSelf: 'flex-start', minHeight: 34, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.danger, fontWeight: '700' }}>重试</Text></Pressable> : null}</View>;
}

export function SectionHeader({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 9 }}><IconTile icon={Icon} size={30} iconSize={15} /><Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>{meta ? <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.subtext, fontSize: 11, fontWeight: '600' }}>{meta}</Text></View> : null}</View>;
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const colors = useAppTheme();
  return <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.mutedCard, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11 }}><Search color={colors.subtext} size={17} strokeWidth={2.1} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.text, paddingVertical: 10, fontSize: 15 }} /></View>;
}

export function ServiceButton({ icon: Icon, label, detail, onPress, iconColor, iconBackground }: { icon: LucideIcon; label: string; detail: string; onPress: () => void; iconColor?: string; iconBackground?: string }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 150, minHeight: 128, padding: 15, gap: 10, borderRadius: 8, backgroundColor: colors.card, borderWidth: Platform.OS === 'ios' ? 0 : 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOpacity: Platform.OS === 'ios' || Platform.OS === 'web' ? 0.06 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: Platform.OS === 'android' ? 1 : 0, opacity: pressed ? 0.62 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><IconTile icon={Icon} color={iconColor} background={iconBackground} size={40} iconSize={20} /><View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mutedCard }}><ChevronRight color={colors.subtext} size={16} /></View></View>
    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{label}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{detail}</Text>
  </Pressable>;
}
