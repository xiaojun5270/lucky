import { router } from 'expo-router';
import { LogOut, Server } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Page, Panel } from '@/src/components/lucky-ui';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { logoutLucky } from '@/src/services/lucky';
import { endLuckySession, luckySessionState } from '@/src/store/lucky-session';

export default function SettingsScreen() {
  const colors = useAppTheme();
  const [busy, setBusy] = useState(false);
  const leave = async () => { setBusy(true); try { await logoutLucky(); } catch {} finally { await endLuckySession(); queryClient.clear(); router.replace('/login'); setBusy(false); } };
  return <Page title="设置" subtitle="当前 Lucky 连接"><Panel>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSoftBg }}><Server color={colors.primary} size={21} /></View><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{luckySessionState.account || '管理员'}</Text><Text selectable numberOfLines={2} style={{ color: colors.subtext, marginTop: 3, fontSize: 12 }}>{luckySessionState.baseUrl}</Text></View></View>
  </Panel><Panel><Text style={{ color: colors.text, fontWeight: '700' }}>安全说明</Text><Text style={{ color: colors.subtext, lineHeight: 20, fontSize: 13 }}>公网访问时应在 Lucky 前配置 HTTPS 与访问控制。管理 Token 不会写入 Web 的持久存储。</Text></Panel>
    <Pressable disabled={busy} onPress={() => Alert.alert('退出登录', '确定结束当前 Lucky 会话吗？', [{ text: '取消', style: 'cancel' }, { text: '退出', style: 'destructive', onPress: leave }])} style={{ height: 48, borderRadius: 8, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}><LogOut color={colors.danger} size={18} /><Text style={{ color: colors.danger, fontWeight: '700' }}>{busy ? '正在退出' : '退出登录'}</Text></Pressable>
  </Page>;
}
