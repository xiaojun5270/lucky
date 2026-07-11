import '@/src/global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { hydrateLuckySession, luckySessionState } from '@/src/store/lucky-session';

const { useSnapshot } = require('valtio/react');

export default function RootLayout() {
  const colors = useAppTheme();
  const session = useSnapshot(luckySessionState);

  useEffect(() => { hydrateLuckySession(); }, []);

  return <GestureHandlerRootView style={{ flex: 1 }}>
    <StatusBar style={colors.mode === 'dark' ? 'light' : 'dark'} />
    <QueryClientProvider client={queryClient}>
      {!session.hydrated ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.page }}><ActivityIndicator color={colors.primary} /></View> :
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.page }, headerTintColor: colors.text, headerShadowVisible: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="services/[kind]" options={{ title: '服务详情', headerBackTitle: '返回' }} />
          <Stack.Screen name="modules/[module]" options={{ title: '模块接口', headerBackTitle: '返回' }} />
          <Stack.Screen name="endpoints/[id]" options={{ title: '接口调试', headerBackTitle: '返回' }} />
        </Stack>}
    </QueryClientProvider>
  </GestureHandlerRootView>;
}
