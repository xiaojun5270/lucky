import { Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
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
  project_path: "项目路径",
  scan_path: "扫描路径",
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
  removed: "已删除镜像",
  removedCount: "删除成功",
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

function PrimitiveField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: unknown;
  onChange: (value: unknown) => void;
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
      </View>
    );
  }
  const multiline = /content|script|dockerfile|forbidden|indexnames|paths|command/i.test(name);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
        {fieldLabel(name)}
      </Text>
      <TextInput
        value={value === null || value === undefined ? "" : String(value)}
        onChangeText={(text) => onChange(typeof value === "number" ? Number(text) || 0 : text)}
        keyboardType={typeof value === "number" ? "numeric" : "default"}
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
}

function AddField({ onAdd }: { onAdd: (key: string, value: unknown) => void }) {
  const colors = useAppTheme();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<"text" | "number" | "switch" | "object" | "list">("text");
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
          disabled={!key.trim()}
          onPress={() => {
            const initial = kind === "number" ? 0 : kind === "switch" ? false : kind === "object" ? {} : kind === "list" ? [] : "";
            onAdd(key.trim(), initial);
            setOpen(false);
            setKey("");
          }}
          style={{ flex: 1, height: 40, borderRadius: 12, backgroundColor: key.trim() ? colors.primary : colors.disabled, alignItems: "center", justifyContent: "center" }}
        ><Text style={{ color: "#fff", fontWeight: "800" }}>添加</Text></Pressable>
      </View>
    </View>
  );
}

function ArrayField({ name, value, onChange, depth }: { name: string; value: unknown[]; onChange: (value: unknown[]) => void; depth: number }) {
  const colors = useAppTheme();
  return (
    <View style={{ gap: 9 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>{fieldLabel(name)}</Text>
      {value.map((item, index) => (
        <View key={index} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            {isRecord(item) ? <RecordFields value={item} onChange={(next) => onChange(value.map((entry, i) => i === index ? next : entry))} depth={depth + 1} />
              : <PrimitiveField name={`第 ${index + 1} 项`} value={item} onChange={(next) => onChange(value.map((entry, i) => i === index ? next : entry))} />}
          </View>
          <Pressable accessibilityLabel="删除列表项" onPress={() => onChange(value.filter((_, i) => i !== index))} style={{ width: 38, height: 38, marginTop: isRecord(item) ? 0 : 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.dangerBg }}>
            <Trash2 color={colors.danger} size={15} />
          </Pressable>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={() => onChange([...value, ""])} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}><Plus color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>文本项</Text></Pressable>
        <Pressable onPress={() => onChange([...value, {}])} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 }}><Plus color={colors.primary} size={14} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>对象项</Text></Pressable>
      </View>
    </View>
  );
}

function RecordFields({ value, onChange, depth = 0 }: { value: LuckyRecord; onChange: (value: LuckyRecord) => void; depth?: number }) {
  const colors = useAppTheme();
  return (
    <View style={{ gap: 12, padding: depth ? 12 : 0, borderWidth: depth ? 1 : 0, borderColor: colors.border, borderRadius: 14 }}>
      {Object.entries(value).map(([key, item]) => (
        <View key={key} style={{ gap: 7 }}>
          {isRecord(item) ? <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: "800" }}>{fieldLabel(key)}</Text>
              <Pressable accessibilityLabel={`删除${fieldLabel(key)}`} onPress={() => { const next = { ...value }; delete next[key]; onChange(next); }}><Trash2 color={colors.danger} size={14} /></Pressable>
            </View>
            <RecordFields value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} depth={depth + 1} />
          </> : Array.isArray(item) ? <ArrayField name={key} value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} depth={depth} />
            : <PrimitiveField name={key} value={item} onChange={(nextItem) => onChange({ ...value, [key]: nextItem })} />}
        </View>
      ))}
      <AddField onAdd={(key, item) => onChange({ ...value, [key]: item })} />
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
      {entries.map(([key, item]) => <View key={key} style={{ gap: 5, paddingLeft: depth ? 10 : 0, borderLeftWidth: depth ? 1 : 0, borderLeftColor: colors.border }}>
        <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700" }}>{fieldLabel(key)}</Text>
        <StructuredDataView value={item} depth={depth + 1} />
      </View>)}
    </View>;
  }
  if (Array.isArray(value)) {
    if (!value.length) return <Text style={{ color: colors.subtext, fontSize: 12 }}>暂无项目</Text>;
    return <View style={{ gap: 8 }}>
      {value.map((item, index) => <View key={index} style={{ gap: 5, padding: 10, borderRadius: 12, backgroundColor: colors.mutedCard }}>
        <Text style={{ color: colors.subtext, fontSize: 10, fontWeight: "700" }}>第 {index + 1} 项</Text>
        <StructuredDataView value={item} depth={depth + 1} />
      </View>)}
    </View>;
  }
  const text = typeof value === "boolean" ? (value ? "是" : "否") : value === null || value === undefined || value === "" ? "--" : String(value);
  return <Text selectable style={{ color: colors.text, fontSize: 12, lineHeight: 18 }}>{text}</Text>;
}
