import { useMutation, useQuery } from '@tanstack/react-query';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { Activity, ArrowDown, ArrowUp, Cloud, Copy, FileText, Globe2, Network, Pencil, Plus, RefreshCw, Save, Settings2, Trash2, Webhook, X, type LucideIcon } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { EmptyState, ErrorState, FullScreenSafeArea, IconTile, Page, PageHeader, Panel, SearchField } from '@/src/components/lucky-ui';
import { StructuredDataView } from '@/src/components/structured-form';
import { TunnelForm, tunnelDefaults, validateTunnelForm, type TunnelFormType } from '@/src/components/tunnel-form';
import { useAppTheme } from '@/src/lib/theme';
import { queryClient } from '@/src/lib/query-client';
import { luckySessionState } from '@/src/store/lucky-session';
import { cloudflareDns, deleteTunnel, deleteTunnelChild, enableTunnel, getFrpStatus, getStunSettings, getTunnel, getTunnelLogs, getTunnelLastLogs, isTunnelKind, listTunnelChildren, listTunnels, record, reorderTunnels, saveStunSettings, saveTunnel, saveTunnelChild, testStunWebhook, tunnelLogLines, tunnelTitles, type TunnelCollection, type TunnelKind } from '@/src/services/tunnels';
import type { LuckyRecord } from '@/src/types/lucky';

const icons: Record<TunnelKind, LucideIcon> = { stun: Network, cloudflared: Cloud, frp: Globe2 };
const collectionTitles: Record<TunnelCollection, string> = { ingress: '域名路由', proxies: '代理规则', visitors: '访问者' };
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const itemKey = (item: LuckyRecord) => text(item.Key);
const itemName = (item: LuckyRecord) => text(item.Name ?? item.Remark ?? item.name) || '未命名';
const enabled = (item: LuckyRecord) => item.Enable === true || item.Enable === 1 || item.Enable === 'true';

function Action({ icon: Icon, label, onPress, disabled, danger = false }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const colors = useAppTheme();
  const color = danger ? colors.danger : colors.primary;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexBasis: 105, minHeight: 42, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: danger ? colors.dangerBg : colors.primarySoft, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, opacity: disabled ? 0.4 : pressed ? 0.6 : 1 })}><Icon size={16} color={color} /><Text style={{ color, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>{label}</Text></Pressable>;
}
function ScreenModal({ title, close, children, footer, busy = false }: { title: string; close: () => void; children: ReactNode; footer?: ReactNode; busy?: boolean }) {
  const colors = useAppTheme();
  return <Modal presentationStyle="fullScreen" animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (!busy) close(); }}>
    <FullScreenSafeArea style={{ flex: 1, backgroundColor: colors.page }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1, width: '100%', maxWidth: 820, alignSelf: 'center', padding: 16, gap: 12 }}>
        <View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text><Pressable disabled={busy} accessibilityLabel="关闭" onPress={close} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.mutedCard, justifyContent: 'center', alignItems: 'center' }}><X size={20} color={colors.subtext} /></Pressable></View>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>{children}</ScrollView>
        {footer}
      </View>
    </KeyboardAvoidingView></FullScreenSafeArea>
  </Modal>;
}

