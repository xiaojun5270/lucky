import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCog,
  FolderUp,
  FolderTree,
  Globe2,
  Network,
  Pencil,
  Plus,
  Route,
  Save,
  ScrollText,
  Settings2,
  ShieldCheck,
  Trash2,
  Workflow,
  Wrench,
} from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  Page,
  Panel,
  SectionHeader,
} from "@/src/components/lucky-ui";
import { queryClient } from "@/src/lib/query-client";
import { useAppTheme } from "@/src/lib/theme";
import type { LuckyRecord } from "@/src/types/lucky";
import {
  cancelWebServiceFolderUpdate,
  confirmWebServiceFolderUpdate,
  createWebServiceCgi,
  createWebServiceGroup,
  createWebServiceRule,
  deleteWebServiceCgi,
  deleteWebServiceGroup,
  deleteWebServiceRule,
  getLightPanelConfigTemplate,
  getWebServiceCgiList,
  getWebServiceGroups,
  getWebServiceLastLogs,
  getWebServiceRule,
  getWebServiceRuleLastLogs,
  getWebServiceRules,
  getWebServiceSettings,
  getWebServiceTipInfo,
  markWebServiceTipRead,
  newWebServiceCgi,
  newWebServiceGroup,
  newWebServiceRule,
  newWebServiceSubRule,
  reorderWebServiceGroups,
  reorderWebServiceRules,
  setWebServiceCgiEnabled,
  setWebServiceSubRuleEnabled,
  updateWebServiceCgi,
  updateWebServiceGroup,
  updateWebServiceRule,
  updateWebServiceSettings,
  uploadWebServiceFolder,
} from "@/src/services/webservice";

type ViewKey = "rules" | "groups" | "cgi" | "settings" | "logs" | "tools";
type EditorType =
  | "rule"
  | "subrule"
  | "group"
  | "cgi"
  | "settings"
  | "template";
type EditorState = {
  type: EditorType;
  title: string;
  value: LuckyRecord;
  key?: string;
  parentKey?: string;
};
type Action =
  | { type: "save"; editor: EditorState; value: LuckyRecord }
  | { type: "delete-rule" | "delete-group" | "delete-cgi"; key: string }
  | { type: "delete-subrule"; parentKey: string; key: string }
  | { type: "toggle-rule" | "toggle-cgi"; key: string; enabled: boolean }
  | { type: "toggle-subrule"; parentKey: string; key: string; enabled: boolean }
  | { type: "reorder-rules" | "reorder-groups"; keys: string[] }
  | { type: "mark-tip"; version: string };

const tabs = [
  ["rules", "规则", Route],
  ["groups", "分组", FolderTree],
  ["cgi", "CGI", Workflow],
  ["settings", "设置", Settings2],
  ["logs", "日志", ScrollText],
  ["tools", "工具", Wrench],
] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pick(item: LuckyRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" || typeof value === "number")
      return String(value);
  }
  return fallback;
}

function keyOf(item: LuckyRecord, index: number) {
  return pick(item, ["RuleKey", "Key", "key", "ID", "id"], String(index));
}

function enabled(item: LuckyRecord) {
  const value = item.Enable ?? item.enable;
  return value !== false && value !== 0 && value !== "false";
}

function array(item: LuckyRecord, keys: string[]) {
  for (const key of keys)
    if (Array.isArray(item[key])) return item[key] as LuckyRecord[];
  return [];
}

function logLines(value: LuckyRecord | undefined) {
  if (!value) return [];
  const candidate =
    value.logs ?? value.lastLogs ?? value.lastlogs ?? value.list ?? value.data ?? value.text ?? "";
  if (Array.isArray(candidate))
    return candidate.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  return String(candidate || "")
    .split("\n")
    .filter(Boolean);
}

