import { Plus, Trash2 } from "lucide-react-native";
import { memo, useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { useAppTheme } from "@/src/lib/theme";
import type { LuckyRecord } from "@/src/types/lucky";

const labels: Record<string, string> = {
  name: "名称",
  Name: "名称",
  image: "镜像",
  tag: "标签",
  repository: "仓库",
  architecture: "架构",
  config: "配置",
  operation: "操作",
  path: "路径",
  content: "内容",
  project_name: "项目名称",
  project_path: "项目路径",
  scan_path: "扫描路径",
  working_dir: "工作目录",
  filename: "文件名",
  file_path: "文件路径",
  target_path: "目标路径",
  config_file_name: "配置文件名",
  auto_start: "恢复后自动启动",
  volume_name: "数据卷名称",
  driver: "驱动",
  Driver: "驱动",
  Options: "选项",
  IPAM: "IP 地址管理",
  DriverOpts: "驱动选项",
  Labels: "标签",
  backup: "备份文件",
  mirror: "镜像加速地址",
  containers: "容器",
  images: "镜像",
  networks: "网络",
  volumes: "数据卷",
  build_cache: "构建缓存",
  disk_usage: "磁盘使用情况",
  LayersSize: "镜像层大小",
  Images: "镜像",
  Containers: "关联容器",
  Created: "创建时间",
  Size: "占用空间",
  SharedSize: "共享空间",
  VirtualSize: "虚拟大小",
  ContainersRunning: "运行中容器",
  ContainersStopped: "已停止容器",
  DockerRootDir: "Docker 数据目录",
  labels: "容器标签",
  containerGroups: "容器分组",
  collapsedStates: "分组折叠状态",
  orderMapping: "容器排序映射",
  composeBackup: "Compose 备份",
  volumeBackup: "数据卷备份",
  imageUpgrades: "镜像升级状态",
  imageRef: "镜像标签",
  checked: "检测结果",
  checkedCount: "检测成功",
  completedCount: "已完成",
  totalCount: "总数",
  inProgress: "检测中",
  statusError: "状态读取错误",
  removed: "已删除镜像",
  removedCount: "删除成功",
  unused: "未使用镜像",
  unusedCount: "未使用数量",
  used: "使用中镜像",
  usedCount: "使用中数量",
  failed: "失败项目",
  failedCount: "失败数量",
  error: "请求错误",
  TaskName: "任务名称",
  DDNSTaskName: "任务名称",
  Enable: "启用",
  Records: "域名记录",
  DNSProvider: "DNS 服务商",
  Domain: "域名",
  Domains: "域名",
  Remark: "备注名称",
  AddFrom: "证书来源",
  CertFile: "证书文件",
  KeyFile: "私钥文件",
  ExtParams: "扩展参数",
  CertsInfo: "证书信息",
  NotBeforeTime: "生效时间",
  NotAfterTime: "到期时间",
  SyncInfo: "同步信息",
  SyncClients: "同步客户端",
  ACMEing: "正在签发",
};

function fieldLabel(key: string) {
  if (labels[key]) return labels[key];
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function FieldHeader({ name, onRemove }: { name: string; onRemove?: () => void }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 8 }}>
    <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" }}>{fieldLabel(name)}</Text>
    {onRemove ? <Pressable accessibilityLabel={`删除${fieldLabel(name)}`} onPress={onRemove} style={{ width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><Trash2 color={colors.danger} size={14} /></Pressable> : null}
  </View>;
}

const NumericField = memo(function NumericField({ name, value, onChange, onRemove }: { name: string; value: number; onChange: (value: number) => void; onRemove?: () => void }) {
  const colors = useAppTheme();
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [focused, value]);
  function commit() {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed)) onChange(parsed);
    else setDraft(String(value));
    setFocused(false);
  }
  return <View style={{ gap: 6 }}>
    <FieldHeader name={name} onRemove={onRemove} />
    <TextInput
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onChangeText={(text) => {
        setDraft(text);
        if (/^-?\d+(?:\.\d+)?$/.test(text)) onChange(Number(text));
      }}
      keyboardType="numeric"
      autoCapitalize="none"
      autoCorrect={false}
      style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12 }}
    />
  </View>;
});

