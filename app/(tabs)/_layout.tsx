import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppTheme } from '@/src/lib/theme';
import { luckySessionState } from '@/src/store/lucky-session';

const { useSnapshot } = require('valtio/react');

export default function TabLayout() {
  const colors = useAppTheme();
  const session = useSnapshot(luckySessionState);
  if (!session.token) return <Redirect href="/login" />;

  return <NativeTabs
    tintColor={colors.primary}
    iconColor={{ default: colors.subtext, selected: colors.primary }}
    labelStyle={{
      default: { color: colors.subtext, fontSize: 11, fontWeight: '600' },
      selected: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    }}
    blurEffect="systemDefault"
    minimizeBehavior="onScrollDown"
  >
    <NativeTabs.Trigger name="index" hidden />
    <NativeTabs.Trigger name="monitor">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'gauge', selected: 'gauge' }}
        md={{ default: 'speed', selected: 'speed' }}
      />
      <NativeTabs.Trigger.Label>总览</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="manage">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
        md={{ default: 'grid_view', selected: 'grid_view' }}
      />
      <NativeTabs.Trigger.Label>服务</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="users">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'doc.text', selected: 'doc.text.fill' }}
        md={{ default: 'description', selected: 'description' }}
      />
      <NativeTabs.Trigger.Label>日志</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="settings">
      <NativeTabs.Trigger.Icon
        sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
        md={{ default: 'settings', selected: 'settings' }}
      />
      <NativeTabs.Trigger.Label>设置</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
