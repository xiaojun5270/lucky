import { useState } from 'react';
import { Pressable, Switch, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react-native';
import { StructuredForm } from '@/src/components/structured-form';
import { useAppTheme } from '@/src/lib/theme';
import { record, type TunnelKind, type TunnelCollection } from '@/src/services/tunnels';
import type { LuckyRecord } from '@/src/types/lucky';

export type TunnelFormType = TunnelKind | TunnelCollection | 'stun-settings';
type Field = { key: string; label: string; type?: 'number' | 'switch' | 'lines' | 'multiline' | 'secret'; options?: string[]; required?: boolean; min?: number; max?: number };
const field = (key: string, label: string, type?: Field['type'], extra: Partial<Field> = {}): Field => ({ key, label, type, ...extra });
const port = (key: string, label: string, required = false) => field(key, label, 'number', { min: required ? 1 : 0, max: 65535, required });
const webhookFields = [
  field('WebhookEnable', '启用 Webhook', 'switch'), field('WebhookOnlyAddrChange', '仅地址变更时通知', 'switch'),
  field('WebhookURL', 'Webhook 地址'), field('WebhookMethod', '请求方法', undefined, { options: ['get', 'post', 'put', 'patch'] }),
  field('WebhookHeaders', '请求头', 'lines'), field('WebhookRequestBody', '请求内容', 'multiline'),
  field('WebhookDisableCallbackSuccessContentCheck', '跳过响应内容检查', 'switch'), field('WebhookSuccessContent', '成功响应关键字', 'lines'),
  field('WebhookProxy', '代理类型', undefined, { options: ['', 'http', 'https', 'socks5', 'dns'] }), field('WebhookProxyAddr', '代理地址'),
  field('WebhookProxyUser', '代理账号'), field('WebhookProxyPassword', '代理密码', 'secret'),
  field('RetryCount', '重试次数', 'number', { min: 0 }), field('RetryInterval', '重试间隔（毫秒）', 'number', { min: 0 }),
];
const webhookDefaults = { WebhookEnable: false, WebhookOnlyAddrChange: true, WebhookURL: '', WebhookMethod: 'post', WebhookHeaders: [], WebhookRequestBody: '', WebhookDisableCallbackSuccessContentCheck: true, WebhookSuccessContent: [], WebhookProxy: '', WebhookProxyAddr: '', WebhookProxyUser: '', WebhookProxyPassword: '', RetryCount: 0, RetryInterval: 500 };

export function tunnelDefaults(type: TunnelFormType, mode?: string): LuckyRecord {
  if (type === 'stun-settings') return { EnableModule: true, GlobalStunServerList: [], ...webhookDefaults };
  if (type === 'stun') return {
    Key: '', Name: '', Enable: true, StunType: 'tcp4', DiaglogShowMode: 'simple', StunListenType: 'ip',
    ListenIP: '', ListenPort: 0, SpecifyNetworkInterface: '', NetworkInterfaceReg: '',
    UseGlobalStunServerList: true, StunServerList: ['stun.miwifi.com:3478'], TcpKeepAliveServerList: [],
    DisablePortForward: false, TargetAddressList: ['127.0.0.1'], TargetPort: 80,
    AutoOptionsFirewall: true, NatPMP: false, NatPMPGateway: '', UPnP: false, UPnPGawayIP: '', UPnPLocalPort: 0, UPnpLocalHost: '', UpnPDiyControlAPIUrl: '',
    StunHeartbeatInterval: 2300, StunTimeout: 3000, StunRetryInterval: 3000, StunAutoRetry: true, DisableStunAvalidCheck: false,
    AutoAddPubAddrWhiteList: false, LogLevel: 4, LogOutputToConsole: false, AccessLogMaxNum: 128, WebListShowLastLogMaxCount: 20,
    GlobalWebhook: false, CallScript: false, CallScriptContent: '', ...webhookDefaults,
    Options: { DisableSelfForwardingCheck: false, SingleProxyMaxTCPConnections: 256, SingleProxyMaxUDPReadTargetDatagoroutineCount: 32, UDPShortMode: false, SafeMode: 'blacklist', TCPListenTLS: false, TCPRelayTLS: false, TCPRelayTLSServerName: '', TCPRelayTLSInsecureSkipVerify: false, TCPStreamEncryptionSource: false, TCPStreamEncryptionAccept: false, TCPStreamEncryptionKey: '', SinglePortSpeedLimit: false, SinglePortSendSpeedLimit: 0, SinglePortReceSpeedLimit: 0, RuleSpeedLimit: false, RuleSendSpeedLimit: 0, RuleReceSpeedLimit: 0, UDPSessionTimeout: 30000, UDPPacketSourceEncryption: false, UDPPacketAcceptEncryption: false, UDPPacketEncryptionKey: '', UDPPacketSize: 1500 },
  };
  if (type === 'cloudflared') return { Key: '', Remark: '', Enable: true, Type: mode ?? 'tunnel', Params: mode === 'access'
    ? { Hostname: '', URL: '', HeaderList: '', Destination: '', TokenId: '', TokenSecret: '', ConnectTo: '', UserAgent: '', NoTlsVerify: false }
    : { Token: '', EdgeIpVersion: 'auto', HaConnections: 4, Protocol: 'http2', EdgeBindAddress: '', ICMPV4Src: '', ICMPV6Src: '', NoTlsVerify: false, Network: 'tcp4', ListenIP: '127.0.0.1', ListenPort: 60000, CFApiToken: '', CFAccountId: '', CFTunnelId: '' } };
  if (type === 'frp') return { Key: '', Remark: '', Enable: true, Type: mode ?? 'client', Proxies: [], Visitors: [], Params: mode === 'server'
    ? { BindAddr: '0.0.0.0', BindPort: 7000, Token: '', ProxyBindAddr: '', KCPBindPort: 0, QUICBindPort: 0, VhostHTTPPort: 0, VhostHTTPSPort: 0, VhostHTTPTimeout: 60, TCPMuxHTTPConnectPort: 0, TCPMuxPassthrough: false, TCPMux: true, TCPMuxKeepaliveInterval: 60, TCPKeepalive: 7200, MaxPoolCount: 5, MaxPortsPerClient: 0, AllowPorts: '', HeartbeatTimeout: 90, UserConnTimeout: 10, TLSOnly: false, UDPPacketSize: 1500, DetailedErrorsToClient: true, DashboardPort: 0, DashboardUser: 'admin' }
    : { ServerAddr: '', ServerPort: 7000, User: '', AuthMethod: 'token', Token: '', AuthAdditionalScopes: [], Protocol: 'tcp', NatHoleStunServer: '', DialServerTimeout: 10, DialServerKeepalive: 7200, ConnectServerLocalIP: '', ProxyURL: '', PoolCount: 1, TCPMux: true, TCPMuxKeepaliveInterval: 60, HeartbeatInterval: 30, HeartbeatTimeout: 90, TLSEnable: true, TLSServerName: '', DisableCustomTLSFirstByte: true, TLSInsecureSkipVerify: false, UDPPacketSize: 1500, DNSServer: '', LoginFailExit: false, Start: [], Metadatas: {}, AdminPort: 0, AdminUser: 'admin', OIDCClientID: '', OIDCClientSecret: '', OIDCAudience: '', OIDCScope: '', OIDCTokenEndpointURL: '' } };
  if (type === 'ingress') return { hostname: '', path: '', service: 'http://127.0.0.1:80', originRequest: { noTLSVerify: false, originServerName: '', httpHostHeader: '', http2Origin: false } };
  if (type === 'proxies') return { name: '', type: 'tcp', disabled: false, localIP: '127.0.0.1', localPort: 80, remotePort: 8080, useEncryption: false, useCompression: false, proxyProtocolVersion: '', plugin: '', natTraversal: { disableAssistedAddrs: false } };
  return { name: '', type: 'stcp', disabled: false, serverName: '', secretKey: '', bindAddr: '127.0.0.1', bindPort: 8080, serverUser: '', transport: { useEncryption: false, useCompression: false }, protocol: 'quic', keepTunnelOpen: false, maxRetriesAnHour: 8, minRetryInterval: 90, fallbackTo: '', fallbackTimeoutMs: 0 };
}

function fields(type: TunnelFormType, value: LuckyRecord, advanced: boolean): Field[] {
  if (type === 'stun-settings') return advanced ? webhookFields : [field('EnableModule', '启用 STUN 模块', 'switch'), field('GlobalStunServerList', '全局 STUN 服务器', 'lines')];
  if (type === 'stun') return advanced ? [
    field('AutoOptionsFirewall', '自动配置防火墙', 'switch'), field('NatPMP', 'NAT-PMP', 'switch'), field('NatPMPGateway', 'NAT-PMP 网关'),
    field('UPnP', 'UPnP', 'switch'), field('UPnPGawayIP', 'UPnP 网关'), port('UPnPLocalPort', 'UPnP 本地端口'),
    field('StunHeartbeatInterval', '心跳间隔（毫秒）', 'number', { min: 1 }), field('StunTimeout', 'STUN 超时（毫秒）', 'number', { min: 1 }),
    field('StunRetryInterval', '重试间隔（毫秒）', 'number', { min: 1 }), field('StunAutoRetry', '自动重试', 'switch'),
    field('DisableStunAvalidCheck', '跳过 STUN 有效性检查', 'switch'), field('TcpKeepAliveServerList', 'TCP 保活服务器', 'lines'),
    field('GlobalWebhook', '使用全局 Webhook', 'switch'), ...webhookFields,
    field('CallScript', '执行脚本', 'switch'), field('CallScriptContent', '脚本内容', 'multiline'),
  ] : [field('Name', '规则名称', undefined, { required: true }), field('Enable', '启用规则', 'switch'),
    field('StunType', '穿透协议', undefined, { options: ['tcp4', 'udp4'] }),
    field('StunListenType', '监听方式', undefined, { options: ['ip', 'networkInterface'] }),
    ...(value.StunListenType === 'ip' ? [field('ListenIP', '监听 IP（留空自动选择）')] : [field('SpecifyNetworkInterface', '网卡名称'), field('NetworkInterfaceReg', '地址匹配表达式')]),
    port('ListenPort', '监听端口（0 为自动）'), field('DisablePortForward', '仅获取公网地址', 'switch'),
    ...(!value.DisablePortForward ? [field('TargetAddressList', '目标地址', 'lines', { required: true }), port('TargetPort', '目标端口', true)] : []),
    field('UseGlobalStunServerList', '使用全局 STUN 服务器', 'switch'),
    ...(!value.UseGlobalStunServerList ? [field('StunServerList', 'STUN 服务器', 'lines', { required: true })] : []),
  ];
  if (type === 'cloudflared') {
    if (advanced) return value.Type === 'access' ? [field('Params.HeaderList', '请求头', 'multiline'), field('Params.Destination', '目标地址'), field('Params.ConnectTo', '连接地址'), field('Params.UserAgent', 'User Agent')]
      : [field('Params.CFApiToken', 'Cloudflare API Token', 'secret'), field('Params.CFAccountId', '账户 ID'), field('Params.CFTunnelId', '隧道 ID'), field('Params.EdgeBindAddress', '边缘绑定地址'), field('Params.ICMPV4Src', 'ICMP IPv4 源地址'), field('Params.ICMPV6Src', 'ICMP IPv6 源地址')];
    return [field('Remark', '实例名称', undefined, { required: true }), field('Enable', '启用实例', 'switch'), field('Type', '实例类型', undefined, { options: ['tunnel', 'access'] }),
      ...(value.Type === 'access' ? [field('Params.Hostname', '访问域名', undefined, { required: true }), field('Params.URL', '本地监听地址', undefined, { required: true }), field('Params.TokenId', '服务令牌 ID', 'secret'), field('Params.TokenSecret', '服务令牌密钥', 'secret')]
        : [field('Params.Token', '隧道 Token', 'secret', { required: true }), field('Params.EdgeIpVersion', '边缘 IP 版本', undefined, { options: ['auto', '4', '6'] }), field('Params.Protocol', '连接协议', undefined, { options: ['auto', 'http2', 'quic'] }), field('Params.HaConnections', '连接数', 'number', { min: 1, max: 8 })]), field('Params.NoTlsVerify', '跳过源站 TLS 校验', 'switch')];
  }
  if (type === 'frp') {
    if (advanced) return value.Type === 'server' ? [port('Params.KCPBindPort', 'KCP 监听端口'), port('Params.QUICBindPort', 'QUIC 监听端口'), field('Params.AllowPorts', '允许端口范围'), port('Params.DashboardPort', '管理面板端口'), field('Params.DashboardUser', '管理面板账号'), field('Params.DashboardPassword', '管理面板密码', 'secret'), field('Params.TLSOnly', '强制 TLS', 'switch')]
      : [field('Params.User', '用户标识'), field('Params.NatHoleStunServer', 'NAT 穿透 STUN 服务器'), field('Params.ProxyURL', '连接代理 URL'), field('Params.DNSServer', 'DNS 服务器'), field('Params.TLSServerName', 'TLS 服务名'), field('Params.TLSInsecureSkipVerify', '跳过 TLS 证书校验', 'switch'), field('Params.HeartbeatInterval', '心跳间隔（秒）', 'number', { min: 1 }), field('Params.HeartbeatTimeout', '心跳超时（秒）', 'number', { min: 1 }), field('Params.OIDCClientID', 'OIDC 客户端 ID'), field('Params.OIDCClientSecret', 'OIDC 客户端密钥', 'secret'), field('Params.OIDCTokenEndpointURL', 'OIDC 令牌地址'), field('Params.OIDCAudience', 'OIDC Audience'), field('Params.OIDCScope', 'OIDC Scope')];
    return [field('Remark', '实例名称', undefined, { required: true }), field('Enable', '启用实例', 'switch'), field('Type', '实例类型', undefined, { options: ['client', 'server'] }),
      ...(value.Type === 'server' ? [field('Params.BindAddr', '监听地址'), port('Params.BindPort', '监听端口', true), port('Params.VhostHTTPPort', 'HTTP 虚拟主机端口'), port('Params.VhostHTTPSPort', 'HTTPS 虚拟主机端口')]
        : [field('Params.ServerAddr', '服务器地址', undefined, { required: true }), port('Params.ServerPort', '服务器端口', true), field('Params.Protocol', '传输协议', undefined, { options: ['tcp', 'kcp', 'quic', 'websocket', 'wss'] }), field('Params.AuthMethod', '认证方式', undefined, { options: ['token', 'oidc'] }), field('Params.TLSEnable', '启用 TLS', 'switch')]), field('Params.Token', '认证 Token', 'secret')];
  }
  if (type === 'ingress') return advanced ? [field('originRequest.originServerName', '源站 TLS 服务名'), field('originRequest.httpHostHeader', '源站 Host'), field('originRequest.http2Origin', '源站 HTTP/2', 'switch'), field('originRequest.connectTimeout', '连接超时（例如 30s）')]
    : [field('hostname', '域名（留空为兜底规则）'), field('path', '路径表达式'), field('service', '后端服务', undefined, { required: true }), field('originRequest.noTLSVerify', '跳过源站 TLS 校验', 'switch')];
  const proxyType = String(value.type ?? 'tcp');
  if (type === 'proxies') return advanced ? [field('useEncryption', '加密', 'switch'), field('useCompression', '压缩', 'switch'), field('proxyProtocolVersion', 'Proxy Protocol', undefined, { options: ['', 'v1', 'v2'] }), field('bandwidthLimit', '带宽限制（例如 1MB）'), field('plugin', '插件', undefined, { options: ['', 'http_proxy', 'socks5', 'static_file', 'unix_domain_socket', 'http2https', 'https2http', 'https2https', 'tls2raw'] })]
    : [field('name', '代理名称', undefined, { required: true }), field('type', '代理类型', undefined, { options: ['tcp', 'udp', 'http', 'https', 'stcp', 'xtcp', 'sudp', 'tcpmux'] }), field('disabled', '停用代理', 'switch'), field('localIP', '本地地址'), port('localPort', '本地端口', true),
      ...(['tcp', 'udp'].includes(proxyType) ? [port('remotePort', '远端端口', true)] : []),
      ...(['http', 'https', 'tcpmux'].includes(proxyType) ? [field('customDomains', '自定义域名', 'lines'), field('subdomain', '子域名')] : []),
      ...(['stcp', 'xtcp', 'sudp'].includes(proxyType) ? [field('secretKey', '访问密钥', 'secret', { required: true })] : [])];
  return advanced ? [field('transport.useEncryption', '加密', 'switch'), field('transport.useCompression', '压缩', 'switch'), field('keepTunnelOpen', '保持隧道连接', 'switch'), field('serverUser', '服务端用户'), field('protocol', '穿透协议', undefined, { options: ['quic', 'kcp'] })]
    : [field('name', '访问者名称', undefined, { required: true }), field('type', '访问类型', undefined, { options: ['stcp', 'xtcp', 'sudp'] }), field('disabled', '停用访问者', 'switch'), field('serverName', '服务端代理名称', undefined, { required: true }), field('secretKey', '访问密钥', 'secret', { required: true }), field('bindAddr', '本地监听地址'), port('bindPort', '本地监听端口', true)];
}
function get(value: LuckyRecord, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => record(current)[part], value);
}
function set(value: LuckyRecord, key: string, next: unknown): LuckyRecord {
  const [head, ...tail] = key.split('.');
  return { ...value, [head]: tail.length ? set(record(value[head]), tail.join('.'), next) : next };
}
export function validateTunnelForm(type: TunnelFormType, value: LuckyRecord) {
  let result = value;
  for (const f of [...fields(type, value, false), ...fields(type, value, true)]) {
    const v = get(result, f.key);
    if (f.required && (v == null || !String(v).trim() || (Array.isArray(v) && !v.some(x => String(x).trim())))) throw new Error(`请填写${f.label}`);
    if (f.type === 'number' && v !== undefined) {
      const n = Number(v);
      if (v === '' || !Number.isInteger(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) throw new Error(`${f.label}范围无效${f.min !== undefined ? `（${f.min}${f.max !== undefined ? `～${f.max}` : ' 起'}）` : ''}`);
      result = set(result, f.key, n);
    }
    if (f.type === 'lines') result = set(result, f.key, (Array.isArray(v) ? v : []).map(String).map(x => x.trim()).filter(Boolean));
  }
  if ((type === 'stun' || type === 'stun-settings') && result.WebhookEnable && (!String(result.WebhookURL ?? '').trim() || !result.WebhookMethod)) throw new Error('请填写 Webhook 地址和请求方法');
  if (type === 'stun' && result.NatPMP && result.UPnP) throw new Error('NAT-PMP 和 UPnP 只能启用一项');
  if (type === 'frp' && ['kcp', 'quic'].includes(String(record(result.Params).Protocol))) result = set(result, 'Params.TCPMux', false);
  return result;
}
const optionLabels: Record<string, string> = { '': '无', client: '客户端', server: '服务端', tunnel: 'Tunnel 隧道', access: 'Access 访问', auto: '自动', ip: 'IP 地址', networkInterface: '指定网卡', tcp4: 'TCP / IPv4', udp4: 'UDP / IPv4' };
function FormField({ spec, value, onChange, disabled }: { spec: Field; value: unknown; onChange: (value: unknown) => void; disabled: boolean }) {
  const colors = useAppTheme();
  const [revealed, setRevealed] = useState(false);
  const label = <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' }}>{spec.label}{spec.required ? ' *' : ''}</Text>;
  if (spec.type === 'switch') return <View style={{ minHeight: 46, flexDirection: 'row', gap: 12, alignItems: 'center' }}>{label}<Switch accessibilityLabel={spec.label} disabled={disabled} value={value === true} onValueChange={onChange} /></View>;
  return <View style={{ gap: 8 }}>{label}{spec.options ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{spec.options.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: value === option }} disabled={disabled} onPress={() => onChange(option)} style={{ minHeight: 40, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: value === option ? colors.primary : colors.border, backgroundColor: value === option ? colors.primarySoft : colors.card }}><Text style={{ color: value === option ? colors.primary : colors.text, fontSize: 12 }}>{optionLabels[option] ?? option}</Text></Pressable>)}</View>
    : <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card }}><TextInput accessibilityLabel={spec.label} editable={!disabled} value={Array.isArray(value) ? value.join('\n') : String(value ?? '')} onChangeText={next => onChange(spec.type === 'lines' ? next.split('\n') : next)} autoCapitalize="none" autoCorrect={false} secureTextEntry={spec.type === 'secret' && !revealed} multiline={spec.type === 'lines' || spec.type === 'multiline'} textAlignVertical={spec.type === 'lines' || spec.type === 'multiline' ? 'top' : 'center'} keyboardType={spec.type === 'number' ? 'number-pad' : 'default'} style={{ flex: 1, minWidth: 0, minHeight: spec.type === 'lines' || spec.type === 'multiline' ? 112 : 46, padding: 12, color: colors.text, fontSize: 13, lineHeight: 19 }} />{spec.type === 'secret' ? <Pressable accessibilityLabel={revealed ? '隐藏密钥' : '显示密钥'} onPress={() => setRevealed(!revealed)} style={{ padding: 12 }}>{revealed ? <EyeOff size={18} color={colors.subtext} /> : <Eye size={18} color={colors.subtext} />}</Pressable> : null}</View>}</View>;
}

