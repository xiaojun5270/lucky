import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, ChevronUp, Container, FileText, Globe2, List, Pause, Pencil, Play, Plus, RefreshCw, RotateCw, Save, Settings2, ShieldCheck, Square, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, Page, Panel } from '@/src/components/lucky-ui';
import { StructuredDataView, StructuredForm } from '@/src/components/structured-form';
import { queryClient } from '@/src/lib/query-client';
import { useAppTheme } from '@/src/lib/theme';
import { getServiceDetail, getServiceItems, getServiceLogs, runServiceAction, setServiceEnabled } from '@/src/services/lucky';
import { createDdnsTask, deleteDdnsTask, getDdnsConfigure, getDdnsTask, updateDdnsConfigure, updateDdnsTask } from '@/src/services/ddns';
import { createSslCertificate, deleteSslCertificate, getSslCertificate, getSslSetting, updateSslCertificate, updateSslSetting } from '@/src/services/ssl';
import type { LuckyListItem, LuckyRecord, LuckyServiceKind } from '@/src/types/lucky';

const config = {
  webservice: { title: '反向代理', subtitle: '域名、监听与后端规则', icon: Globe2 },
  ddns: { title: '动态域名', subtitle: 'DDNS 任务状态与同步', icon: RefreshCw },
  docker: { title: 'Docker 容器', subtitle: '容器运行状态与控制', icon: Container },
  ssl: { title: 'SSL 证书', subtitle: '证书有效期与同步状态', icon: ShieldCheck },
} as const;

function pick(item: LuckyRecord, keys: string[], fallback = '--') {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(String).join(', ');
  }
  return fallback;
}

function itemKey(item: LuckyListItem, index: number) {
  return pick(item, ['Key', 'key', 'TaskKey', 'taskKey', 'DDNSTaskKey', 'ID', 'Id', 'id'], String(index));
}

function isEnabled(item: LuckyListItem) {
  const value: unknown = (item as LuckyRecord).Enable ?? (item as LuckyRecord).enable ?? (item as LuckyRecord).Enabled;
  return value !== false && value !== 0 && value !== 'false';
}

function detailValue(payload?: LuckyRecord) {
  if (!payload) return {};
  const nested = [payload.data, payload.rule, payload.task, payload.container, payload.ssl]
    .find((value) => value && typeof value === 'object' && !Array.isArray(value));
  return (nested ?? payload) as LuckyRecord;
}

function editableValue(payload: LuckyRecord) {
  const value = { ...detailValue(payload) };
  delete value.ret;
  delete value.msg;
  return value;
}

