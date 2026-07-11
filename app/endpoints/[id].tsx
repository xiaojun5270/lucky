import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Braces, CheckCircle2, Route, Send, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, Page, Panel, SectionHeader } from '@/src/components/lucky-ui';
import { useAppTheme } from '@/src/lib/theme';
import {
  callLuckyEndpoint,
  getLuckyEndpoint,
  isDangerousLuckyRequest,
  type LuckyEndpointResult,
} from '@/src/services/lucky-endpoints';
import type { LuckyHttpMethod, LuckyRecord } from '@/src/types/lucky';

function parseObject(value: string, label: string): LuckyRecord {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label}必须是 JSON 对象`);
  return parsed as LuckyRecord;
}

function parseBody(value: string) {
  if (!value.trim()) return undefined;
  return JSON.parse(value) as unknown;
}

function formatResult(result?: LuckyEndpointResult) {
  if (!result) return '';
  if (result.kind === 'empty') return `HTTP ${result.status}\n响应体为空`;
  if (result.kind === 'binary') return `HTTP ${result.status}\n二进制响应：${result.filename ?? '未命名文件'}\n${result.byteLength ?? 0} bytes\n${result.contentType || 'application/octet-stream'}`;
  if (result.kind === 'json') return JSON.stringify(result.data, null, 2);
  return String(result.data ?? '');
}

export default function EndpointRunnerScreen() {
  const colors = useAppTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const endpoint = useMemo(() => getLuckyEndpoint(params.id ?? ''), [params.id]);
  const [method, setMethod] = useState<LuckyHttpMethod>('GET');
  const [suffix, setSuffix] = useState('');
  const [queryText, setQueryText] = useState('{}');
  const [bodyText, setBodyText] = useState('{}');
  const [inputError, setInputError] = useState('');

  useEffect(() => {
    if (endpoint) setMethod(endpoint.methods[0]);
  }, [endpoint]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!endpoint) throw new Error('接口不存在');
      return callLuckyEndpoint({ endpoint, method, suffix, pathValues: { e: suffix }, query: parseObject(queryText, '查询参数'), body: ['GET'].includes(method) ? undefined : parseBody(bodyText) });
    },
  });

  if (!endpoint) return <Page title="接口不存在" icon={Braces}><EmptyState message="无法在接口清单中找到该端点" icon={Braces} /></Page>;
  const selectedEndpoint = endpoint;
  const dangerous = isDangerousLuckyRequest(selectedEndpoint, method);
  const inputStyle = { color: colors.text, backgroundColor: colors.mutedCard, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, fontFamily: 'monospace' as const, fontSize: 12 };

  function run() {
    setInputError('');
    try {
      parseObject(queryText, '查询参数');
      if (method !== 'GET') parseBody(bodyText);
      if (selectedEndpoint.pathVariables.length && !suffix.trim()) throw new Error(`请填写路径参数 ${selectedEndpoint.pathVariables.join(', ')}`);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : '参数格式错误');
      return;
    }
    if (dangerous) {
      Alert.alert('确认执行高风险接口', `${method} ${selectedEndpoint.path}\n\n该请求可能修改或删除系统、网络、证书或容器数据。`, [{ text: '取消', style: 'cancel' }, { text: '确认执行', style: 'destructive', onPress: () => mutation.mutate() }]);
      return;
    }
    mutation.mutate();
  }

  return <Page title="接口调试" subtitle={endpoint.module} icon={Braces}>
    <Panel><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}><Route color={colors.primary} size={18} /><Text selectable style={{ flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 20 }}>{endpoint.path}</Text></View><Text style={{ color: colors.subtext, fontSize: 11 }}>来源：{endpoint.source || '开发文档'}</Text></Panel>
    <SectionHeader icon={SlidersHorizontal} title="请求配置" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{endpoint.methods.map((item) => <Pressable key={item} onPress={() => setMethod(item)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: method === item ? colors.primary : colors.card, borderWidth: 1, borderColor: method === item ? colors.primary : colors.border }}><Text style={{ color: method === item ? '#fff' : colors.text, fontWeight: '800', fontSize: 12 }}>{item}</Text></Pressable>)}</View>
    {dangerous ? <View style={{ flexDirection: 'row', gap: 9, padding: 12, borderRadius: 8, backgroundColor: colors.dangerBg }}><AlertTriangle color={colors.danger} size={18} /><Text style={{ flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18 }}>高风险请求，执行前会再次确认。</Text></View> : null}
    {endpoint.requiresSuffix ? <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{endpoint.pathVariables.length ? `路径参数 ${endpoint.pathVariables.join(', ')}` : '资源 Key / 路径后缀'}</Text><TextInput value={suffix} onChangeText={setSuffix} placeholder="输入 ID、Key 或资源名称" placeholderTextColor={colors.placeholder} autoCapitalize="none" style={inputStyle} /></View> : null}
    <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>查询参数 JSON</Text><TextInput value={queryText} onChangeText={setQueryText} multiline autoCapitalize="none" autoCorrect={false} style={[inputStyle, { minHeight: 82, textAlignVertical: 'top' }]} /></View>
    {method !== 'GET' ? <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>请求体 JSON</Text><TextInput value={bodyText} onChangeText={setBodyText} multiline autoCapitalize="none" autoCorrect={false} style={[inputStyle, { minHeight: 130, textAlignVertical: 'top' }]} /></View> : null}
    {inputError ? <ErrorState message={inputError} /> : null}{mutation.error ? <ErrorState message={mutation.error.message} /> : null}
    <Pressable disabled={mutation.isPending} onPress={run} style={{ minHeight: 48, borderRadius: 8, backgroundColor: mutation.isPending ? colors.disabled : dangerous ? colors.danger : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}><Send color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{mutation.isPending ? '请求中…' : `执行 ${method}`}</Text></Pressable>
    {mutation.data ? <View style={{ gap: 10 }}><SectionHeader icon={CheckCircle2} title="响应" /><Panel><Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 11, lineHeight: 17 }}>{formatResult(mutation.data)}</Text></Panel></View> : null}
  </Page>;
}
