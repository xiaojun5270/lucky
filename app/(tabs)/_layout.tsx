import { Redirect, Tabs } from 'expo-router';
import { FileText, Gauge, LayoutGrid, Settings } from 'lucide-react-native';

import { useAppTheme } from '@/src/lib/theme';
import { luckySessionState } from '@/src/store/lucky-session';

const { useSnapshot } = require('valtio/react');

export default function TabLayout() {
  const colors = useAppTheme();
  const session = useSnapshot(luckySessionState);
  if (!session.token) return <Redirect href="/login" />;

  return <Tabs initialRouteName="monitor" screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.subtext, tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, height: 68, paddingTop: 7, paddingBottom: 7 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '600' } }}>
    <Tabs.Screen name="index" options={{ href: null }} />
    <Tabs.Screen name="monitor" options={{ title: '总览', tabBarIcon: ({ color, size }) => <Gauge color={color} size={size} /> }} />
    <Tabs.Screen name="manage" options={{ title: '服务', tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size} /> }} />
    <Tabs.Screen name="users" options={{ title: '日志', tabBarIcon: ({ color, size }) => <FileText color={color} size={size} /> }} />
    <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
  </Tabs>;
}