function childRecord(item: LuckyRecord, key: string) {
  const value = item[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LuckyRecord : {};
}

function sslSummary(item: LuckyRecord) {
  const certs = childRecord(item, 'CertsInfo');
  const ext = childRecord(item, 'ExtParams');
  const domains = Array.isArray(certs.Domains)
    ? certs.Domains.map(String)
    : Array.isArray(ext.acmeDomains)
      ? ext.acmeDomains.map(String)
      : [];
  const type = pick(item, ['AddFrom', 'Type'], 'file');
  const expiry = pick(certs, ['NotAfterTime', 'NotAfter', 'ExpireTime'], pick(item, ['ExpireTime', 'UpdateTime']));
  return [type.toUpperCase(), domains.join(', '), expiry ? `到期 ${expiry}` : ''].filter(Boolean).join(' · ');
}

type ServiceEditor = { type: 'item' | 'settings'; title: string; value: LuckyRecord; key?: string };

function ServiceFormEditor({ editor, busy, close, save }: { editor: ServiceEditor; busy: boolean; close: () => void; save: (value: LuckyRecord) => void }) {
  const colors = useAppTheme();
  const [value, setValue] = useState(() => JSON.parse(JSON.stringify(editor.value)) as LuckyRecord);
  return <Modal transparent animationType="slide" onRequestClose={close}>
    <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.38)', justifyContent: 'flex-end' }}>
      <View style={{ minHeight: '58%', maxHeight: '88%', backgroundColor: colors.card, borderTopLeftRadius: 8, borderTopRightRadius: 8, padding: 18, gap: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Settings2 color={colors.primary} size={19} /><Text style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '800' }}>{editor.title}</Text><Pressable onPress={close}><Text style={{ color: colors.primary, fontWeight: '700' }}>取消</Text></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 4 }} style={{ flex: 1 }}><StructuredForm value={value} onChange={setValue} /></ScrollView>
        <Pressable disabled={busy} onPress={() => save(value)} style={{ height: 48, borderRadius: 8, backgroundColor: busy ? colors.disabled : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Save color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? '保存中' : '保存'}</Text></Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

export default function ServiceDetailScreen() {
  const colors = useAppTheme();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = (params.kind && params.kind in config ? params.kind : 'webservice') as LuckyServiceKind;
  const meta = config[kind];
  const [view, setView] = useState<'list' | 'logs'>('list');
  const [selectedKey, setSelectedKey] = useState('');
  const [logKey, setLogKey] = useState<string>();
  const [ddnsEditor, setDdnsEditor] = useState<ServiceEditor>();
  const [sslEditor, setSslEditor] = useState<ServiceEditor>();
  const logsEnabled = view === 'logs';
  const query = useQuery({ queryKey: ['lucky', 'service', kind], queryFn: () => getServiceItems(kind) });
  const detailQuery = useQuery({
    queryKey: ['lucky', 'service', kind, 'detail', selectedKey],
    queryFn: () => getServiceDetail(kind, selectedKey),
    enabled: Boolean(selectedKey),
  });
  const logsQuery = useQuery({
    queryKey: ['lucky', 'service', kind, 'logs', logKey],
    queryFn: () => getServiceLogs(kind, logKey),
    enabled: logsEnabled,
  });
  const mutation = useMutation({
    mutationFn: (input: { key: string; action?: string; enabled?: boolean }) => input.action
      ? runServiceAction(kind, input.key, input.action)
      : setServiceEnabled(kind, input.key, Boolean(input.enabled)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', kind] });
      if (selectedKey) await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', kind, 'detail', selectedKey] });
    },
  });
  const ddnsMutation = useMutation({
    mutationFn: async ({ editor, value }: { editor: ServiceEditor; value: LuckyRecord }) => {
      if (editor.type === 'settings') return updateDdnsConfigure(value);
      return editor.key ? updateDdnsTask(editor.key, value) : createDdnsTask(value);
    },
    onSuccess: async () => {
      setDdnsEditor(undefined);
      await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ddns'] });
    },
  });
  const sslMutation = useMutation({
    mutationFn: async ({ editor, value }: { editor: ServiceEditor; value: LuckyRecord }) => {
      if (editor.type === 'settings') return updateSslSetting(value);
      return editor.key ? updateSslCertificate(value) : createSslCertificate(value);
    },
    onSuccess: async () => {
      setSslEditor(undefined);
      await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ssl'] });
    },
  });

  async function editDdnsTask(key: string) {
    try {
      const payload = await getDdnsTask(key);
      setDdnsEditor({ type: 'item', title: '编辑 DDNS 任务', key, value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 DDNS 任务');
    }
  }

  async function editDdnsConfigure() {
    try {
      const payload = await getDdnsConfigure();
      setDdnsEditor({ type: 'settings', title: 'DDNS 模块设置', value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 DDNS 设置');
    }
  }

  function removeDdnsTask(key: string, name: string) {
    Alert.alert('确认删除', `确定删除 DDNS 任务“${name}”吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { try { await deleteDdnsTask(key); await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ddns'] }); } catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : '请求失败'); } } },
    ]);
  }

  async function editSslCertificate(key: string) {
    try {
      const payload = await getSslCertificate(key);
      setSslEditor({ type: 'item', title: '编辑 SSL 证书', key, value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 SSL 证书');
    }
  }

  async function editSslSetting() {
    try {
      const payload = await getSslSetting();
      setSslEditor({ type: 'settings', title: 'SSL 模块设置', value: editableValue(payload) });
    } catch (error) {
      Alert.alert('读取失败', error instanceof Error ? error.message : '无法读取 SSL 设置');
    }
  }

  function removeSslCertificate(key: string, name: string) {
    Alert.alert('确认删除', `确定删除 SSL 证书“${name}”吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => { try { await deleteSslCertificate(key); await queryClient.invalidateQueries({ queryKey: ['lucky', 'service', 'ssl'] }); } catch (error) { Alert.alert('删除失败', error instanceof Error ? error.message : '请求失败'); } } },
    ]);
  }

  function confirmAction(key: string, action: string, label: string) {
    Alert.alert(`确认${label}`, `该操作会修改 ${meta.title} 的运行状态，是否继续？`, [
      { text: '取消', style: 'cancel' },
      { text: '继续', style: 'destructive', onPress: () => mutation.mutate({ key, action }) },
    ]);
  }

  function confirmEnabled(key: string, enabled: boolean) {
    const label = enabled ? '启用' : '停用';
    Alert.alert(`确认${label}`, `是否${label}这项${meta.title}配置？`, [
      { text: '取消', style: 'cancel' },
      { text: label, style: enabled ? 'default' : 'destructive', onPress: () => mutation.mutate({ key, enabled }) },
    ]);
  }

  function showLogs(key?: string) {
    setLogKey(key);
    setView('logs');
  }

  return <Page title={meta.title} subtitle={meta.subtitle} icon={meta.icon} safeTop={false} refreshing={query.isFetching || logsQuery.isFetching} onRefresh={() => view === 'logs' && logsEnabled ? logsQuery.refetch() : query.refetch()}>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {([['list', '列表', List], ['logs', '日志', FileText]] as const).map(([value, label, Icon]) => <Pressable key={value} onPress={() => { setView(value); if (value === 'logs') setLogKey(undefined); }} style={{ flex: 1, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: view === value ? colors.primary : colors.card, borderWidth: 1, borderColor: view === value ? colors.primary : colors.border }}><Icon color={view === value ? '#fff' : colors.text} size={16} /><Text style={{ color: view === value ? '#fff' : colors.text, fontWeight: '700' }}>{label}</Text></Pressable>)}
    </View>
    {mutation.error ? <ErrorState message={mutation.error.message} /> : null}
    {ddnsMutation.error ? <ErrorState message={ddnsMutation.error.message} /> : null}
    {sslMutation.error ? <ErrorState message={sslMutation.error.message} /> : null}

    {view === 'logs' ? <>
      {logKey ? <Pressable onPress={() => setLogKey(undefined)}><Text style={{ color: colors.primary, fontWeight: '700' }}>查看模块日志</Text></Pressable> : null}
      {logsEnabled && logsQuery.error ? <ErrorState message={logsQuery.error.message} retry={() => logsQuery.refetch()} /> : null}
      {logsEnabled && logsQuery.data?.lines.length ? <Panel>{logsQuery.data.lines.map((line, index) => <Text key={`${index}-${line.slice(0, 16)}`} selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 18 }}>{line}</Text>)}</Panel> : logsEnabled && !logsQuery.isLoading && !logsQuery.error ? <EmptyState message="暂无日志" /> : null}
    </> : <>
      {query.error ? <ErrorState message={query.error.message} retry={() => query.refetch()} /> : null}
      {kind === 'ddns' ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setDdnsEditor({ type: 'item', title: '添加 DDNS 任务', value: { TaskName: '', Enable: true, Records: [] } })} style={{ flex: 1, height: 42, borderRadius: 8, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>添加任务</Text></Pressable>
        <Pressable onPress={editDdnsConfigure} style={{ flex: 1, height: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Settings2 color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>模块设置</Text></Pressable>
      </View> : null}
      {kind === 'ssl' ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setSslEditor({ type: 'item', title: '添加 SSL 证书', value: { Remark: '', AddFrom: 'file', Enable: true, CertFile: '', KeyFile: '', ExtParams: {} } })} style={{ flex: 1, height: 42, borderRadius: 8, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>添加证书</Text></Pressable>
        <Pressable onPress={editSslSetting} style={{ flex: 1, height: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Settings2 color={colors.primary} size={16} /><Text style={{ color: colors.primary, fontWeight: '800' }}>模块设置</Text></Pressable>
      </View> : null}
      {query.data?.items.length ? query.data.items.map((item, index) => {
        const key = itemKey(item, index);
        const expanded = selectedKey === key;
        const name = pick(item, kind === 'ssl' ? ['Remark', 'remark', 'Name', 'name'] : ['Name', 'name', 'TaskName', 'taskName', 'DDNSTaskName', 'Names', 'Domain', 'Domains'], `项目 ${index + 1}`);
        const status = Boolean(item.ACMEing) ? '签发中' : pick(item, ['Status', 'status', 'State', 'state', 'LastResult'], isEnabled(item) ? '正常' : '已停用');
        const detail = kind === 'docker' ? pick(item, ['Image', 'image', 'ImageName']) : kind === 'ssl' ? sslSummary(item) : kind === 'ddns' ? pick(item, ['Domain', 'Domains', 'DNSProvider', 'Provider', 'LastRun', 'LastSyncTime']) : pick(item, ['BackendURL', 'ProxyURL', 'Listen', 'Domains']);
        return <Panel key={key}>
          <Pressable onPress={() => setSelectedKey(expanded ? '' : key)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{name}</Text><Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 12, marginTop: 5 }}>{detail}</Text></View>
            <View style={{ alignItems: 'flex-end', gap: 8 }}><Text style={{ color: /run|正常|success|active|up/i.test(status) ? colors.success : colors.subtext, fontSize: 12 }}>{status}</Text>{expanded ? <ChevronUp color={colors.subtext} size={17} /> : <ChevronDown color={colors.subtext} size={17} />}</View>
          </Pressable>
          {kind === 'ddns' || kind === 'ssl' ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: colors.text, fontSize: 13 }}>启用</Text><Switch value={isEnabled(item)} disabled={mutation.isPending} onValueChange={(value) => confirmEnabled(key, value)} trackColor={{ false: colors.disabled, true: colors.primary }} /></View> : null}
          {kind === 'docker' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[
            ['start', '启动', Play], ['stop', '停止', Square], ['restart', '重启', RotateCw], ['pause', '暂停', Pause], ['unpause', '恢复', Play],
          ].map(([action, label, Icon]) => <Pressable key={String(action)} disabled={mutation.isPending} onPress={() => confirmAction(key, String(action), String(label))} style={{ width: '31%', minWidth: 82, height: 38, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Icon color={colors.text} size={15} /><Text style={{ color: colors.text, fontSize: 12 }}>{String(label)}</Text></Pressable>)}</View> : kind === 'ddns' ? <View style={{ flexDirection: 'row', gap: 7 }}>
            <Pressable disabled={mutation.isPending} onPress={() => confirmAction(key, 'sync', '手动同步')} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><RefreshCw color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>同步</Text></Pressable>
            <Pressable onPress={() => editDdnsTask(key)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Pencil color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>编辑</Text></Pressable>
            <Pressable onPress={() => removeDdnsTask(key, name)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Trash2 color={colors.danger} size={15} /><Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>删除</Text></Pressable>
          </View> : kind === 'ssl' ? <View style={{ flexDirection: 'row', gap: 7 }}>
            <Pressable disabled={mutation.isPending} onPress={() => confirmAction(key, 'sync', '手动同步')} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><RefreshCw color="#fff" size={15} /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>同步</Text></Pressable>
            <Pressable onPress={() => editSslCertificate(key)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Pencil color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>编辑</Text></Pressable>
            <Pressable onPress={() => removeSslCertificate(key, name)} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }}><Trash2 color={colors.danger} size={15} /><Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>删除</Text></Pressable>
          </View> : null}
          {kind === 'docker' || kind === 'ssl' ? <Pressable onPress={() => showLogs(key)} style={{ height: 38, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}><FileText color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>查看日志</Text></Pressable> : null}
          {expanded ? <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 8 }}>
            {detailQuery.error ? <ErrorState message={detailQuery.error.message} retry={() => detailQuery.refetch()} /> : null}
            {detailQuery.data ? <StructuredDataView value={detailValue(detailQuery.data)} /> : null}
          </View> : null}
        </Panel>;
      }) : !query.isLoading && !query.error ? <EmptyState message="接口未返回列表数据" /> : null}
    </>}
    {ddnsEditor ? <ServiceFormEditor key={`${ddnsEditor.type}-${ddnsEditor.key ?? 'new'}`} editor={ddnsEditor} busy={ddnsMutation.isPending} close={() => setDdnsEditor(undefined)} save={(value) => ddnsMutation.mutate({ editor: ddnsEditor, value })} /> : null}
    {sslEditor ? <ServiceFormEditor key={`${sslEditor.type}-${sslEditor.key ?? 'new'}`} editor={sslEditor} busy={sslMutation.isPending} close={() => setSslEditor(undefined)} save={(value) => sslMutation.mutate({ editor: sslEditor, value })} /> : null}
  </Page>;
}