const PrimitiveField = memo(function PrimitiveField({
  name,
  value,
  onChange,
  onRemove,
}: {
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
  onRemove?: () => void;
}) {
  const colors = useAppTheme();
  if (typeof value === "boolean") {
    return (
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" }}>
          {fieldLabel(name)}
        </Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.disabled, true: colors.primary }}
        />
        {onRemove ? <Pressable accessibilityLabel={`删除${fieldLabel(name)}`} onPress={onRemove} style={{ width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" }}><Trash2 color={colors.danger} size={14} /></Pressable> : null}
      </View>
    );
  }
  if (typeof value === "number") return <NumericField name={name} value={value} onChange={onChange} onRemove={onRemove} />;
  const multiline = /content|script|dockerfile|forbidden|indexnames|paths|command/i.test(name);
  return (
    <View style={{ gap: 6 }}>
      <FieldHeader name={name} onRemove={onRemove} />
      <TextInput
        value={value === null || value === undefined ? "" : String(value)}
        onChangeText={onChange}
        keyboardType="default"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          minHeight: multiline ? 112 : 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          color: colors.text,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 8,
          fontFamily: multiline && /content|script|dockerfile|command/i.test(name) ? "monospace" : undefined,
          fontSize: 12,
        }}
      />
    </View>
  );
});

const AddField = memo(function AddField({ existingKeys, onAdd }: { existingKeys: string[]; onAdd: (key: string, value: unknown) => void }) {
  const colors = useAppTheme();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<"text" | "number" | "switch" | "object" | "list">("text");
  const normalizedKey = key.trim();
  const duplicate = existingKeys.includes(normalizedKey);
  if (!open) return (
    <Pressable
      onPress={() => setOpen(true)}
      style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
    >
      <Plus color={colors.primary} size={15} />
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>添加字段</Text>
    </Pressable>
  );
  const options = [["text", "文本"], ["number", "数字"], ["switch", "开关"], ["object", "对象"], ["list", "列表"]] as const;
  return (
    <View style={{ gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.rowBorder }}>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder="字段名称"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 11 }}
      />
      {duplicate ? <Text style={{ color: colors.danger, fontSize: 11 }}>该字段已存在</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {options.map(([value, label]) => <Pressable
          key={value}
          onPress={() => setKind(value)}
          style={{ paddingHorizontal: 10, height: 36, borderRadius: 10, borderWidth: 1, borderColor: kind === value ? colors.primary : colors.border, backgroundColor: kind === value ? colors.primarySoft : colors.card, alignItems: "center", justifyContent: "center" }}
        ><Text style={{ color: kind === value ? colors.primary : colors.text, fontSize: 11, fontWeight: "700" }}>{label}</Text></Pressable>)}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={() => { setOpen(false); setKey(""); }} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.subtext, fontWeight: "700" }}>取消</Text></Pressable>
        <Pressable
          disabled={!normalizedKey || duplicate}
          onPress={() => {
            const initial = kind === "number" ? 0 : kind === "switch" ? false : kind === "object" ? {} : kind === "list" ? [] : "";
            onAdd(normalizedKey, initial);
            setOpen(false);
            setKey("");
          }}
          style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: normalizedKey && !duplicate ? colors.primary : colors.disabled, alignItems: "center", justifyContent: "center" }}
        ><Text style={{ color: "#fff", fontWeight: "800" }}>添加</Text></Pressable>
      </View>
    </View>
  );
});

