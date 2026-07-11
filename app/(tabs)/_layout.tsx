import { BlurView } from 'expo-blur';
import { Redirect, Tabs } from 'expo-router';
import { Gauge, Layers3, ScrollText, SlidersHorizontal } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/src/lib/theme';
import { luckySessionState } from '@/src/store/lucky-session';

const { useSnapshot } = require('valtio/react');

export default function TabLayout() {
  const colors = useAppTheme();
  const insets = useSafeAreaInsets();
  const session = useSnapshot(luckySessionState);
  if (!session.token) return <Redirect href="/login" />;

  const glassBackground = colors.mode === 'dark' ? 'rgba(15, 23, 42, 0.68)' : 'rgba(255, 255, 255, 0.68)';
  const glassBorder = colors.mode === 'dark' ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.92)';
  const activeGlass = colors.mode === 'dark' ? 'rgba(59, 130, 246, 0.20)' : 'rgba(37, 99, 235, 0.11)';

  return <Tabs initialRouteName="monitor" screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.subtext,
    tabBarActiveBackgroundColor: activeGlass,
    tabBarStyle: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: Math.max(insets.bottom, 10),
      height: 70,
      paddingTop: 7,
      paddingBottom: 7,
      borderTopWidth: 0,
      borderRadius: 26,
      backgroundColor: 'transparent',
      shadowColor: colors.shadow,
      shadowOpacity: colors.mode === 'dark' ? 0.34 : 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    tabBarBackground: () => <BlurView tint={colors.mode === 'dark' ? 'dark' : 'light'} intensity={82} style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 26, borderWidth: 1, borderColor: glassBorder, backgroundColor: glassBackground }]}><View pointerEvents="none" style={{ position: 'absolute', top: 1, left: 22, right: 22, height: 1, backgroundColor: colors.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.96)' }} /></BlurView>,
    tabBarItemStyle: { marginHorizontal: 3, marginVertical: 3, borderRadius: 20, gap: 2, overflow: 'hidden' },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
  }}>
    <Tabs.Screen name="index" options={{ href: null }} />
    <Tabs.Screen name="monitor" options={{ title: '总览', tabBarIcon: ({ color, size }) => <Gauge color={color} size={size} /> }} />
    <Tabs.Screen name="manage" options={{ title: '服务', tabBarIcon: ({ color, size }) => <Layers3 color={color} size={size} /> }} />
    <Tabs.Screen name="users" options={{ title: '日志', tabBarIcon: ({ color, size }) => <ScrollText color={color} size={size} /> }} />
    <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color, size }) => <SlidersHorizontal color={color} size={size} /> }} />
  </Tabs>;
}
