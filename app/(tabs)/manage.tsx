import { router } from 'expo-router';
import { Cloud, Container, Globe2, Layers3, Network, RefreshCw, ShieldCheck, Star } from 'lucide-react-native';
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
    <SectionHeader icon={Network} title="内网穿透" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <ServiceButton icon={Network} label="STUN 内网穿透" detail="穿透规则与公网地址" onPress={() => router.push('/tunnels/stun' as never)} />
      <ServiceButton icon={Cloud} label="Cloudflared" detail="隧道与域名路由" iconColor={colors.warning} iconBackground={colors.warningBg} onPress={() => router.push('/tunnels/cloudflared' as never)} />
      <ServiceButton icon={Globe2} label="FRP 内网穿透" detail="客户端、服务端与代理" iconColor={colors.cyan} iconBackground={colors.cyanBg} onPress={() => router.push('/tunnels/frp' as never)} />
    </View>
  </Page>;
}