function ArrayField({ name, value, onChange, depth, onRemove }: { name: string; value: unknown[]; onChange: (value: unknown[]) => void; depth: number; onRemove?: () => void }) {
  const colors = useAppTheme();
  const nextKeyRef = useRef(0);
  const itemKeysRef = useRef<string[]>([]);
  while (itemKeysRef.current.length < value.length) {
    itemKeysRef.current.push(`${name}-${nextKeyRef.current++}`);
  }
  if (itemKeysRef.current.length > value.length) {
    itemKeysRef.current.length = value.length;
  }
  const updateItem = (index: number, next: unknown) => {
    onChange(value.map((entry, itemIndex) => itemIndex === index ? next : entry));
  };
  const removeItem = (index: number) => {
    itemKeysRef.current = itemKeysRef.current.filter((_, itemIndex) => itemIndex !== index);
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  };
  const appendItem = (item: unknown) => {
    itemKeysRef.current.push(`${name}-${nextKeyRef.current++}`);
    onChange([...value, item]);
  };
  return (
    <View style={{ gap: 9 }}>
      <FieldHeader name={name} onRemove={onRemove} />
      {value.map((item, index) => (
        <View key={itemKeysRef.current[index]} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            {isRecord(item) ? <RecordFields value={item} onChange={(next) => updateItem(index, next)} depth={depth + 1} />
              : Array.isArray(item) ? <ArrayField name={`第 ${index + 1} 项`} value={item} onChange={(next) => updateItem(index, next)} depth={depth + 1} />
                : <PrimitiveField name={`第 ${index + 1} 项`} value={item} onChange={(next) => updateItem(index, next)} />}
          </View>
          <Pressable accessibilityLabel="删除列表项" onPress={() => removeItem(index)} style={{ width: 38, height: 38, marginTop: isRecord(item) || Array.isArray(item) ? 0 : 30, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerBg }}>
            <Trash2 color={colors.danger} size={15} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([['文本', ''], ['数字', 0], ['开关', false], ['对象', {}], ['列表', []]] as const).map(([label, initial]) => <Pressable key={label} onPress={() => appendItem(Array.isArray(initial) ? [] : isRecord(initial) ? {} : initial)} style={{ flexGrow: 1, flexBasis: 92, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}><Plus color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{label}项</Text></Pressable>)}
      </View>
    </View>
  );
}

function RecordFields({ value, onChange, depth = 0 }: { value: LuckyRecord; onChange: (value: LuckyRecord) => void; depth?: number }) {
  const colors = useAppTheme();
  const removeField = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  return (
    <View style={{ gap: 12, padding: depth ? 12 : 0, borderWidth: depth ? 1 : 0, borderColor: colors.border, borderRadius: 14 }}>
      {Object.entries(value).map(([key, item]) => (
        <View key={key} style={{ gap: 7 }}>
          {isRecord(item) ? <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: "800" }}>{fieldLabel(key)}</Text>
              <Pressable accessibilityLabel={`删除${fieldLabel(key)}`} onPress={() => removeField(key)}><Trash2 color={colors.danger} size={14} /></Pressable>
            </View>
            <RecordFields value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} depth={depth + 1} />
          </> : Array.isArray(item) ? <ArrayField name={key} value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} depth={depth} onRemove={() => removeField(key)} />
            : <PrimitiveField name={key} value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} onRemove={() => removeField(key)} />}
        </View>
      ))}
      <AddField existingKeys={Object.keys(value)} onAdd={(key, item) => onChange({ ...value, [key]: item })} />
    </View>
  );
}

export function StructuredForm({ value, onChange }: { value: LuckyRecord; onChange: (value: LuckyRecord) => void }) {
  return <RecordFields value={value} onChange={onChange} />;
}

export function StructuredDataView({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const colors = useAppTheme();
  if (isRecord(value)) {
    const entries = Object.entries(value).filter(([key]) => !["ret", "msg"].includes(key));
    if (!entries.length) return <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无数据</Text>;
    return <View style={{ gap: 9 }}>
      {entries.slice(0, 200).map(([key, item]) => <View key={key} style={{ gap: 5, paddingLeft: depth ? 10 : 0, borderLeftWidth: depth ? 1 : 0, borderLeftColor: colors.border }}>
        <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700" }}>{fieldLabel(key)}</Text>
        <StructuredDataView value={item} depth={depth + 1} />
      </View>)}
      {entries.length > 200 ? <Text style={{ color: colors.subtext, fontSize: 11, textAlign: "center" }}>仅显示前 200 个字段，共 {entries.length} 个</Text> : null}
    </View>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无项目</Text>;
    return <View style={{ gap: 8 }}>
      {value.slice(0, 200).map((item, index) => <View key={index} style={{ gap: 5, padding: 10, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        <Text style={{ color: colors.subtext, fontSize: 10, fontWeight: "700" }}>第 {index + 1} 项</Text>
        <StructuredDataView value={item} depth={depth + 1} />
      </View>)}
      {value.length > 200 ? <Text style={{ color: colors.subtext, fontSize: 11, textAlign: "center" }}>仅显示前 200 项，共 {value.length} 项</Text> : null}
    </View>;
  }
  const text = typeof value === "boolean" ? (value ? "是" : "否") : value === null || value === undefined || value === "" ? "--" : String(value);
  return <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{text}</Text>;
}
