import { router } from 'expo-router';
import { Container, Globe2, Layers3, RefreshCw, ShieldCheck, Star } from 'lucide-react-native';
import { View } from 'react-native';

import { Page, SectionHeader, ServiceButton } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';

export default function ServicesScreen() {
  const colors = useAppTheme();
  const go = (kind: string) => router.push((kind === 'webservice' ? '/webservice' : kind === 'docker' ? '/docker' : `/services/${kind}`) as never);

  return <Page title="服务" icon={Layers3}>
    <SectionHeader icon={Star} title="常用服务" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <ServiceButton icon={Globe2} label="反向代理" detail="域名、后端与 TLS 规则" onPress={() => go('webservice')} />
      <ServiceButton icon={RefreshCw} label="动态域名" detail="DDNS 任务与手动同步" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => go('ddns')} />
      <ServiceButton icon={Container} label="Docker" detail="容器状态与启停操作" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => go('docker')} />
      <ServiceButton icon={ShieldCheck} label="SSL 证书" detail="证书状态与手动同步" iconColor={colors.success} iconBackground={colors.successBg} onPress={() => go('ssl')} />
    </View>
  </Page>;
}
