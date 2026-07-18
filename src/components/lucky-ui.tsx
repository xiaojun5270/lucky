import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight, Inbox, RefreshCw, Search, TriangleAlert } from 'lucide-react-native';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';

const CARD_RADIUS = 18;
const CONTROL_RADIUS = 12;

export function FullScreenSafeArea({ style, ...props }: ComponentProps<typeof View>) {
  const insets = useSafeAreaInsets();
  const modalInsets = { paddingTop: insets.top, paddingRight: insets.right, paddingBottom: insets.bottom, paddingLeft: insets.left };
  return <View {...props} style={[style, modalInsets]} />;
}

function surfaceShadow(platform: typeof Platform.OS) {
  return {
    shadowColor: '#000000',
    shadowOpacity: platform === 'ios' || platform === 'web' ? 0.055 : 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: platform === 'android' ? 2 : 0,
  } as const;
}

export function Page({ title, subtitle, icon: Icon, children, refreshing, onRefresh, safeTop = true, contentMaxWidth = 820 }: { title: string; subtitle?: string; icon?: LucideIcon; children: ReactNode; refreshing?: boolean; onRefresh?: () => void; safeTop?: boolean; contentMaxWidth?: number }) {
  const colors = useAppTheme();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.page }} edges={safeTop ? ['top'] : []}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" removeClippedSubviews={Platform.OS === 'android'} contentContainerStyle={{ width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110, gap: 16 }}>
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>{Icon ? <IconTile icon={Icon} size={44} iconSize={22} /> : null}<View style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800' }}>{title}</Text>{subtitle ? <Text style={{ color: colors.subtext, fontSize: 13, lineHeight: 18 }}>{subtitle}</Text> : null}</View></View>
        {onRefresh ? <Pressable accessibilityLabel="刷新" onPress={onRefresh} disabled={refreshing} style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...surfaceShadow(Platform.OS), opacity: refreshing ? 0.55 : pressed ? 0.62 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] })}>{refreshing ? <ActivityIndicator color={colors.primary} /> : <RefreshCw color={colors.primary} size={19} strokeWidth={2.2} />}</Pressable> : null}
      </View>
      {children}
    </ScrollView>
  </SafeAreaView>;
}

type ResponsiveTab<Key extends string> = readonly [Key, string, LucideIcon];

export function ResponsiveTabBar<Key extends string>({ tabs, value, onChange, maxWidth = 820 }: { tabs: readonly ResponsiveTab<Key>[]; value: Key; onChange: (key: Key) => void; maxWidth?: number }) {
  const colors = useAppTheme();
  const { width } = useWindowDimensions();
  const singleRow = width >= tabs.length * 82 + 40;
  return <View style={{ width: '100%', maxWidth, alignSelf: 'center', padding: 4, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
    {tabs.map(([key, label, Icon]) => {
      const selected = value === key;
      return <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => onChange(key)}
        style={({ pressed }) => ({
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: singleRow ? 0 : '30%',
          minWidth: 0,
          minHeight: singleRow ? 44 : 56,
          paddingHorizontal: 6,
          paddingVertical: singleRow ? 0 : 6,
          borderRadius: 12,
          backgroundColor: selected ? colors.card : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: singleRow ? 'row' : 'column',
          gap: singleRow ? 6 : 3,
          ...(selected ? surfaceShadow(Platform.OS) : {}),
          opacity: pressed ? 0.62 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        <Icon color={selected ? colors.primary : colors.subtext} size={16} strokeWidth={selected ? 2.4 : 2.1} />
        <Text numberOfLines={2} style={{ maxWidth: '100%', color: selected ? colors.primary : colors.subtext, fontSize: 11, lineHeight: 14, fontWeight: selected ? '700' : '600', textAlign: 'center' }}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

export function Panel({ children }: { children: ReactNode }) {
  const colors = useAppTheme();
  return <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: CARD_RADIUS, padding: 16, gap: 12, ...surfaceShadow(Platform.OS) }}>{children}</View>;
}

export function IconTile({ icon: Icon, color, background, size = 36, iconSize = 18 }: { icon: LucideIcon; color?: string; background?: string; size?: number; iconSize?: number }) {
  const colors = useAppTheme();
  return <View style={{ width: size, height: size, borderRadius: Math.max(9, Math.round(size * 0.28)), alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: background ?? colors.primarySoft }}><Icon color={color ?? colors.primary} size={iconSize} strokeWidth={2.2} /></View>;
}

export function EmptyState({ message, icon: Icon = Inbox, embedded = false }: { message: string; icon?: LucideIcon; embedded?: boolean }) {
  const colors = useAppTheme();
  const content = <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}><IconTile icon={Icon} color={colors.subtext} background={colors.mutedCard} size={42} iconSize={21} /><Text style={{ color: colors.subtext, textAlign: 'center' }}>{message}</Text></View>;
  return embedded ? content : <Panel>{content}</Panel>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ padding: 14, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: colors.dangerBg, backgroundColor: colors.dangerBg, gap: 10 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon={TriangleAlert} color={colors.danger} background={colors.card} size={34} iconSize={17} /><Text style={{ flex: 1, color: colors.danger, lineHeight: 19 }}>{message}</Text></View>{retry ? <Pressable onPress={retry} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 12, borderRadius: CONTROL_RADIUS, backgroundColor: colors.card, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}><RefreshCw color={colors.danger} size={14} /><Text style={{ color: colors.danger, fontWeight: '700' }}>重试</Text></Pressable> : null}</View>;
}

export function SectionHeader({ icon: Icon, title, meta }: { icon: LucideIcon; title: string; meta?: string }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 9 }}><IconTile icon={Icon} size={32} iconSize={16} /><Text style={{ flex: 1, color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '700' }}>{title}</Text>{meta ? <View style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.mutedCard }}><Text style={{ color: colors.subtext, fontSize: 11, fontWeight: '600' }}>{meta}</Text></View> : null}</View>;
}

export function SheetHandle() {
  const colors = useAppTheme();
  return <View accessibilityElementsHidden style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: colors.muted, alignSelf: 'center', marginTop: -5, marginBottom: 2 }} />;
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) {
  const colors = useAppTheme();
  return <View style={{ height: 46, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 }}><Search color={colors.subtext} size={17} strokeWidth={2.1} /><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, color: colors.text, paddingVertical: 10, fontSize: 15 }} /></View>;
}

export function ServiceButton({ icon: Icon, label, detail, onPress, iconColor, iconBackground }: { icon: LucideIcon; label: string; detail: string; onPress: () => void; iconColor?: string; iconBackground?: string }) {
  const colors = useAppTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 150, minHeight: 124, padding: 15, gap: 10, borderRadius: CARD_RADIUS, backgroundColor: pressed ? colors.mutedCard : colors.card, borderWidth: 1, borderColor: colors.border, ...surfaceShadow(Platform.OS), opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><IconTile icon={Icon} color={iconColor} background={iconBackground} size={42} iconSize={21} /><View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mutedCard }}><ChevronRight color={colors.subtext} size={16} /></View></View>
    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{label}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{detail}</Text>
  </Pressable>;
}