export function TunnelForm({ type, value, onChange, disabled = false }: { type: TunnelFormType; value: LuckyRecord; onChange: (value: LuckyRecord) => void; disabled?: boolean }) {
  const colors = useAppTheme();
  const [advanced, setAdvanced] = useState(false);
  const [extras, setExtras] = useState(false);
  function change(key: string, next: unknown) {
    if (key === 'Type' && (type === 'frp' || type === 'cloudflared')) {
      const defaults = tunnelDefaults(type, String(next));
      onChange({ ...value, Type: next, Params: { ...record(defaults.Params), ...record(value.Params) } });
    } else onChange(set(value, key, next));
  }
  const shown = [...fields(type, value, false), ...(advanced ? fields(type, value, true) : [])]
    .filter(spec => !(type === 'stun' && !value.Key && spec.key === 'Enable'));
  // Keep uncommon server fields editable without replacing the original configuration.
  const covered = new Set([...fields(type, value, false), ...fields(type, value, true)].map(f => f.key));
  const extra = Object.fromEntries(Object.entries(value).filter(([key]) => !covered.has(key) && !['Key', 'ret', 'msg', 'Proxies', 'Visitors', 'proxies', 'visitors'].includes(key)).map(([key, item]) => [key, item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(record(item)).filter(([child]) => !covered.has(`${key}.${child}`))) : item]));
  return <View style={{ gap: 15 }}>
    {shown.map(spec => <FormField key={spec.key} spec={spec} value={get(value, spec.key)} onChange={next => change(spec.key, next)} disabled={disabled} />)}
    <Pressable onPress={() => setAdvanced(!advanced)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>{advanced ? <ChevronUp size={17} color={colors.primary} /> : <ChevronDown size={17} color={colors.primary} />}<Text style={{ color: colors.primary, fontSize: 13 }}>高级设置</Text></Pressable>
    {advanced ? <><Pressable onPress={() => setExtras(!extras)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.subtext, fontSize: 12 }}>{extras ? '收起其他参数' : '其他参数'}</Text></Pressable>{extras ? <View pointerEvents={disabled ? 'none' : 'auto'}><StructuredForm value={extra} onChange={next => {
      const merged = { ...value };
      for (const [key, previous] of Object.entries(extra)) {
        if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
          const retained = { ...record(value[key]) };
          for (const child of Object.keys(record(previous))) delete retained[child];
          merged[key] = retained;
        } else delete merged[key];
      }
      for (const [key, v] of Object.entries(next)) merged[key] = v && typeof v === 'object' && !Array.isArray(v) ? { ...record(merged[key]), ...record(v) } : v;
      onChange(merged);
    }} /></View> : null}</> : null}
  </View>;
}