function move(keys: string[], index: number, offset: number) {
  const next = [...keys];
  const target = index + offset;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function IconButton({
  icon: Icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: typeof Pencil;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.mutedCard,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon color={color} size={16} />
    </Pressable>
  );
}

function WebServiceEditor({
  editor,
  busy,
  onClose,
  onSave,
}: {
  editor: EditorState;
  busy: boolean;
  onClose: () => void;
  onSave: (value: LuckyRecord) => void;
}) {
  const colors = useAppTheme();
  const [value, setValue] = useState(() => clone(editor.value));
  const [advanced, setAdvanced] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(editor.value, null, 2));
  const [error, setError] = useState("");

  function update(key: string, next: unknown) {
    setValue((current) => ({ ...current, [key]: next }));
    setError("");
  }

  function parseJson() {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("必须是 JSON 对象");
    return parsed as LuckyRecord;
  }

  function showForm() {
    try {
      setValue(parseJson());
      setAdvanced(false);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "JSON 格式错误");
    }
  }

  function save() {
    try {
      onSave(advanced ? parseJson() : value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "JSON 格式错误");
    }
  }

  function Field({
    label,
    field,
    multiline = false,
    numeric = false,
    readOnly = false,
    hint,
  }: {
    label: string;
    field: string;
    multiline?: boolean;
    numeric?: boolean;
    readOnly?: boolean;
    hint?: string;
  }) {
    const current = Array.isArray(value[field])
      ? (value[field] as unknown[]).join("\n")
      : String(value[field] ?? "");
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
          {label}
        </Text>
        <TextInput
          value={current}
          editable={!readOnly}
          multiline={multiline}
          keyboardType={numeric ? "numeric" : "default"}
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical={multiline ? "top" : "center"}
          onChangeText={(next) => {
            if (Array.isArray(value[field])) {
              update(field, next.split(/\r?\n/).map((item) => item.trim()).filter(Boolean));
            } else if (numeric) {
              update(field, Number.parseInt(next, 10) || 0);
            } else update(field, next);
          }}
          style={{
            minHeight: multiline ? 92 : 44,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: readOnly ? colors.mutedCard : colors.card,
            color: readOnly ? colors.subtext : colors.text,
            paddingHorizontal: 12,
            paddingVertical: multiline ? 10 : 8,
          }}
        />
        {hint ? <Text style={{ color: colors.subtext, fontSize: 10 }}>{hint}</Text> : null}
      </View>
    );
  }

  function Toggle({ label, field }: { label: string; field: string }) {
    return (
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" }}>
          {label}
        </Text>
        <Switch
          value={Boolean(value[field])}
          onValueChange={(next) => update(field, next)}
          trackColor={{ false: colors.disabled, true: colors.primary }}
        />
      </View>
    );
  }

  function Choices({
    label,
    field,
    options,
  }: {
    label: string;
    field: string;
    options: string[];
  }) {
    return (
      <View style={{ gap: 7 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {options.map((option) => {
            const selected = String(value[field] ?? "") === option;
            return (
              <Pressable
                key={option}
                onPress={() => update(field, option)}
                style={{
                  minWidth: 76,
                  height: 38,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primarySoft : colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: "700", fontSize: 12 }}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  function form() {
    if (editor.type === "rule") return (
      <>
        <Field label="规则名称" field="RuleName" />
        <Toggle label="启用规则" field="Enable" />
        <Choices label="网络协议" field="Network" options={["tcp", "tcp4", "tcp6"]} />
        <Field label="监听 IP" field="ListenIP" hint="留空表示监听所有地址" />
        <Field label="监听端口" field="ListenPort" numeric />
        <Choices label="编辑模式" field="DiaglogShowMode" options={["simple", "full"]} />
        <Toggle label="自动配置防火墙" field="AutoOptionsFirewall" />
        <Toggle label="启用 TLS" field="EnableTLS" />
        {Boolean(value.EnableTLS) ? <>
          <Field label="TLS 最低版本" field="TLSMinVersion" numeric />
          <Toggle label="启用 HTTP/3" field="Http3" />
        </> : null}
        <Field label="最大请求头 (KB)" field="MaxHeaderKBytes" numeric />
      </>
    );
    if (editor.type === "subrule") return (
      <>
        <Field label="备注" field="Remark" />
        <Toggle label="启用子规则" field="Enable" />
        <Field label="分组 Key" field="GroupKey" />
        <Field label="服务类型" field="WebServiceType" hint="例如 reverseproxy、fileserver" />
        <Field label="域名" field="Domains" multiline hint="每行填写一个域名" />
        <Field label="目标地址或目录" field="Locations" multiline hint="每行填写一个地址" />
        <Toggle label="启用访问日志" field="EnableAccessLog" />
        <Toggle label="忽略上游 TLS 证书错误" field="LocationInsecureSkipVerify" />
        <Toggle label="EasyLucky 模式" field="EasyLucky" />
      </>
    );
    if (editor.type === "group") return (
      <>
        <Field label="分组名称" field="Name" />
        {editor.key ? <Field label="分组 Key" field="Key" readOnly /> : null}
      </>
    );
    if (editor.type === "cgi") return (
      <>
        <Field label="实例名称" field="Name" />
        <Toggle label="启用 CGI" field="Enable" />
        <Choices label="CGI 类型" field="CGIType" options={["php", "fastcgi"]} />
        <Choices label="网络协议" field="Network" options={["tcp", "tcp4", "tcp6", "unix"]} />
        <Field label="服务地址" field="Address" hint="例如 127.0.0.1:9000" />
        <Field label="最大连接数" field="MaxConns" numeric />
        <Field label="连接超时（秒）" field="ConnectTimeout" numeric />
        <Field label="默认文档根目录" field="DefaultDocRoot" />
        <Field label="默认首页" field="DefaultIndexNames" multiline hint="每行一个文件名" />
        <Field label="文件扩展名" field="FileExtensions" />
        <Field label="禁止访问路径" field="ForbiddenPaths" multiline />
      </>
    );
    const primitiveFields = Object.keys(value).filter(
      (key) => !["ret", "msg"].includes(key) && ["string", "number", "boolean"].includes(typeof value[key]),
    );
    return primitiveFields.length ? <>
      {primitiveFields.map((field) => typeof value[field] === "boolean"
        ? <Toggle key={field} label={field} field={field} />
        : <Field key={field} label={field} field={field} numeric={typeof value[field] === "number"} />)}
      <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 17 }}>
        对象和列表配置可在高级 JSON 中编辑。
      </Text>
    </> : <Text style={{ color: colors.subtext, lineHeight: 20 }}>
      此接口没有固定字段，请使用高级 JSON 填写请求参数。
    </Text>;
  }

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.42)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            maxHeight: "88%",
            minHeight: "56%",
            backgroundColor: colors.card,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            padding: 18,
            gap: 13,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <FileCog color={colors.primary} size={20} />
            <Text
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 18,
                fontWeight: "800",
              }}
            >
              {editor.title}
            </Text>
            <Pressable onPress={onClose}>
              <Text style={{ color: colors.subtext, fontWeight: "700" }}>
                取消
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              if (advanced) showForm();
              else {
                setText(JSON.stringify(value, null, 2));
                setAdvanced(true);
                setError("");
              }
            }}
            style={{
              height: 40,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Braces color={colors.primary} size={16} />
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {advanced ? "返回表单" : "高级 JSON"}
            </Text>
          </Pressable>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 13, paddingBottom: 4 }}
            style={{ flexGrow: 0 }}
          >
            {advanced ? (
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                textAlignVertical="top"
                style={{
                  minHeight: 360,
                  borderRadius: 8,
                  backgroundColor: colors.mutedCard,
                  color: colors.text,
                  padding: 12,
                  fontFamily: "monospace",
                  fontSize: 11,
                  lineHeight: 17,
                }}
              />
            ) : form()}
          </ScrollView>
          {error ? <ErrorState message={error} /> : null}
          <Pressable
            disabled={busy}
            onPress={save}
            style={{
              minHeight: 48,
              borderRadius: 8,
              backgroundColor: busy ? colors.disabled : colors.primary,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Save color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {busy ? "保存中" : "保存配置"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

export default function WebServiceScreen() {
  const colors = useAppTheme();
  const [view, setView] = useState<ViewKey>("rules");
  const [expanded, setExpanded] = useState("");
  const [editor, setEditor] = useState<EditorState>();
  const [output, setOutput] = useState("");
  const [localError, setLocalError] = useState("");
  const [folderTarget, setFolderTarget] = useState<{ parentKey: string; subKey: string }>();
  const [mountIndex, setMountIndex] = useState("0");
  const [uploadBusy, setUploadBusy] = useState(false);
  const rules = useQuery({
    queryKey: ["webservice", "rules"],
    queryFn: () => getWebServiceRules(),
    enabled: view === "rules",
  });
  const groups = useQuery({
    queryKey: ["webservice", "groups"],
    queryFn: getWebServiceGroups,
    enabled: view === "groups",
  });
  const cgi = useQuery({
    queryKey: ["webservice", "cgi"],
    queryFn: getWebServiceCgiList,
    enabled: view === "cgi",
  });
  const settings = useQuery({
    queryKey: ["webservice", "settings"],
    queryFn: getWebServiceSettings,
    enabled: view === "settings",
  });
  const logs = useQuery({
    queryKey: ["webservice", "logs"],
    queryFn: getWebServiceLastLogs,
    enabled: view === "logs",
    refetchInterval: view === "logs" ? 15000 : false,
  });
  const tips = useQuery({
    queryKey: ["webservice", "tips"],
    queryFn: getWebServiceTipInfo,
    enabled: view === "tools",
  });

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["webservice"] });
  }

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (action.type === "save") {
        const { editor: source, value } = action;
        if (source.type === "rule")
          return source.key
            ? updateWebServiceRule(source.key, value)
            : createWebServiceRule(value);
        if (source.type === "subrule") {
          const rule = await getWebServiceRule(source.parentKey ?? "");
          const items = array(rule, ["ProxyList"]);
          if (source.key) {
            const index = items.findIndex(
              (item, i) => keyOf(item, i) === source.key,
            );
            if (index < 0) throw new Error("子规则不存在");
            items[index] = value;
          } else items.push(value);
          rule.ProxyList = items;
          return updateWebServiceRule(source.parentKey ?? "", rule);
        }
        if (source.type === "group")
          return source.key
            ? updateWebServiceGroup(value)
            : createWebServiceGroup(value);
        if (source.type === "cgi")
          return source.key
            ? updateWebServiceCgi(source.key, value)
            : createWebServiceCgi(value);
        if (source.type === "settings") return updateWebServiceSettings(value);
        const result = await getLightPanelConfigTemplate(value);
        setOutput(JSON.stringify(result, null, 2));
        return result;
      }
      if (action.type === "delete-rule")
        return deleteWebServiceRule(action.key);
      if (action.type === "delete-group")
        return deleteWebServiceGroup(action.key);
      if (action.type === "delete-cgi") return deleteWebServiceCgi(action.key);
      if (action.type === "delete-subrule") {
        const rule = await getWebServiceRule(action.parentKey);
        const items = array(rule, ["ProxyList"]);
        rule.ProxyList = items.filter(
          (entry, index) => keyOf(entry, index) !== action.key,
        );
        return updateWebServiceRule(action.parentKey, rule);
      }
      if (action.type === "toggle-cgi")
        return setWebServiceCgiEnabled(action.key, action.enabled);
      if (action.type === "toggle-rule") {
        const rule = await getWebServiceRule(action.key);
        rule.Enable = action.enabled;
        return updateWebServiceRule(action.key, rule);
      }
      if (action.type === "toggle-subrule") {
        return setWebServiceSubRuleEnabled(action.parentKey, action.key, action.enabled);
      }
      if (action.type === "reorder-rules")
        return reorderWebServiceRules(action.keys);
      if (action.type === "reorder-groups")
        return reorderWebServiceGroups(action.keys);
      if (action.type === "mark-tip")
        return markWebServiceTipRead(action.version);
      throw new Error("不支持的 Web 服务操作");
    },
    onSuccess: async () => {
      setEditor(undefined);
      setLocalError("");
      await invalidate();
    },
    onError: (error) => setLocalError(error.message),
  });

  async function editRule(key: string, copyRule = false) {
    try {
      const value = await getWebServiceRule(key);
      if (copyRule) {
        value.RuleKey = "";
        value.RuleName = `${pick(value, ["RuleName"], "规则")} - 副本`;
        for (const item of array(value, ["ProxyList"])) item.Key = "";
      }
      setEditor({
        type: "rule",
        title: copyRule ? "复制 Web 规则" : "编辑 Web 规则",
        value,
        key: copyRule ? undefined : key,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取规则失败");
    }
  }

  async function editSubRule(
    parentKey: string,
    key?: string,
    copySubRule = false,
  ) {
    try {
      const rule = await getWebServiceRule(parentKey);
      const value = key
        ? array(rule, ["ProxyList"]).find((item, i) => keyOf(item, i) === key)
        : newWebServiceSubRule();
      if (!value) throw new Error("子规则不存在");
      const draft = clone(value);
      if (copySubRule) draft.Key = "";
      setEditor({
        type: "subrule",
        title: copySubRule ? "复制子规则" : key ? "编辑子规则" : "添加子规则",
        value: draft,
        key: copySubRule ? undefined : key,
        parentKey,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取子规则失败");
    }
  }

  function confirmDelete(
    type: "rule" | "group" | "cgi",
    key: string,
    name: string,
  ) {
    Alert.alert("确认删除", `确定删除“${name || key}”吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () =>
          mutation.mutate({ type: `delete-${type}` as "delete-rule", key }),
      },
    ]);
  }

  function confirmDeleteSubRule(parentKey: string, key: string, name: string) {
    Alert.alert("确认删除", `确定删除子规则“${name || key}”吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () =>
          mutation.mutate({ type: "delete-subrule", parentKey, key }),
      },
    ]);
  }

  async function showSubRuleLogs(parentKey: string, key: string) {
    try {
      const value = await getWebServiceRuleLastLogs(parentKey, key);
      setOutput(JSON.stringify(value, null, 2));
      setView("logs");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取日志失败");
    }
  }

  async function uploadFolderUpdate() {
    if (!folderTarget) return;
    setUploadBusy(true);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/gzip", "application/x-tar"],
        copyToCacheDirectory: true,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      const result = await uploadWebServiceFolder(
        folderTarget.parentKey,
        folderTarget.subKey,
        Math.max(0, Number.parseInt(mountIndex, 10) || 0),
        { uri: asset.uri, name: asset.name, type: asset.mimeType ?? undefined },
      );
      setOutput(JSON.stringify(result, null, 2));
      const nested = result.data && typeof result.data === "object" ? (result.data as LuckyRecord) : {};
      const tempId = String(result.tempId ?? nested.tempId ?? "");
      if (!tempId) {
        setFolderTarget(undefined);
        return;
      }
      Alert.alert("确认更新目录", "压缩包已上传并完成预检，是否应用目录更新？", [
        {
          text: "取消更新",
          style: "destructive",
          onPress: async () => {
            await cancelWebServiceFolderUpdate(folderTarget.parentKey, folderTarget.subKey, tempId);
            setFolderTarget(undefined);
          },
        },
        {
          text: "应用更新",
          onPress: async () => {
            await confirmWebServiceFolderUpdate(folderTarget.parentKey, folderTarget.subKey, tempId);
            setFolderTarget(undefined);
            await invalidate();
          },
        },
      ]);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "目录更新失败");
    } finally {
      setUploadBusy(false);
    }
  }

  const activeQuery =
    view === "rules"
      ? rules
      : view === "groups"
        ? groups
        : view === "cgi"
          ? cgi
          : view === "settings"
            ? settings
            : view === "logs"
              ? logs
              : tips;
  const ruleKeys = rules.data?.items.map(keyOf) ?? [];
  const groupKeys = groups.data?.items.map(keyOf) ?? [];

  return (
    <Page
      title="Web 服务"
      subtitle="规则、分组、CGI 与运行设置"
      icon={Globe2}
      safeTop={false}
      refreshing={activeQuery.isFetching}
      onRefresh={() => activeQuery.refetch()}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {tabs.map(([key, label, Icon]) => (
          <Pressable
            key={key}
            onPress={() => {
              setView(key);
              if (key === "logs") setOutput("");
              setLocalError("");
            }}
            style={{
              width: "31%",
              minWidth: 92,
              height: 42,
              borderRadius: 8,
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: view === key ? colors.primary : colors.card,
              borderWidth: 1,
              borderColor: view === key ? colors.primary : colors.border,
            }}
          >
            <Icon color={view === key ? "#fff" : colors.text} size={16} />
            <Text
              style={{
                color: view === key ? "#fff" : colors.text,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {localError ? <ErrorState message={localError} /> : null}
      {activeQuery.error ? (
        <ErrorState
          message={activeQuery.error.message}
          retry={() => activeQuery.refetch()}
        />
      ) : null}

      {view === "rules" ? (
        <>
          <SectionHeader
            icon={Route}
            title="反向代理规则"
            meta={`${rules.data?.items.length ?? 0} 项`}
          />
          <Pressable
            onPress={() =>
              setEditor({
                type: "rule",
                title: "添加 Web 规则",
                value: newWebServiceRule(),
              })
            }
            style={{
              height: 44,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 7,
            }}
          >
            <Plus color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>添加规则</Text>
          </Pressable>
          {rules.data?.items.length ? (
            rules.data.items.map((item, index) => {
              const key = keyOf(item, index);
              const open = expanded === key;
              const subs = array(item, ["ProxyList"]);
              const name = pick(item, ["RuleName", "Name"], "未命名规则");
              return (
                <Panel key={key}>
                  <Pressable
                    onPress={() => setExpanded(open ? "" : key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        backgroundColor: colors.primarySoft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Network color={colors.primary} size={18} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {name}
                      </Text>
                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        {pick(item, ["Network"], "tcp")} ·{" "}
                        {pick(item, ["ListenIP"], "*")}:
                        {pick(item, ["ListenPort"], "--")} · {subs.length}{" "}
                        个子规则
                      </Text>
                    </View>
                    {open ? (
                      <ChevronUp color={colors.subtext} size={18} />
                    ) : (
                      <ChevronDown color={colors.subtext} size={18} />
                    )}
                  </Pressable>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    <Switch
                      value={enabled(item)}
                      disabled={mutation.isPending}
                      onValueChange={(value) =>
                        mutation.mutate({
                          type: "toggle-rule",
                          key,
                          enabled: value,
                        })
                      }
                      trackColor={{
                        false: colors.disabled,
                        true: colors.primary,
                      }}
                    />
                    <View style={{ flex: 1 }} />
                    <IconButton
                      icon={ArrowUp}
                      label="上移"
                      color={colors.text}
                      disabled={index === 0}
                      onPress={() =>
                        mutation.mutate({
                          type: "reorder-rules",
                          keys: move(ruleKeys, index, -1),
                        })
                      }
                    />
                    <IconButton
                      icon={ArrowDown}
                      label="下移"
                      color={colors.text}
                      disabled={index === ruleKeys.length - 1}
                      onPress={() =>
                        mutation.mutate({
                          type: "reorder-rules",
                          keys: move(ruleKeys, index, 1),
                        })
                      }
                    />
                    <IconButton
                      icon={Copy}
                      label="复制"
                      color={colors.primary}
                      onPress={() => editRule(key, true)}
                    />
                    <IconButton
                      icon={Pencil}
                      label="编辑"
                      color={colors.primary}
                      onPress={() => editRule(key)}
                    />
                    <IconButton
                      icon={Trash2}
                      label="删除"
                      color={colors.danger}
                      onPress={() => confirmDelete("rule", key, name)}
                    />
                  </View>
                  {open ? (
                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: colors.rowBorder,
                        paddingTop: 10,
                        gap: 9,
                      }}
                    >
                      <Pressable
                        onPress={() => editSubRule(key)}
                        style={{
                          height: 38,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.primary,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          gap: 6,
                        }}
                      >
                        <Plus color={colors.primary} size={15} />
                        <Text
                          style={{
                            color: colors.primary,
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          添加子规则
                        </Text>
                      </Pressable>
                      {subs.length ? (
                        subs.map((sub, subIndex) => {
                          const subKey = keyOf(sub, subIndex);
                          const domains = Array.isArray(sub.Domains)
                            ? sub.Domains.join(", ")
                            : "";
                          return (
                            <View
                              key={subKey}
                              style={{
                                padding: 10,
                                borderRadius: 8,
                                backgroundColor: colors.mutedCard,
                                gap: 7,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <ShieldCheck
                                  color={
                                    enabled(sub)
                                      ? colors.success
                                      : colors.disabled
                                  }
                                  size={16}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={{
                                      color: colors.text,
                                      fontWeight: "700",
                                      fontSize: 12,
                                    }}
                                  >
                                    {pick(
                                      sub,
                                      ["Remark"],
                                      domains || `子规则 ${subIndex + 1}`,
                                    )}
                                  </Text>
                                  <Text
                                    numberOfLines={2}
                                    style={{
                                      color: colors.subtext,
                                      fontSize: 10,
                                      marginTop: 3,
                                    }}
                                  >
                                    {pick(
                                      sub,
                                      ["WebServiceType"],
                                      "reverseproxy",
                                    )}{" "}
                                    · {domains || "--"}
                                  </Text>
                                </View>
                                <Switch
                                  value={enabled(sub)}
                                  onValueChange={(value) =>
                                    mutation.mutate({
                                      type: "toggle-subrule",
                                      parentKey: key,
                                      key: subKey,
                                      enabled: value,
                                    })
                                  }
                                />
                              </View>
                              <View
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "flex-end",
                                  gap: 7,
                                }}
                              >
                                <IconButton
                                  icon={ScrollText}
                                  label="子规则日志"
                                  color={colors.cyan}
                                  onPress={() => showSubRuleLogs(key, subKey)}
                                />
                                {pick(sub, ["WebServiceType"]).toLowerCase().includes("file") ? (
                                  <IconButton
                                    icon={FolderUp}
                                    label="更新文件目录"
                                    color={colors.warning}
                                    onPress={() => {
                                      setMountIndex("0");
                                      setFolderTarget({ parentKey: key, subKey });
                                    }}
                                  />
                                ) : null}
                                <IconButton
                                  icon={Copy}
                                  label="复制子规则"
                                  color={colors.primary}
                                  onPress={() => editSubRule(key, subKey, true)}
                                />
                                <IconButton
                                  icon={Pencil}
                                  label="编辑子规则"
                                  color={colors.primary}
                                  onPress={() => editSubRule(key, subKey)}
                                />
                                <IconButton
                                  icon={Trash2}
                                  label="删除子规则"
                                  color={colors.danger}
                                  onPress={() =>
                                    confirmDeleteSubRule(
                                      key,
                                      subKey,
                                      pick(sub, ["Remark"], domains),
                                    )
                                  }
                                />
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        <Text
                          style={{
                            color: colors.subtext,
                            textAlign: "center",
                            paddingVertical: 14,
                            fontSize: 12,
                          }}
                        >
                          暂无子规则
                        </Text>
                      )}
                    </View>
                  ) : null}
                </Panel>
              );
            })
          ) : !rules.isLoading ? (
            <EmptyState message="暂无 Web 服务规则" icon={Route} />
          ) : null}
        </>
      ) : null}

      {view === "groups" ? (
        <>
          <SectionHeader
            icon={FolderTree}
            title="子规则分组"
            meta={`${groups.data?.items.length ?? 0} 项`}
          />
          <Pressable
            onPress={() =>
              setEditor({
                type: "group",
                title: "添加分组",
                value: newWebServiceGroup(),
              })
            }
            style={{
              height: 44,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 7,
            }}
          >
            <Plus color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>添加分组</Text>
          </Pressable>
          {groups.data?.items.length ? (
            groups.data.items.map((item, index) => {
              const key = keyOf(item, index);
              const name = pick(item, ["Name", "GroupName"], key);
              return (
                <Panel key={key}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <FolderTree color={colors.primary} size={18} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {name}
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: 11 }}>
                        {key} · {String(item.subRuleCount ?? 0)} 个子规则
                      </Text>
                    </View>
                    <IconButton
                      icon={ArrowUp}
                      label="上移"
                      color={colors.text}
                      disabled={index === 0}
                      onPress={() =>
                        mutation.mutate({
                          type: "reorder-groups",
                          keys: move(groupKeys, index, -1),
                        })
                      }
                    />
                    <IconButton
                      icon={ArrowDown}
                      label="下移"
                      color={colors.text}
                      disabled={index === groupKeys.length - 1}
                      onPress={() =>
                        mutation.mutate({
                          type: "reorder-groups",
                          keys: move(groupKeys, index, 1),
                        })
                      }
                    />
                    <IconButton
                      icon={Pencil}
                      label="编辑"
                      color={colors.primary}
                      onPress={() =>
                        setEditor({
                          type: "group",
                          title: "编辑分组",
                          value: clone(item),
                          key,
                        })
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      label="删除"
                      color={colors.danger}
                      onPress={() => confirmDelete("group", key, name)}
                    />
                  </View>
                </Panel>
              );
            })
          ) : !groups.isLoading ? (
            <EmptyState message="暂无分组" icon={FolderTree} />
          ) : null}
        </>
      ) : null}

      {view === "cgi" ? (
        <>
          <SectionHeader
            icon={Workflow}
            title="CGI 实例"
            meta={`${cgi.data?.items.length ?? 0} 项`}
          />
          <Pressable
            onPress={() =>
              setEditor({
                type: "cgi",
                title: "添加 CGI 实例",
                value: newWebServiceCgi(),
              })
            }
            style={{
              height: 44,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 7,
            }}
          >
            <Plus color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>添加 CGI</Text>
          </Pressable>
          {cgi.data?.items.length ? (
            cgi.data.items.map((item, index) => {
              const key = keyOf(item, index);
              const name = pick(item, ["Name"], key);
              return (
                <Panel key={key}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Workflow color={colors.cyan} size={18} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {name}
                      </Text>
                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        {pick(item, ["CGIType"])} · {pick(item, ["Network"])} ·{" "}
                        {pick(item, ["Address"])}
                      </Text>
                    </View>
                    <Switch
                      value={enabled(item)}
                      onValueChange={(value) =>
                        mutation.mutate({
                          type: "toggle-cgi",
                          key,
                          enabled: value,
                        })
                      }
                    />
                    <IconButton
                      icon={Pencil}
                      label="编辑"
                      color={colors.primary}
                      onPress={() =>
                        setEditor({
                          type: "cgi",
                          title: "编辑 CGI 实例",
                          value: clone(item),
                          key,
                        })
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      label="删除"
                      color={colors.danger}
                      onPress={() => confirmDelete("cgi", key, name)}
                    />
                  </View>
                </Panel>
              );
            })
          ) : !cgi.isLoading ? (
            <EmptyState message="暂无 CGI 实例" icon={Workflow} />
          ) : null}
        </>
      ) : null}

      {view === "settings" ? (
        <>
          <SectionHeader icon={Settings2} title="模块设置" />
          {settings.data ? (
            <Panel>
              <Text
                style={{ color: colors.subtext, fontSize: 12, lineHeight: 19 }}
              >
                当前设置包含{" "}
                {
                  Object.keys(settings.data).filter(
                    (key) => !["ret", "msg"].includes(key),
                  ).length
                }{" "}
                个字段。
              </Text>
              <Pressable
                onPress={() =>
                  setEditor({
                    type: "settings",
                    title: "编辑模块设置",
                    value: clone(settings.data),
                  })
                }
                style={{
                  height: 42,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 7,
                }}
              >
                <FileCog color="#fff" size={17} />
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  编辑全部设置
                </Text>
              </Pressable>
            </Panel>
          ) : null}
        </>
      ) : null}

      {view === "logs" ? (
        <>
          <SectionHeader icon={ScrollText} title="Web 服务日志" />
          {output ? (
            <Panel>
              <Text
                selectable
                style={{
                  color: colors.text,
                  fontFamily: "monospace",
                  fontSize: 10,
                  lineHeight: 16,
                }}
              >
                {output}
              </Text>
            </Panel>
          ) : null}
          {logLines(logs.data).length ? (
            <Panel>
              {logLines(logs.data).map((line, index) => (
                <Text
                  selectable
                  key={`${index}-${line.slice(0, 12)}`}
                  style={{
                    color: colors.text,
                    fontFamily: "monospace",
                    fontSize: 10,
                    lineHeight: 17,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.rowBorder,
                    paddingTop: index ? 5 : 0,
                  }}
                >
                  {line}
                </Text>
              ))}
            </Panel>
          ) : !logs.isLoading ? (
            <EmptyState message="暂无 Web 服务日志" icon={ScrollText} />
          ) : null}
        </>
      ) : null}

      {view === "tools" ? (
        <>
          <SectionHeader icon={Wrench} title="辅助接口" />
          <Panel>
            <Text style={{ color: colors.text, fontWeight: "700" }}>
              规则轻量列表与提示
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={async () => {
                  try {
                    const result = await getWebServiceRules(true);
                    setOutput(JSON.stringify(result.raw, null, 2));
                  } catch (error) {
                    setLocalError(
                      error instanceof Error ? error.message : "请求失败",
                    );
                  }
                }}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  读取轻量列表
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setOutput(JSON.stringify(tips.data ?? {}, null, 2))
                }
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  查看提示信息
                </Text>
              </Pressable>
            </View>
            {typeof tips.data?.version === "string" ? (
              <Pressable
                onPress={() =>
                  mutation.mutate({
                    type: "mark-tip",
                    version: String(tips.data?.version),
                  })
                }
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  标记当前提示为已读
                </Text>
              </Pressable>
            ) : null}
          </Panel>
          <Panel>
            <Text style={{ color: colors.text, fontWeight: "700" }}>
              轻面板配置模板
            </Text>
            <Pressable
              onPress={() =>
                setEditor({
                  type: "template",
                  title: "请求轻面板配置模板",
                  value: {},
                })
              }
              style={{
                height: 40,
                borderRadius: 8,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                填写请求参数
              </Text>
            </Pressable>
          </Panel>
          {output ? (
            <Panel>
              <Text
                selectable
                style={{
                  color: colors.text,
                  fontFamily: "monospace",
                  fontSize: 10,
                  lineHeight: 16,
                }}
              >
                {output}
              </Text>
            </Panel>
          ) : null}
        </>
      ) : null}

      {editor ? (
        <WebServiceEditor
          key={`${editor.type}-${editor.key ?? "new"}`}
          editor={editor}
          busy={mutation.isPending}
          onClose={() => setEditor(undefined)}
          onSave={(value) => mutation.mutate({ type: "save", editor, value })}
        />
      ) : null}
      {folderTarget ? (
        <Modal transparent animationType="fade" onRequestClose={() => setFolderTarget(undefined)}>
          <SafeAreaView
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.42)",
              justifyContent: "center",
              padding: 22,
            }}
          >
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 8,
                padding: 18,
                gap: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <FolderUp color={colors.warning} size={20} />
                <Text style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: "800" }}>
                  更新文件服务目录
                </Text>
              </View>
              <View style={{ gap: 7 }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
                  挂载项索引
                </Text>
                <TextInput
                  value={mountIndex}
                  onChangeText={setMountIndex}
                  keyboardType="number-pad"
                  style={{
                    height: 44,
                    borderRadius: 8,
                    backgroundColor: colors.mutedCard,
                    color: colors.text,
                    paddingHorizontal: 12,
                  }}
                />
              </View>
              <Text style={{ color: colors.subtext, fontSize: 11, lineHeight: 17 }}>
                选择包含单个根目录的 ZIP、TAR 或 TAR.GZ 文件。上传后会再次确认才应用更新。
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  disabled={uploadBusy}
                  onPress={() => setFolderTarget(undefined)}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: "700" }}>取消</Text>
                </Pressable>
                <Pressable
                  disabled={uploadBusy}
                  onPress={uploadFolderUpdate}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 8,
                    backgroundColor: uploadBusy ? colors.disabled : colors.primary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "800" }}>
                    {uploadBusy ? "上传中" : "选择文件"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
    </Page>
  );
}
