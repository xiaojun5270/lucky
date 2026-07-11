import { router } from 'expo-router';
import { Container, Globe2, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { Page, ServiceButton } from '@/src/components/lucky-ui';

export default function ServicesScreen() {
  const go = (kind: string) => router.push(`/services/${kind}` as never);
  return <Page title="服务" subtitle="管理核心网络与容器服务"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
    <ServiceButton icon={Globe2} label="反向代理" detail="域名、后端与 TLS 规则" onPress={() => go('webservice')} />
    <ServiceButton icon={RefreshCw} label="动态域名" detail="DDNS 任务与手动同步" onPress={() => go('ddns')} />
    <ServiceButton icon={Container} label="Docker" detail="容器状态与启停操作" onPress={() => go('docker')} />
    <ServiceButton icon={ShieldCheck} label="SSL 证书" detail="证书状态与手动同步" onPress={() => go('ssl')} />
  </View></Page>;
}