type Editor = { title: string; type: TunnelFormType; value: LuckyRecord; previous?: LuckyRecord; parent?: LuckyRecord; editing: boolean };
function EditorModal({ editor, save, close }: { editor: Editor; save: (value: LuckyRecord) => Promise<unknown>; close: () => void }) {
  const colors = useAppTheme();
  const [value, setValue] = useState(() => JSON.parse(JSON.stringify(editor.value)) as LuckyRecord);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const mutation = useMutation({ mutationFn: async () => { setError(''); return save(validateTunnelForm(editor.type, value)); }, onSuccess: close, onError: e => setError(e.message) });
  const webhook = useMutation({ mutationFn: () => {
    if (!text(value.WebhookURL).trim()) throw new Error('请先填写 Webhook 地址');
    const candidate = validateTunnelForm(editor.type, value);
    return testStunWebhook(text(value.Key), Object.fromEntries(Object.entries(candidate).filter(([key]) => key.startsWith('Webhook') || key === 'RetryCount' || key === 'RetryInterval')));
  }, onSuccess: data => { setError(''); setResult(text(data.Response) || text(data.msg) || 'Webhook 请求成功'); }, onError: e => setError(e.message) });
  const busy = mutation.isPending || webhook.isPending;
  return <ScreenModal title={editor.title} close={close} busy={busy} footer={<Pressable disabled={busy} onPress={() => mutation.mutate()} style={{ height: 48, borderRadius: 12, backgroundColor: busy ? colors.disabled : colors.primary, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>{busy ? <ActivityIndicator color="#fff" /> : <Save size={17} color="#fff" />}<Text style={{ color: '#fff', fontWeight: '700' }}>{mutation.isPending ? '保存中' : editor.type === 'stun' && !editor.editing ? '创建并启用' : '保存'}</Text></Pressable>}>
    {error ? <ErrorState message={error} /> : null}
    <TunnelForm type={editor.type} value={value} onChange={setValue} disabled={busy} />
    {(editor.type === 'stun' || editor.type === 'stun-settings') ? <Action icon={Webhook} label="测试 Webhook" disabled={busy} onPress={() => webhook.mutate()} /> : null}
    {result ? <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{result}</Text> : null}
  </ScreenModal>;
}
type Detail = { mode: 'logs' | 'status' | TunnelCollection; item: LuckyRecord };

function NatDetector({ close }: { close: () => void }) {
  const colors = useAppTheme();
  const [server, setServer] = useState('stun.miwifi.com:3478');
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function stop() { clearTimeout(timerRef.current); const socket = socketRef.current; socketRef.current = null; socket?.close(); setBusy(false); }
  useEffect(() => () => { clearTimeout(timerRef.current); const socket = socketRef.current; socketRef.current = null; socket?.close(); }, []);
  function start() {
    stop(); setLines([]);
    if (!server.trim()) { setLines(['请填写 STUN 服务器']); return; }
    try {
      const url = new URL(`${luckySessionState.baseUrl.replace(/\/+$/, '')}/api/natdetect/ws`);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('Lucky-Admin-Token', luckySessionState.token);
      url.searchParams.set('server', server.trim()); url.searchParams.set('_', String(Date.now()));
      setBusy(true);
      const socket = new WebSocket(url.toString()); socketRef.current = socket;
      socket.onmessage = event => {
        if (socketRef.current !== socket) return;
        try { const data = JSON.parse(String(event.data)); setLines(current => [...current, text(data.log ?? data.result ?? data.error)].filter(Boolean).slice(-200)); if (data.result || data.error) stop(); }
        catch { setLines(current => [...current, String(event.data)].slice(-200)); }
      };
      socket.onerror = () => { if (socketRef.current === socket) { setLines(current => [...current, '检测连接失败，请检查服务端连接']); stop(); } };
      socket.onclose = () => { if (socketRef.current === socket) stop(); };
      timerRef.current = setTimeout(() => { setLines(current => [...current, '检测超时']); stop(); }, 60000);
    } catch (e) { setLines([e instanceof Error ? e.message : '无法启动检测']); stop(); }
  }
  return <ScreenModal title="NAT 类型检测" close={() => { stop(); close(); }}><TextInput accessibilityLabel="STUN 服务器" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} editable={!busy} style={{ minHeight: 46, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, color: colors.text }} /><Action icon={Network} label={busy ? '停止检测' : '开始检测'} onPress={busy ? stop : start} />{lines.map((line, index) => <Text key={index} selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{line}</Text>)}</ScreenModal>;
}

function TunnelScreen({ kind }: { kind: TunnelKind }) {
  const colors = useAppTheme();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor>();
  const [natOpen, setNatOpen] = useState(false);
  const [detail, setDetail] = useState<Detail>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [dnsResult, setDnsResult] = useState<LuckyRecord>();
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => { const subscription = AppState.addEventListener('change', state => setForeground(state === 'active')); return () => { subscription.remove(); requestRef.current?.abort(); }; }, []);
  const active = focused && foreground;
  const list = useQuery({ queryKey: ['tunnels', kind, 'list'], queryFn: ({ signal }) => listTunnels(kind, signal), enabled: active, refetchInterval: active && !editor ? 5000 : false, refetchIntervalInBackground: false });
  const details = useQuery({
    queryKey: ['tunnels', kind, detail?.mode, itemKey(detail?.item ?? {}), page],
    queryFn: async ({ signal }) => {
      if (!detail) return {};
      const key = itemKey(detail.item);
      if (detail.mode === 'logs') return page === 0 && key ? getTunnelLastLogs(kind, key, signal) : getTunnelLogs(kind, key, page, signal);
      if (detail.mode === 'status') return getFrpStatus(key, signal);
      if (kind === 'stun') throw new Error('STUN 不支持此操作');
      return { items: await listTunnelChildren(kind, key, detail.mode, signal) };
    },
    enabled: active && Boolean(detail) && !editor,
    refetchInterval: active && detail && !editor && ((detail.mode === 'logs' && page <= 1) || detail.mode === 'status') ? 5000 : false,
    refetchIntervalInBackground: false,
  });
  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ['tunnels', kind] });
  }
  const operation = useMutation({ mutationFn: (run: () => Promise<unknown>) => run(), onMutate: () => { setError(''); setNotice(''); }, onSuccess: async () => { setNotice('操作已完成'); await invalidate(); }, onError: e => setError(e.message) });
  const busy = operation.isPending || loadingEditor;
  const all = list.data?.items ?? [];
  const items = all.filter(item => [item.Name, item.Remark, item.Type, item.StunType, item.PublicAddr].map(text).join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  function confirm(title: string, run: () => Promise<unknown>) {
    Alert.alert(title, '此操作将修改服务器配置。', [{ text: '取消', style: 'cancel' }, { text: '确认', style: 'destructive', onPress: () => operation.mutate(run) }]);
  }
  function openDetail(mode: Detail['mode'], item: LuckyRecord) { setError(''); setDnsResult(undefined); setPage(mode === 'logs' && itemKey(item) ? 0 : 1); setDetail({ mode, item }); }
  async function openEditor(item?: LuckyRecord, settings = false) {
    if (busy) return;
    setError('');
    if (!item && !settings) { setEditor({ title: `新增${tunnelTitles[kind]}`, type: kind, value: tunnelDefaults(kind), editing: false }); return; }
    const controller = new AbortController();
    requestRef.current?.abort(); requestRef.current = controller; setLoadingEditor(true);
    try {
      const value = settings ? await getStunSettings(controller.signal) : await getTunnel(kind, itemKey(item!), controller.signal);
      if (!controller.signal.aborted) setEditor({ title: settings ? 'STUN 全局设置' : `编辑 ${itemName(item!)}`, type: settings ? 'stun-settings' : kind, value, editing: true });
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '读取配置失败'); }
    finally { if (requestRef.current === controller) { requestRef.current = null; setLoadingEditor(false); } }
  }
  function move(item: LuckyRecord, direction: number) {
    const index = all.findIndex(row => itemKey(row) === itemKey(item));
    const target = index + direction;
    if (index < 0 || target < 0 || target >= all.length) return;
    const keys = all.map(itemKey);
    if (keys.some(key => !key)) { setError('列表中缺少规则标识，无法排序'); return; }
    [keys[index], keys[target]] = [keys[target], keys[index]];
    operation.mutate(() => reorderTunnels(kind, keys));
  }
  async function save(value: LuckyRecord) {
    if (!editor) return;
    if (editor.type === 'stun-settings') await saveStunSettings(value);
    else if (editor.type === 'ingress' || editor.type === 'proxies' || editor.type === 'visitors') {
      if (kind === 'stun') throw new Error('操作类型无效');
      await saveTunnelChild(kind, itemKey(editor.parent!), editor.type, value, editor.previous);
    } else {
      const cleaned = { ...value };
      // Runtime-only FRP aliases must not override the editable arrays.
      if (kind === 'frp') { delete cleaned.proxies; delete cleaned.visitors; }
      await saveTunnel(kind, cleaned, editor.editing);
    }
    setNotice('配置已保存');
    void invalidate();
  }
  const detailItems = Array.isArray(details.data?.items) ? details.data.items as LuckyRecord[] : [];
  const logLines = tunnelLogLines(details.data);
  const isCollection = detail && ['ingress', 'proxies', 'visitors'].includes(detail.mode);
  return <Page title={tunnelTitles[kind]} safeTop={false} scrollable={false} showHeader={false}>
    <FlatList data={items} keyExtractor={(item, index) => itemKey(item) || `missing-${index}`} initialNumToRender={8} windowSize={7} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
      ListHeaderComponent={<View style={{ gap: 14 }}>
        <PageHeader title={tunnelTitles[kind]} icon={icons[kind]} refreshing={list.isFetching} onRefresh={() => { void list.refetch(); }} />
        {error ? <ErrorState message={error} /> : null}{list.error ? <ErrorState message={list.error.message} retry={() => { void list.refetch(); }} /> : null}
        {notice ? <Text style={{ color: colors.success, fontSize: 12 }}>{notice}</Text> : null}
        {kind === 'stun' && list.data?.raw.ModuleEnable === false ? <Text style={{ color: colors.warning, fontSize: 13 }}>STUN 模块未启用</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Action icon={Plus} label="新增" disabled={busy} onPress={() => { void openEditor(); }} />
          {kind === 'stun' ? <Action icon={Settings2} label="全局设置" disabled={busy} onPress={() => { void openEditor(undefined, true); }} /> : <Action icon={FileText} label="模块日志" disabled={busy} onPress={() => openDetail('logs', {})} />}
          {kind === 'stun' ? <Action icon={Network} label="NAT 检测" disabled={busy} onPress={() => setNatOpen(true)} /> : null}
        </View><SearchField value={search} onChangeText={setSearch} placeholder="搜索名称、类型或公网地址" />
        {loadingEditor ? <ActivityIndicator color={colors.primary} /> : null}
      </View>}
      ListEmptyComponent={list.isLoading ? <ActivityIndicator color={colors.primary} /> : !list.error ? <EmptyState message={search ? '没有匹配的规则' : '暂无规则'} icon={icons[kind]} /> : null}
      renderItem={({ item }) => {
        const key = itemKey(item); const index = all.findIndex(row => itemKey(row) === key); const params = record(item.Params);
        const state = typeof item.Running === 'boolean' ? (item.Running ? '运行中' : '未运行') : text(item.Status ?? item.State) || (enabled(item) ? '已启用' : '已停用');
        const summary = kind === 'stun' ? `${text(item.ListenIP) || '自动监听'}:${text(item.ListenPort) || '自动'} → ${Array.isArray(item.TargetAddressList) ? item.TargetAddressList.join(', ') : ''}:${text(item.TargetPort)}` : kind === 'frp' ? `${text(item.Type) === 'server' ? '服务端' : '客户端'} · ${text(params.ServerAddr ?? params.BindAddr)}:${text(params.ServerPort ?? params.BindPort)}` : text(item.Type) === 'access' ? `Access · ${text(params.Hostname)}` : 'Cloudflare Tunnel';
        return <Panel><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon={icons[kind]} /><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{itemName(item)}</Text><Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{text(item.StunType)} {state}</Text></View><Switch accessibilityLabel={`启用 ${itemName(item)}`} value={enabled(item)} disabled={busy || !key} onValueChange={value => operation.mutate(() => enableTunnel(kind, key, value))} /></View>
          <Text selectable style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{summary}</Text>
          {kind === 'stun' ? <Text selectable style={{ color: item.PublicAddr ? colors.success : colors.subtext, fontSize: 13 }}>公网地址：{text(item.PublicAddr) || '等待穿透'}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><Action icon={Pencil} label="编辑" disabled={busy || !key} onPress={() => { void openEditor(item); }} /><Action icon={FileText} label="日志" disabled={busy || !key} onPress={() => openDetail('logs', item)} />
            {kind === 'cloudflared' && item.Type === 'tunnel' ? <Action icon={Globe2} label="域名路由" disabled={busy || !key} onPress={() => openDetail('ingress', item)} /> : null}
            {kind === 'frp' ? <><Action icon={Activity} label="运行详情" disabled={busy || !key} onPress={() => openDetail('status', item)} />{item.Type === 'client' ? <><Action icon={Network} label="代理规则" disabled={busy || !key} onPress={() => openDetail('proxies', item)} /><Action icon={Globe2} label="访问者" disabled={busy || !key} onPress={() => openDetail('visitors', item)} /></> : null}</> : null}
            {kind === 'stun' && item.PublicAddr ? <Action icon={Copy} label="复制地址" onPress={() => operation.mutate(() => Clipboard.setStringAsync(text(item.PublicAddr)))} /> : null}
            <Action icon={ArrowUp} label="上移" disabled={busy || !key || index <= 0} onPress={() => move(item, -1)} /><Action icon={ArrowDown} label="下移" disabled={busy || !key || index === all.length - 1} onPress={() => move(item, 1)} /><Action icon={Trash2} label="删除" danger disabled={busy || !key} onPress={() => confirm(`删除 ${itemName(item)}？`, () => deleteTunnel(kind, key))} />
          </View>
        </Panel>;
      }} />
    {natOpen ? <NatDetector close={() => setNatOpen(false)} /> : editor ? <EditorModal editor={editor} save={save} close={() => setEditor(undefined)} /> : detail ? <ScreenModal title={`${detail.mode === 'logs' ? '日志' : detail.mode === 'status' ? '运行详情' : collectionTitles[detail.mode]} · ${itemKey(detail.item) ? itemName(detail.item) : tunnelTitles[kind]}`} close={() => { setDetail(undefined); setError(''); }} busy={operation.isPending}>
      {error ? <ErrorState message={error} /> : null}{details.error ? <ErrorState message={details.error.message} retry={() => { void details.refetch(); }} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Action icon={RefreshCw} label="刷新" disabled={details.isFetching} onPress={() => { void details.refetch(); }} />{isCollection ? <Action icon={Plus} label="新增规则" disabled={operation.isPending} onPress={() => setEditor({ title: `新增${collectionTitles[detail.mode as TunnelCollection]}`, type: detail.mode as TunnelCollection, value: tunnelDefaults(detail.mode as TunnelCollection), parent: detail.item, editing: false })} /> : null}</View>
      {details.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
      {detail.mode === 'logs' ? <>
        {!logLines.length && !details.isLoading && !details.error ? <EmptyState message="暂无日志" icon={FileText} /> : logLines.map((line, index) => <Text key={index} selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{line}</Text>)}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Action icon={ArrowUp} label={page === 1 && itemKey(detail.item) ? '最新日志' : '上一页'} disabled={page <= (itemKey(detail.item) ? 0 : 1) || details.isFetching} onPress={() => setPage(page - 1)} /><Text style={{ color: colors.subtext }}>{page === 0 ? '实时' : page}</Text><Action icon={ArrowDown} label={page === 0 ? '历史日志' : '下一页'} disabled={details.isFetching || (page > 0 && logLines.length < 100)} onPress={() => setPage(page + 1)} /></View>
      </> : detail.mode === 'status' ? <StructuredDataView value={record(details.data).status ?? record(details.data).data ?? {}} /> : <>
        {!detailItems.length && !details.isLoading && !details.error ? <EmptyState message="暂无规则" icon={Network} /> : null}
        {detailItems.map((child, index) => <Panel key={`${text(child.name ?? child.hostname)}:${text(child.path)}:${index}`}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{text(child.name ?? child.hostname) || '默认路由'}</Text>
          <Text selectable style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>{detail.mode === 'ingress' ? `${text(child.path) || '/'} → ${text(child.service)}` : detail.mode === 'proxies' ? `${text(child.type).toUpperCase()} · ${text(child.localIP)}:${text(child.localPort)} → ${text(child.remotePort) || text(child.serverName) || '域名代理'}` : `${text(child.type).toUpperCase()} · ${text(child.bindAddr)}:${text(child.bindPort)} → ${text(child.serverName)}`}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><Action icon={Pencil} label="编辑" disabled={operation.isPending} onPress={() => setEditor({ title: '编辑规则', type: detail.mode as TunnelCollection, value: { ...tunnelDefaults(detail.mode as TunnelCollection), ...child }, previous: child, parent: detail.item, editing: true })} />
            {detail.mode !== 'ingress' ? <Action icon={RefreshCw} label={child.disabled ? '启用' : '停用'} disabled={operation.isPending} onPress={() => operation.mutate(() => saveTunnelChild('frp', itemKey(detail.item), detail.mode as TunnelCollection, { ...child, disabled: !child.disabled }, child))} /> : null}
            <Action icon={Trash2} label="删除" danger disabled={operation.isPending} onPress={() => confirm('删除此规则？', () => deleteTunnelChild(kind as 'frp' | 'cloudflared', itemKey(detail.item), detail.mode as TunnelCollection, child))} />
            {detail.mode === 'ingress' && child.hostname ? <><Action icon={Globe2} label="检测 DNS" disabled={operation.isPending} onPress={() => operation.mutate(async () => { setDnsResult(await cloudflareDns(itemKey(detail.item), text(child.hostname), 'check')); })} /><Action icon={Plus} label="创建 DNS" disabled={operation.isPending} onPress={() => confirm(`创建 ${text(child.hostname)} 的 CNAME？`, () => cloudflareDns(itemKey(detail.item), text(child.hostname), 'create'))} /><Action icon={Trash2} label="删除 DNS" danger disabled={operation.isPending} onPress={() => confirm(`删除 ${text(child.hostname)} 的 CNAME？`, () => cloudflareDns(itemKey(detail.item), text(child.hostname), 'delete'))} /></> : null}
          </View>
        </Panel>)}{dnsResult ? <StructuredDataView value={dnsResult.status ?? dnsResult} /> : null}
      </>}
    </ScreenModal> : null}
  </Page>;
}
export default function TunnelRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  if (!isTunnelKind(kind)) return <Page title="内网穿透"><ErrorState message="不支持的穿透模块" /></Page>;
  return <TunnelScreen key={kind} kind={kind} />;
}
