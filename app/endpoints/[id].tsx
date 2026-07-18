import * as DocumentPicker from 'expo-document-picker';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Braces, CheckCircle2, Download, FileUp, List, Plus, Route, Send, SlidersHorizontal, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, Page, Panel, SectionHeader } from '@/src/components/lucky-ui';
import { StructuredDataView, StructuredForm } from '@/src/components/structured-form';
import { useAppTheme } from '@/src/lib/theme';
import {
  callLuckyEndpoint,
  getLuckyEndpoint,
  isDangerousLuckyRequest,
  type LuckyEndpointResult,
} from '@/src/services/lucky-endpoints';
import type { LuckyHttpMethod, LuckyRecord } from '@/src/types/lucky';

type RootMode = 'object' | 'array';

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function routeParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] ?? '' : value ?? '';
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function RootModePicker({ value, onChange }: { value: RootMode; onChange: (mode: RootMode) => void }) {
  const colors = useAppTheme();
  return <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12, backgroundColor: colors.mutedCard }}>
    {([['object', '对象', Braces], ['array', '数组', List]] as const).map(([mode, label, Icon]) => <Pressable key={mode} onPress={() => onChange(mode)} style={{ flex: 1, minHeight: 38, borderRadius: 9, backgroundColor: value === mode ? colors.card : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon color={value === mode ? colors.primary : colors.subtext} size={15} /><Text style={{ color: value === mode ? colors.primary : colors.subtext, fontSize: 12, fontWeight: '800' }}>{label}</Text></Pressable>)}
  </View>;
}

function QueryArrayForm({ value, onChange }: { value: LuckyRecord[]; onChange: (value: LuckyRecord[]) => void }) {
  const colors = useAppTheme();
  const inputStyle = { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 10, fontSize: 12 } as const;
  return <View style={{ gap: 9 }}>
    {value.map((entry, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><TextInput value={String(entry.key ?? entry.Key ?? '')} onChangeText={(text) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, key: text } : item))} placeholder="参数名" placeholderTextColor={colors.placeholder} autoCapitalize="none" style={[inputStyle, { flex: 0.9 }]} /><TextInput value={String(entry.value ?? entry.Value ?? '')} onChangeText={(text) => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, value: text } : item))} placeholder="参数值" placeholderTextColor={colors.placeholder} autoCapitalize="none" style={[inputStyle, { flex: 1.1 }]} /><Pressable accessibilityLabel="删除查询参数" onPress={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}><Trash2 color={colors.danger} size={15} /></Pressable></View>)}
    <Pressable onPress={() => onChange([...value, { key: '', value: '' }])} style={{ minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Plus color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>添加查询参数</Text></Pressable>
  </View>;
}

function RootArrayForm({ value, onChange }: { value: unknown[]; onChange: (value: unknown[]) => void }) {
  const colors = useAppTheme();
  const inputStyle = { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 10, fontSize: 12 } as const;
  function update(index: number, next: unknown) {
    onChange(value.map((entry, itemIndex) => itemIndex === index ? next : entry));
  }
  function addItem(initial: unknown) {
    const next = Array.isArray(initial) ? [] : isRecord(initial) ? {} : initial;
    onChange([...value, next]);
  }
  return <View style={{ gap: 10 }}>
    {value.map((entry, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}><View style={{ flex: 1 }}>{Array.isArray(entry) ? <View style={{ gap: 6 }}><Text style={{ color: colors.subtext, fontSize: 11 }}>嵌套数组</Text><RootArrayForm value={entry} onChange={(next) => update(index, next)} /></View> : isRecord(entry) ? <StructuredForm value={entry} onChange={(next) => update(index, next)} /> : typeof entry === 'boolean' ? <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontSize: 12 }}>第 {index + 1} 项</Text><Switch value={entry} onValueChange={(next) => update(index, next)} trackColor={{ false: colors.disabled, true: colors.primary }} /></View> : typeof entry === 'number' ? <NumberArrayInput value={entry} onChange={(next) => update(index, next)} placeholder={`第 ${index + 1} 项`} /> : <TextInput value={String(entry ?? '')} onChangeText={(text) => update(index, text)} keyboardType="default" placeholder={`第 ${index + 1} 项`} placeholderTextColor={colors.placeholder} style={inputStyle} />}</View><Pressable accessibilityLabel="删除数组项" onPress={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}><Trash2 color={colors.danger} size={15} /></Pressable></View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{([['文本', ''], ['数字', 0], ['开关', false], ['对象', {}], ['数组', []]] as const).map(([label, initial]) => <Pressable key={label} onPress={() => addItem(initial)} style={{ minHeight: 38, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 5 }}><Plus color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800' }}>{label}项</Text></Pressable>)}</View>
  </View>;
}

function NumberArrayInput({ value, onChange, placeholder }: { value: number; onChange: (value: number) => void; placeholder: string }) {
  const colors = useAppTheme();
  const [draft, setDraft] = useState(String(value));
  const inputStyle = { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 10, fontSize: 12 } as const;
  useEffect(() => {
    if (draft.trim() === '' || Number(draft) !== value) setDraft(String(value));
  }, [value]);
  function commit() {
    const text = draft.trim();
    const next = Number(text);
    if (text && Number.isFinite(next)) {
      onChange(next);
      setDraft(String(next));
    } else setDraft(String(value));
  }
  return <TextInput value={draft} onChangeText={(text) => {
    setDraft(text);
    const trimmed = text.trim();
    if (trimmed && !['-', '+', '.', '-.', '+.'].includes(trimmed)) {
      const next = Number(trimmed);
      if (Number.isFinite(next)) onChange(next);
    }
  }} onBlur={commit} onSubmitEditing={commit} keyboardType="numeric" placeholder={placeholder} placeholderTextColor={colors.placeholder} style={inputStyle} />;
}

function formatBinary(result: LuckyEndpointResult) {
  return {
    状态: result.status,
    类型: result.contentType || 'application/octet-stream',
    文件名: result.filename || '未命名文件',
    大小: `${result.byteLength ?? 0} bytes`,
  };
}

function appendMultipartValue(data: FormData, key: string, value: unknown) {
  if (!key || value === undefined || value === null || value === '') return;
  if (Array.isArray(value) || isRecord(value)) data.append(key, JSON.stringify(value));
  else data.append(key, String(value));
}

function multipartBody(asset: DocumentPickerAsset, field: string, value: LuckyRecord | unknown[]) {
  if (typeof FormData === 'undefined') throw new Error('当前运行环境不支持文件上传');
  const data = new FormData();
  if (asset.file) data.append(field, asset.file, asset.name);
  else data.append(field, { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream' } as unknown as Blob);
  if (Array.isArray(value)) data.append('payload', JSON.stringify(value));
  else Object.entries(value).forEach(([key, item]) => {
    if (key !== field) appendMultipartValue(data, key, item);
  });
  return data;
}

function safeFilename(value: string | undefined) {
  return (value?.trim() || 'lucky-download.bin').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
}

function availableFile(directory: Directory, filename: string) {
  let file = new ExpoFile(directory, filename);
  if (!file.exists) return file;
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  for (let index = 1; index <= 999; index += 1) {
    file = new ExpoFile(directory, `${base} (${index})${extension}`);
    if (!file.exists) return file;
  }
  return new ExpoFile(directory, `${base}-${Date.now()}${extension}`);
}

async function saveBinaryResult(result: LuckyEndpointResult) {
  if (!result.blob) throw new Error('响应中没有可保存的文件');
  const filename = safeFilename(result.filename);
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }
  const directory = Platform.OS === 'android'
    ? await Directory.pickDirectoryAsync()
    : new Directory(Paths.document);
  const file = availableFile(directory, filename);
  let created = false;
  try {
    file.create({ overwrite: false, intermediates: true });
    created = true;
    if (typeof result.blob.stream === 'function' && typeof file.writableStream === 'function') {
      const reader = result.blob.stream().getReader();
      const writer = file.writableStream().getWriter();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          await writer.write(chunk.value);
        }
        await writer.close();
      } catch (error) {
        try { await writer.abort(error); } catch { /* the outer cleanup removes the partial file */ }
        throw error;
      } finally {
        reader.releaseLock();
        writer.releaseLock();
      }
    } else file.write(new Uint8Array(await result.blob.arrayBuffer()));
  } catch (error) {
    if (created) {
      try { if (file.exists) file.delete(); } catch { /* ignore cleanup errors */ }
    }
    throw error;
  }
  return file.uri;
}

export default function EndpointRunnerScreen() {
  const colors = useAppTheme();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeParam(params.id);
  const endpoint = useMemo(() => getLuckyEndpoint(id), [id]);
  const [method, setMethod] = useState<LuckyHttpMethod>('GET');
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [suffix, setSuffix] = useState('');
  const [queryMode, setQueryMode] = useState<RootMode>('object');
  const [queryObject, setQueryObject] = useState<LuckyRecord>({});
  const [queryArray, setQueryArray] = useState<LuckyRecord[]>([]);
  const [bodyMode, setBodyMode] = useState<RootMode>('object');
  const [bodyObject, setBodyObject] = useState<LuckyRecord>({});
  const [bodyArray, setBodyArray] = useState<unknown[]>([]);
  const [sendBody, setSendBody] = useState(true);
  const [selectedFile, setSelectedFile] = useState<DocumentPickerAsset>();
  const [fileField, setFileField] = useState('file');
  const [saving, setSaving] = useState(false);
  const [inputError, setInputError] = useState('');
  const requestControllerRef = useRef<AbortController | undefined>(undefined);
  const fileCapable = Boolean(endpoint && method !== 'GET' && /\/(?:upload|import|load|restore|build-from-zip)(?:[/?]|$)/i.test(endpoint.path));

  useEffect(() => {
    if (!endpoint) return;
    setMethod(endpoint.methods[0]);
    setPathValues(Object.fromEntries(endpoint.pathVariables.map((name) => [name, ''])));
    setSuffix('');
    setQueryMode('object');
    setQueryObject({});
    setQueryArray([]);
    setBodyMode('object');
    setBodyObject({});
    setBodyArray([]);
    setSendBody(true);
    setSelectedFile(undefined);
    setFileField('file');
    setInputError('');
  }, [endpoint]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!endpoint) throw new Error('接口不存在');
      const controller = new AbortController();
      requestControllerRef.current = controller;
      try {
        const values = { ...pathValues };
        if (endpoint.pathVariables.length === 0 && suffix.trim()) values.e = suffix.trim();
        const query = queryMode === 'array' ? queryArray : queryObject;
        const formValue = bodyMode === 'array' ? bodyArray : bodyObject;
        const body = method === 'GET'
          ? undefined
          : fileCapable && selectedFile
            ? multipartBody(selectedFile, fileField.trim() || 'file', sendBody ? formValue : {})
            : sendBody
              ? formValue
              : undefined;
        return await callLuckyEndpoint({ endpoint, method, pathValues: values, suffix: suffix.trim(), query, body, signal: controller.signal });
      } finally {
        if (requestControllerRef.current === controller) requestControllerRef.current = undefined;
      }
    },
  });
  useEffect(() => () => requestControllerRef.current?.abort(), []);
  useEffect(() => {
    requestControllerRef.current?.abort();
    mutation.reset();
  }, [endpoint, method]);

  if (!endpoint) return <Page title="接口不存在" icon={Braces}><EmptyState message="无法在接口清单中找到该端点" icon={Braces} /></Page>;
  const selectedEndpoint = endpoint;
  const dangerous = isDangerousLuckyRequest(
    selectedEndpoint,
    method,
    [suffix, ...Object.values(pathValues)].filter(Boolean).join('/'),
  );
  const inputStyle = { color: colors.text, backgroundColor: colors.mutedCard, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 11, fontFamily: 'monospace' as const, fontSize: 12 };

  async function chooseFile() {
    setInputError('');
    try {
      const selection = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false, base64: false });
      if (!selection.canceled) setSelectedFile(selection.assets[0]);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : '无法读取所选文件');
    }
  }

  async function saveBinary() {
    if (!mutation.data || mutation.data.kind !== 'binary') return;
    setSaving(true);
    try {
      const location = await saveBinaryResult(mutation.data);
      Alert.alert(Platform.OS === 'web' ? '下载已开始' : '保存成功', location);
    } catch (error) {
      Alert.alert('保存失败', error instanceof Error ? error.message : '无法保存文件');
    } finally {
      setSaving(false);
    }
  }

  function run() {
    setInputError('');
    const missing = selectedEndpoint.pathVariables.filter((name) => !String(pathValues[name] ?? '').trim());
    if (missing.length || (selectedEndpoint.pathVariables.length === 0 && selectedEndpoint.requiresSuffix && !suffix.trim())) {
      setInputError(`请填写路径参数 ${missing.join(', ') || '资源 Key / 路径后缀'}`);
      return;
    }
    const execute = () => {
      mutation.reset();
      mutation.mutate();
    };
    if (dangerous) {
      Alert.alert('确认执行高风险接口', `${method} ${selectedEndpoint.path}\n\n该请求可能修改或删除系统、网络、证书或容器数据。`, [{ text: '取消', style: 'cancel' }, { text: '确认执行', style: 'destructive', onPress: execute }]);
    } else execute();
  }

  function cancelRequest() {
    requestControllerRef.current?.abort();
    requestControllerRef.current = undefined;
    mutation.reset();
    setInputError('');
  }

  return <Page title="接口调试" subtitle={`${selectedEndpoint.module} · ${selectedEndpoint.id}`} icon={Braces} safeTop={false} scrollable={false}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 100 }}>
      <Panel><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}><Route color={colors.primary} size={18} /><Text selectable style={{ flex: 1, color: colors.text, fontFamily: 'monospace', fontSize: 13, lineHeight: 20 }}>{selectedEndpoint.path}</Text></View><Text style={{ color: colors.subtext, fontSize: 11 }}>来源：{selectedEndpoint.source || '开发文档'}</Text></Panel>
      <SectionHeader icon={SlidersHorizontal} title="请求配置" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{selectedEndpoint.methods.map((item) => <Pressable key={item} onPress={() => { requestControllerRef.current?.abort(); setMethod(item); mutation.reset(); }} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: method === item ? colors.primary : colors.card, borderWidth: 1, borderColor: method === item ? colors.primary : colors.border }}><Text style={{ color: method === item ? '#fff' : colors.text, fontWeight: '800', fontSize: 12 }}>{item}</Text></Pressable>)}</View>
      {dangerous ? <View style={{ flexDirection: 'row', gap: 9, padding: 12, borderRadius: 12, backgroundColor: colors.dangerBg }}><AlertTriangle color={colors.danger} size={18} /><Text style={{ flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18 }}>高风险请求，执行前会再次确认。</Text></View> : null}
      {selectedEndpoint.pathVariables.map((name) => <View key={name} style={{ gap: 7 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>路径参数 {name}</Text><TextInput value={String(pathValues[name] ?? '')} onChangeText={(value) => setPathValues((current) => ({ ...current, [name]: value }))} placeholder="输入 ID、Key 或资源名称" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={inputStyle} /></View>)}
      {selectedEndpoint.pathVariables.length === 0 && selectedEndpoint.requiresSuffix ? <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>资源 Key / 路径后缀</Text><TextInput value={suffix} onChangeText={setSuffix} placeholder="输入资源名称或路径后缀" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={inputStyle} /></View> : null}
      <Panel><Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>查询参数</Text><RootModePicker value={queryMode} onChange={setQueryMode} />{queryMode === 'array' ? <QueryArrayForm value={queryArray} onChange={setQueryArray} /> : <StructuredForm value={queryObject} onChange={setQueryObject} />}</Panel>
      {method !== 'GET' ? <Panel><View style={{ minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ flex: 1, color: colors.text, fontWeight: '700', fontSize: 13 }}>发送请求体</Text><Switch accessibilityLabel="发送请求体" value={sendBody} onValueChange={setSendBody} trackColor={{ false: colors.disabled, true: colors.primary }} /></View>{sendBody ? <><RootModePicker value={bodyMode} onChange={setBodyMode} />{bodyMode === 'array' ? <RootArrayForm value={bodyArray} onChange={setBodyArray} /> : <StructuredForm value={bodyObject} onChange={setBodyObject} />}</> : null}</Panel> : null}
      {fileCapable ? <Panel><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><FileUp color={colors.primary} size={17} /><Text style={{ flex: 1, color: colors.text, fontWeight: '700', fontSize: 13 }}>上传文件</Text>{selectedFile ? <Pressable accessibilityLabel="移除文件" onPress={() => setSelectedFile(undefined)} style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.dangerBg, alignItems: 'center', justifyContent: 'center' }}><X color={colors.danger} size={15} /></Pressable> : null}</View><TextInput value={fileField} onChangeText={setFileField} placeholder="Multipart 字段名" placeholderTextColor={colors.placeholder} autoCapitalize="none" autoCorrect={false} style={inputStyle} /><Pressable onPress={() => void chooseFile()} style={{ minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: selectedFile ? colors.success : colors.border, backgroundColor: colors.mutedCard, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}><FileUp color={selectedFile ? colors.success : colors.primary} size={16} /><Text numberOfLines={1} style={{ flex: 1, color: selectedFile ? colors.text : colors.subtext, fontSize: 12 }}>{selectedFile ? `${selectedFile.name}${selectedFile.size ? ` · ${selectedFile.size} bytes` : ''}` : '选择文件'}</Text></Pressable></Panel> : null}
      {inputError ? <ErrorState message={inputError} /> : null}{mutation.error ? <ErrorState message={mutation.error.message} /> : null}
      <Pressable onPress={mutation.isPending ? cancelRequest : run} style={{ minHeight: 48, borderRadius: 13, backgroundColor: mutation.isPending || dangerous ? colors.danger : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>{mutation.isPending ? <X color="#fff" size={17} /> : <Send color="#fff" size={17} />}<Text style={{ color: '#fff', fontWeight: '800' }}>{mutation.isPending ? '取消请求' : `执行 ${method}`}</Text></Pressable>
      {mutation.data ? <View style={{ gap: 10 }}><SectionHeader icon={CheckCircle2} title="响应" meta={`HTTP ${mutation.data.status}`} /><Panel>{mutation.data.kind === 'json' ? <StructuredDataView value={mutation.data.data} /> : mutation.data.kind === 'binary' ? <><StructuredDataView value={formatBinary(mutation.data)} /><Pressable disabled={saving} onPress={() => void saveBinary()} style={{ minHeight: 44, borderRadius: 11, backgroundColor: saving ? colors.disabled : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Download color="#fff" size={16} /><Text style={{ color: '#fff', fontWeight: '800' }}>{saving ? '保存中...' : Platform.OS === 'web' ? '下载文件' : '保存文件'}</Text></Pressable></> : mutation.data.kind === 'empty' ? <Text style={{ color: colors.subtext }}>响应体为空</Text> : <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{String(mutation.data.data ?? '')}</Text>}</Panel></View> : null}
    </ScrollView>
  </Page>;
}
