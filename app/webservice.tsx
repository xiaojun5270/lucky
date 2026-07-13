import * as DocumentPicker from "expo-document-picker";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCog,
  FolderUp,
  FolderTree,
  Globe2,
  Minus,
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
  X,
} from "lucide-react-native";
import { type ReactNode, useState } from "react";
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
  FullScreenSafeArea,
  IconTile,
  Page,
  Panel,
  SectionHeader,
} from "@/src/components/lucky-ui";
import { StructuredDataView, StructuredForm } from "@/src/components/structured-form";
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
  getWebServiceCorazaInstances,
  getWebServiceGroups,
  getWebServiceGroupOptions,
  getWebServiceIpFilterRules,
  getWebServiceLastLogs,
  getWebServiceRule,
  getWebServiceRuleLastLogs,
  getWebServiceRules,
  getWebServiceSettings,
  getWebServiceTipInfo,
  markWebServiceTipRead,
  newWebServiceCgi,
  newWebServiceDefaultProxy,
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
  ruleMode?: string;
  tlsEnabled?: boolean;
};
type SelectOption = { label: string; value: string };
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

const webServiceTypeOptions: SelectOption[] = [
  { label: "反向代理", value: "reverseproxy" },
  { label: "重定向", value: "redirect" },
  { label: "URL 跳转", value: "url" },
];

const tlsOnlyWebServiceTypes = new Set(["SNIRouting", "oauth"]);

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

function object(value: unknown): LuckyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LuckyRecord)
    : {};
}

function cleanLines(value: unknown) {
  const lines = Array.isArray(value)
    ? value.map(String)
    : String(value ?? "").split(/\r?\n/);
  return lines.map((item) => item.trim()).filter(Boolean);
}

let webRuleDraftSequence = 0;

function nextWebRuleDraftId() {
  webRuleDraftSequence += 1;
  return `web-rule-draft-${webRuleDraftSequence}`;
}

function normalizeWebProxy(value: unknown, defaults: LuckyRecord): LuckyRecord {
  const source = object(value);
  const serviceType = source.WebServiceType ?? defaults.WebServiceType;
  const legacyBasicAuth =
    source.BasicAuthUser || source.BasicAuthPasswd
      ? `${String(source.BasicAuthUser ?? "")}:${String(source.BasicAuthPasswd ?? "")}`
      : undefined;
  const currentBasicAuth = String(source.BasicAuthUserList ?? "").trim();
  const sourceOtherParams = object(source.OtherParams);
  const defaultOtherParams = object(defaults.OtherParams);
  const next: LuckyRecord = {
    ...defaults,
    ...source,
    GroupKey:
      source.GroupKey === "default"
        ? ""
        : source.GroupKey ?? defaults.GroupKey ?? "",
    WebServiceType: serviceType === "fileserver" ? "fileServer" : serviceType,
    CorazaWAFInstance: String(
      source.CorazaWAFInstance ||
        source.CorazaWAFKey ||
        defaults.CorazaWAFInstance ||
        "",
    ),
    AutoProxyLocation:
      source.AutoProxyLocation === true || source.AutoRedirect === true
        ? true
        : defaults.AutoProxyLocation ?? false,
    BasicAuthUserList:
      (currentBasicAuth || legacyBasicAuth) ??
      defaults.BasicAuthUserList ??
      "",
    OtherParams: {
      ...defaultOtherParams,
      ...sourceOtherParams,
      WebAuth:
        sourceOtherParams.WebAuth === true || source.EnableWebAuth === true
          ? true
          : defaultOtherParams.WebAuth ?? false,
    },
  };
  delete next.DiaglogShowMode;
  delete next.CorazaWAFKey;
  delete next.AutoRedirect;
  delete next.BasicAuthUser;
  delete next.BasicAuthPasswd;
  delete next.EnableWebAuth;
  return next;
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
  serverError,
  groupOptions,
  ipFilterOptions,
  wafOptions,
  onClose,
  onSave,
}: {
  editor: EditorState;
  busy: boolean;
  serverError?: string;
  groupOptions: SelectOption[];
  ipFilterOptions: SelectOption[];
  wafOptions: SelectOption[];
  onClose: () => void;
  onSave: (value: LuckyRecord) => void;
}) {
  const colors = useAppTheme();
  const [value, setValue] = useState(() => {
    const initial = clone(editor.value);
    if (editor.type === "subrule")
      return normalizeWebProxy(initial, newWebServiceSubRule());
    if (editor.type !== "rule") return initial;
    const defaults = newWebServiceRule();
    const next: LuckyRecord = {
      ...defaults,
      ...initial,
      DiaglogShowMode:
        initial.DiaglogShowMode === "full"
          ? "diy"
          : initial.DiaglogShowMode ?? defaults.DiaglogShowMode,
      CorazaWAFInstance:
        String(
          initial.CorazaWAFInstance ||
            initial.CorazaWAFKey ||
            defaults.CorazaWAFInstance ||
            "",
        ),
      DefaultProxy: normalizeWebProxy(
        initial.DefaultProxy,
        object(defaults.DefaultProxy),
      ),
      ProxyList: array(initial, ["ProxyList"]).map((item) =>
        normalizeWebProxy(item, newWebServiceSubRule()),
      ),
    };
    delete next.CorazaWAFKey;
    return next;
  });
  const [proxyDraftIds, setProxyDraftIds] = useState(() =>
    array(value, ["ProxyList"]).map(() => nextWebRuleDraftId()),
  );
  const [expandedProxyId, setExpandedProxyId] = useState("");
  const [openSelect, setOpenSelect] = useState("");
  const [formError, setFormError] = useState("");

  function update(key: string, next: unknown) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  function updateDefaultProxy(key: string, next: unknown) {
    setValue((current) => ({
      ...current,
      DefaultProxy: {
        ...newWebServiceDefaultProxy(),
        ...object(current.DefaultProxy),
        [key]: next,
      },
    }));
  }

  function updateProxy(index: number, key: string, next: unknown) {
    setValue((current) => ({
      ...current,
      ProxyList: array(current, ["ProxyList"]).map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: next } : item,
      ),
    }));
  }

  function addProxy() {
    const draftId = nextWebRuleDraftId();
    setValue((current) => ({
      ...current,
      ProxyList: [
        ...array(current, ["ProxyList"]),
        newWebServiceSubRule(),
      ],
    }));
    setProxyDraftIds((current) => [...current, draftId]);
    setExpandedProxyId(draftId);
  }

  function removeProxy(index: number, draftId: string) {
    const item = array(value, ["ProxyList"])[index];
    const name = pick(item ?? {}, ["Remark"], `子规则 ${index + 1}`);
    Alert.alert("移除子规则", `确定从当前规则中移除“${name}”吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "移除",
        style: "destructive",
        onPress: () => {
          setValue((current) => ({
            ...current,
            ProxyList: array(current, ["ProxyList"]).filter(
              (_, itemIndex) => itemIndex !== index,
            ),
          }));
          setProxyDraftIds((current) =>
            current.filter((_, itemIndex) => itemIndex !== index),
          );
          if (expandedProxyId === draftId) setExpandedProxyId("");
        },
      },
    ]);
  }

  function applyWafToAllProxies() {
    setValue((current) => {
      const wafInstance = String(current.CorazaWAFInstance ?? "");
      return {
        ...current,
        DefaultProxy: {
          ...newWebServiceDefaultProxy(),
          ...object(current.DefaultProxy),
          CorazaWAFInstance: wafInstance,
        },
        ProxyList: array(current, ["ProxyList"]).map((item) => ({
          ...item,
          CorazaWAFInstance: wafInstance,
        })),
      };
    });
  }

  function toggleListenType(type: "tcp4" | "tcp6") {
    const network = String(value.Network ?? "tcp6");
    let ipv4 = network === "tcp" || network === "tcp4";
    let ipv6 = network === "tcp" || network === "tcp6";
    if (type === "tcp4") ipv4 = !ipv4;
    else ipv6 = !ipv6;
    if (!ipv4 && !ipv6) return;
    update("Network", ipv4 && ipv6 ? "tcp" : ipv4 ? "tcp4" : "tcp6");
  }

  function normalizeProxy(
    item: LuckyRecord,
    label: string,
  ): LuckyRecord | undefined {
    const canonical = normalizeWebProxy(item, newWebServiceSubRule());
    const domains = cleanLines(canonical.Domains);
    const locations = cleanLines(canonical.Locations);
    if (!domains.length) {
      setFormError(`${label}至少需要一个前端地址`);
      return undefined;
    }
    if (
      ["reverseproxy", "redirect", "url"].includes(
        String(canonical.WebServiceType ?? ""),
      ) && !locations.length
    ) {
      setFormError(`${label}必须填写目标地址`);
      return undefined;
    }
    if (
      !canonical.UseRuleGlobalAuthSettings &&
      canonical.EnableBasicAuth &&
      !String(canonical.BasicAuthUserList ?? "").trim()
    ) {
      setFormError(`${label}启用 Basic 认证后必须填写认证用户`);
      return undefined;
    }
    return { ...canonical, Domains: domains, Locations: locations };
  }

  function save() {
    let nextValue = value;
    if (editor.type === "subrule") {
      const normalized = normalizeProxy(value, "子规则");
      if (!normalized) return;
      if (
        !editor.tlsEnabled &&
        tlsOnlyWebServiceTypes.has(String(normalized.WebServiceType ?? ""))
      ) {
        setFormError("当前服务类型需要先在主规则中启用 TLS");
        return;
      }
      nextValue = normalized;
    }
    if (editor.type === "rule") {
      const network = String(value.Network ?? "");
      const port = Number(value.ListenPort);
      const tlsMinVersion = Number(value.TLSMinVersion);
      if (!["tcp", "tcp4", "tcp6"].includes(network)) {
        setFormError("请选择至少一种监听类型");
        return;
      }
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        setFormError("监听端口必须在 1 到 65535 之间");
        return;
      }
      if (
        value.EnableTLS &&
        (!Number.isInteger(tlsMinVersion) || tlsMinVersion < 0 || tlsMinVersion > 3)
      ) {
        setFormError("请选择有效的 TLS 最低版本");
        return;
      }
      const defaultProxy = normalizeWebProxy(
        value.DefaultProxy,
        newWebServiceDefaultProxy(),
      );
      if (
        !value.EnableTLS &&
        tlsOnlyWebServiceTypes.has(String(defaultProxy.WebServiceType ?? ""))
      ) {
        setFormError("默认规则的当前服务类型需要启用 TLS");
        return;
      }
      if (
        ["redirect", "url"].includes(String(defaultProxy.WebServiceType ?? "")) &&
        !cleanLines(defaultProxy.Locations).length
      ) {
        setFormError("默认规则使用跳转服务时必须填写目标地址");
        return;
      }
      if (
        !defaultProxy.UseRuleGlobalAuthSettings &&
        defaultProxy.EnableBasicAuth &&
        !String(defaultProxy.BasicAuthUserList ?? "").trim()
      ) {
        setFormError("默认规则启用 Basic 认证后必须填写认证用户");
        return;
      }
      const proxies: LuckyRecord[] = [];
      for (const [index, item] of array(value, ["ProxyList"]).entries()) {
        const normalized = normalizeProxy(item, `子规则 ${index + 1} `);
        if (!normalized) return;
        if (
          !value.EnableTLS &&
          tlsOnlyWebServiceTypes.has(String(normalized.WebServiceType ?? ""))
        ) {
          setFormError(`子规则 ${index + 1} 的当前服务类型需要启用 TLS`);
          return;
        }
        proxies.push(normalized);
      }
      nextValue = {
        ...value,
        Network: network,
        ListenPort: port,
        TLSMinVersion: tlsMinVersion,
        DefaultProxy: {
          ...defaultProxy,
          Locations: cleanLines(defaultProxy.Locations),
        },
        ProxyList: proxies,
      };
    }
    setFormError("");
    onSave(nextValue);
  }

  function Field({
    label,
    field,
    data,
    onUpdate,
    multiline = false,
    numeric = false,
    readOnly = false,
    secret = false,
    hint,
    placeholder,
  }: {
    label: string;
    field: string;
    data?: LuckyRecord;
    onUpdate?: (field: string, next: unknown) => void;
    multiline?: boolean;
    numeric?: boolean;
    readOnly?: boolean;
    secret?: boolean;
    hint?: string;
    placeholder?: string;
  }) {
    const source = data ?? value;
    const write = onUpdate ?? update;
    const current = Array.isArray(source[field])
      ? (source[field] as unknown[]).join("\n")
      : String(source[field] ?? "");
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
          {label}
        </Text>
        <TextInput
          value={current}
          editable={!readOnly}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType={numeric ? "numeric" : "default"}
          secureTextEntry={secret}
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical={multiline ? "top" : "center"}
          onChangeText={(next) => {
            if (Array.isArray(source[field])) {
              write(field, next.split(/\r?\n/));
            } else if (numeric) {
              write(field, Number.parseInt(next, 10) || 0);
            } else write(field, next);
          }}
          style={{
            minHeight: multiline ? 92 : 44,
            borderRadius: 12,
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

  function Toggle({
    label,
    field,
    data,
    onUpdate,
  }: {
    label: string;
    field: string;
    data?: LuckyRecord;
    onUpdate?: (field: string, next: unknown) => void;
  }) {
    const source = data ?? value;
    const write = onUpdate ?? update;
    return (
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" }}>
          {label}
        </Text>
        <Switch
          value={Boolean(source[field])}
          onValueChange={(next) => write(field, next)}
          trackColor={{ false: colors.disabled, true: colors.primary }}
        />
      </View>
    );
  }

  function Choices({
    label,
    field,
    options,
    data,
    onUpdate,
  }: {
    label: string;
    field: string;
    options: Array<string | SelectOption>;
    data?: LuckyRecord;
    onUpdate?: (field: string, next: unknown) => void;
  }) {
    const source = data ?? value;
    const write = onUpdate ?? update;
    return (
      <View style={{ gap: 7 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {options.map((item) => {
            const option = typeof item === "string" ? { label: item, value: item } : item;
            const selected = String(source[field] ?? "") === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => write(field, option.value)}
                style={{
                  minWidth: 76,
                  height: 38,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primarySoft : colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: selected ? colors.primary : colors.text, fontWeight: "700", fontSize: 12 }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  function SelectField({
    label,
    field,
    options,
    data,
    onUpdate,
    scope = "root",
  }: {
    label: string;
    field: string;
    options: SelectOption[];
    data?: LuckyRecord;
    onUpdate?: (field: string, next: unknown) => void;
    scope?: string;
  }) {
    const source = data ?? value;
    const write = onUpdate ?? update;
    const selectKey = `${scope}.${field}`;
    const current = String(source[field] ?? "");
    const selected = options.find((option) => option.value === current);
    const selectedLabel = selected?.label ?? (current || "请选择");
    const open = openSelect === selectKey;
    return <View style={{ gap: 7 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{label}</Text>
      <Pressable onPress={() => setOpenSelect(open ? "" : selectKey)} style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: open ? colors.primary : colors.border, backgroundColor: colors.card, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: current ? colors.text : colors.placeholder, fontSize: 13 }}>{selectedLabel}</Text>
        <ChevronDown color={open ? colors.primary : colors.subtext} size={17} />
      </Pressable>
      {open ? <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, overflow: "hidden" }}>
        {options.map((option, index) => {
          const active = option.value === current;
          return <Pressable key={option.value || "empty"} onPress={() => { write(field, option.value); setOpenSelect(""); }} style={{ minHeight: 42, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, backgroundColor: active ? colors.primarySoft : colors.card }}>
            <Text style={{ flex: 1, color: active ? colors.primary : colors.text, fontSize: 13, fontWeight: active ? "700" : "500" }}>{option.label}</Text>
            {active ? <Check color={colors.primary} size={16} /> : null}
          </Pressable>;
        })}
      </View> : null}
    </View>;
  }

  function ListenTypeSelector() {
    const network = String(value.Network ?? "tcp6");
    const options = [
      { label: "IPv4", value: "tcp4", selected: network === "tcp" || network === "tcp4" },
      { label: "IPv6", value: "tcp6", selected: network === "tcp" || network === "tcp6" },
    ] as const;
    return <View style={{ gap: 7 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>监听类型</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {options.map((option) => <Pressable
          key={option.value}
          onPress={() => toggleListenType(option.value)}
          style={{
            flex: 1,
            height: 42,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: option.selected ? colors.primary : colors.border,
            backgroundColor: option.selected ? colors.primarySoft : colors.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
          }}
        >
          <View style={{ width: 18, height: 18, borderRadius: 6, borderWidth: 1, borderColor: option.selected ? colors.primary : colors.border, backgroundColor: option.selected ? colors.primary : colors.card, alignItems: "center", justifyContent: "center" }}>
            {option.selected ? <Check color="#fff" size={12} strokeWidth={3} /> : null}
          </View>
          <Text style={{ color: option.selected ? colors.primary : colors.text, fontSize: 13, fontWeight: "700" }}>{option.label}</Text>
        </Pressable>)}
      </View>
    </View>;
  }

  function PortStepper() {
    const raw = String(value.ListenPort ?? "");
    const parsed = Number.parseInt(raw, 10);
    function step(offset: number) {
      const current = Number.isInteger(parsed) && parsed > 0 ? parsed : 16666;
      update("ListenPort", Math.min(65535, Math.max(1, current + offset)));
    }
    return <View style={{ gap: 7 }}>
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>监听端口</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityLabel="减少端口" onPress={() => step(-1)} style={{ width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}>
          <Minus color={colors.primary} size={18} />
        </Pressable>
        <TextInput
          value={raw}
          onChangeText={(next) => update("ListenPort", next.replace(/\D/g, ""))}
          keyboardType="number-pad"
          maxLength={5}
          selectTextOnFocus
          style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, textAlign: "center", fontSize: 14, fontWeight: "700" }}
        />
        <Pressable accessibilityLabel="增加端口" onPress={() => step(1)} style={{ width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" }}>
          <Plus color={colors.primary} size={18} />
        </Pressable>
      </View>
    </View>;
  }

  function FormSection({
    title,
    icon: Icon,
    meta,
    children,
  }: {
    title: string;
    icon?: typeof Pencil;
    meta?: string;
    children: ReactNode;
  }) {
    return <View style={{ gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard }}>
      <View style={{ minHeight: 26, flexDirection: "row", alignItems: "center", gap: 8 }}>
        {Icon ? <Icon color={colors.primary} size={17} /> : null}
        <Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" }}>{title}</Text>
        {meta ? <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "600" }}>{meta}</Text> : null}
      </View>
      {children}
    </View>;
  }

  function SecurityFields({
    data,
    onUpdate,
    scope,
    showIpFilter = true,
  }: {
    data: LuckyRecord;
    onUpdate: (field: string, next: unknown) => void;
    scope: string;
    showIpFilter?: boolean;
  }) {
    const otherParams = object(data.OtherParams);
    const useGlobalAuth = Boolean(data.UseRuleGlobalAuthSettings);
    const updateOtherParam = (field: string, next: unknown) =>
      onUpdate("OtherParams", { ...otherParams, [field]: next });
    return <>
      {Toggle({ label: "使用规则全局认证设置", field: "UseRuleGlobalAuthSettings", data, onUpdate })}
      {!useGlobalAuth ? <>
        {Toggle({ label: "Basic 认证", field: "EnableBasicAuth", data, onUpdate })}
        {Boolean(data.EnableBasicAuth)
          ? Field({ label: "Basic 认证用户", field: "BasicAuthUserList", data, onUpdate, multiline: true, hint: "每行填写一组 用户名:密码" })
          : null}
        {Toggle({ label: "网页认证", field: "WebAuth", data: otherParams, onUpdate: updateOtherParam })}
      </> : null}
      {showIpFilter ? SelectField({ label: "IP 过滤规则", field: "SafeIPMode", data, onUpdate, scope, options: ipFilterOptions }) : null}
    </>;
  }

  function SubRuleFields({
    data,
    onUpdate,
    scope,
    ruleMode,
    tlsEnabled,
  }: {
    data: LuckyRecord;
    onUpdate: (field: string, next: unknown) => void;
    scope: string;
    ruleMode: string;
    tlsEnabled: boolean;
  }) {
    const availableServiceTypes = webServiceTypeOptions.filter(
      (option) =>
        tlsEnabled ||
        !tlsOnlyWebServiceTypes.has(option.value) ||
        option.value === data.WebServiceType,
    );
    return <>
      {Field({ label: "子规则名称", field: "Remark", data, onUpdate, placeholder: "可留空" })}
      {Toggle({ label: "子规则开关", field: "Enable", data, onUpdate })}
      {SelectField({ label: "分组", field: "GroupKey", data, onUpdate, scope, options: groupOptions })}
      {SelectField({ label: "服务类型", field: "WebServiceType", data, onUpdate, scope, options: availableServiceTypes })}
      {Field({ label: "前端地址", field: "Domains", data, onUpdate, multiline: true, hint: "每行填写一个域名或访问地址" })}
      {Field({ label: data.WebServiceType === "reverseproxy" ? "后端地址" : "目标地址", field: "Locations", data, onUpdate, multiline: true, hint: "每行填写一个地址" })}
      {SelectField({ label: "CorazaWAF", field: "CorazaWAFInstance", data, onUpdate, scope, options: [
        { label: "跟随主规则", value: "main" },
        ...wafOptions.filter((option) => option.value !== "main"),
      ] })}
      {Toggle({ label: "万事大吉", field: "EasyLucky", data, onUpdate })}
      {Toggle({ label: "忽略后端 TLS 证书验证", field: "LocationInsecureSkipVerify", data, onUpdate })}
      {Toggle({ label: "使用目标地址 Host 请求头", field: "UseTargetHost", data, onUpdate })}
      {Toggle({ label: "自动反代重定向", field: "AutoProxyLocation", data, onUpdate })}
      {ruleMode === "diy" && Boolean(data.AutoProxyLocation)
        ? Toggle({ label: "不同 Host 也自动改写重定向", field: "AutoProxyLocationWithoutSameHost", data, onUpdate })
        : null}
      {Toggle({ label: "记录访问日志", field: "EnableAccessLog", data, onUpdate })}
    </>;
  }

  function form() {
    if (editor.type === "rule") {
      const defaultProxy = {
        ...newWebServiceDefaultProxy(),
        ...object(value.DefaultProxy),
      };
      const proxies = array(value, ["ProxyList"]);
      const diyMode = value.DiaglogShowMode === "diy";
      const availableServiceTypes = webServiceTypeOptions.filter(
        (option) =>
          Boolean(value.EnableTLS) ||
          !tlsOnlyWebServiceTypes.has(option.value) ||
          option.value === defaultProxy.WebServiceType,
      );
      return <>
        {FormSection({ title: "规则设置", icon: Settings2, children: <>
          {Field({ label: "Web 服务规则名称", field: "RuleName", placeholder: "可留空" })}
          {Toggle({ label: "规则开关", field: "Enable" })}
          {Choices({ label: "操作模式", field: "DiaglogShowMode", options: [
            { label: "简易模式", value: "simple" },
            { label: "定制模式", value: "diy" },
          ] })}
          {ListenTypeSelector()}
          {diyMode ? Field({ label: "监听地址", field: "ListenIP", hint: "没有特殊需求可留空" }) : null}
          {PortStepper()}
          {SelectField({ label: "IP 过滤规则", field: "IPFilterRule", options: ipFilterOptions })}
          {Toggle({ label: "自动放行防火墙", field: "AutoOptionsFirewall" })}
          {Toggle({ label: "TLS", field: "EnableTLS" })}
          {Boolean(value.EnableTLS) ? <>
            {Choices({ label: "TLS 最低版本", field: "TLSMinVersion", options: [
              { label: "TLS 1.0", value: "0" },
              { label: "TLS 1.1", value: "1" },
              { label: "TLS 1.2", value: "2" },
              { label: "TLS 1.3", value: "3" },
            ] })}
            {diyMode ? Toggle({ label: "启用 HTTP/3", field: "Http3" }) : null}
          </> : null}
          {diyMode ? Field({ label: "最大请求头 (KB)", field: "MaxHeaderKBytes", numeric: true }) : null}
          {SelectField({ label: "CorazaWAF", field: "CorazaWAFInstance", options: wafOptions })}
          <Pressable
            onPress={applyWafToAllProxies}
            style={{ height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}
          >
            <ShieldCheck color={colors.primary} size={17} />
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>应用到所有子规则</Text>
          </Pressable>
        </> })}

        {FormSection({ title: "默认规则", icon: Globe2, children: <>
          {SelectField({ label: "分组", field: "GroupKey", data: defaultProxy, onUpdate: updateDefaultProxy, scope: "default", options: groupOptions })}
          {SelectField({ label: "服务类型", field: "WebServiceType", data: defaultProxy, onUpdate: updateDefaultProxy, scope: "default", options: availableServiceTypes })}
          {Field({
            label: defaultProxy.WebServiceType === "reverseproxy" ? "默认目标地址" : "跳转目标地址",
            field: "Locations",
            data: defaultProxy,
            onUpdate: updateDefaultProxy,
            multiline: true,
            placeholder: defaultProxy.WebServiceType === "reverseproxy" ? "没有特殊需求可留空" : "请填写跳转目标地址",
            hint: defaultProxy.WebServiceType === "reverseproxy" ? "每行填写一个地址，多行时依次负载均衡" : undefined,
          })}
          {SelectField({ label: "CorazaWAF", field: "CorazaWAFInstance", data: defaultProxy, onUpdate: updateDefaultProxy, scope: "default", options: [
            { label: "跟随主规则", value: "main" },
            ...wafOptions.filter((option) => option.value !== "main"),
          ] })}
          {Toggle({ label: "万事大吉", field: "EasyLucky", data: defaultProxy, onUpdate: updateDefaultProxy })}
          {Toggle({ label: "忽略后端 TLS 证书验证", field: "LocationInsecureSkipVerify", data: defaultProxy, onUpdate: updateDefaultProxy })}
          {Toggle({ label: "使用目标地址 Host 请求头", field: "UseTargetHost", data: defaultProxy, onUpdate: updateDefaultProxy })}
          {Toggle({ label: "自动反代重定向", field: "AutoProxyLocation", data: defaultProxy, onUpdate: updateDefaultProxy })}
          {diyMode && Boolean(defaultProxy.AutoProxyLocation)
            ? Toggle({ label: "不同 Host 也自动改写重定向", field: "AutoProxyLocationWithoutSameHost", data: defaultProxy, onUpdate: updateDefaultProxy })
            : null}
          {Toggle({ label: "记录访问日志", field: "EnableAccessLog", data: defaultProxy, onUpdate: updateDefaultProxy })}
          <View style={{ height: 1, backgroundColor: colors.rowBorder, marginVertical: 2 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <ShieldCheck color={colors.primary} size={16} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>安全设置</Text>
          </View>
          {SecurityFields({ data: defaultProxy, onUpdate: updateDefaultProxy, scope: "default-security", showIpFilter: diyMode || defaultProxy.WebServiceType === "SNIRouting" })}
        </> })}

        <View style={{ gap: 10 }}>
          <View style={{ minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Route color={colors.primary} size={18} />
            <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: "800" }}>子规则</Text>
            <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "600" }}>{proxies.length} 项</Text>
          </View>
          {proxies.map((proxy, index) => {
            const draftId = proxyDraftIds[index] ?? `proxy-${index}`;
            const open = expandedProxyId === draftId;
            const title = pick(proxy, ["Remark"], `子规则 ${index + 1}`) || `子规则 ${index + 1}`;
            const domain = cleanLines(proxy.Domains)[0] ?? "未填写前端地址";
            const write = (field: string, next: unknown) => updateProxy(index, field, next);
            return <View key={draftId} style={{ borderRadius: 14, borderWidth: 1, borderColor: open ? colors.primary : colors.border, backgroundColor: colors.card, padding: 12, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable onPress={() => setExpandedProxyId(open ? "" : draftId)} style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                    <Network color={colors.primary} size={17} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{title}</Text>
                    <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>{domain}</Text>
                  </View>
                  {open ? <ChevronUp color={colors.subtext} size={17} /> : <ChevronDown color={colors.subtext} size={17} />}
                </Pressable>
                <IconButton icon={Pencil} label={`编辑${title}`} color={colors.primary} onPress={() => setExpandedProxyId(draftId)} />
                <IconButton icon={Trash2} label={`移除${title}`} color={colors.danger} onPress={() => removeProxy(index, draftId)} />
              </View>
              {open ? <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingTop: 12 }}>
                {SubRuleFields({ data: proxy, onUpdate: write, scope: draftId, ruleMode: String(value.DiaglogShowMode ?? "simple"), tlsEnabled: Boolean(value.EnableTLS) })}
                <View style={{ height: 1, backgroundColor: colors.rowBorder, marginVertical: 2 }} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <ShieldCheck color={colors.primary} size={16} />
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>安全设置</Text>
                </View>
                {SecurityFields({ data: proxy, onUpdate: write, scope: `${draftId}-security`, showIpFilter: diyMode || proxy.WebServiceType === "SNIRouting" })}
              </View> : null}
            </View>;
          })}
          <Pressable onPress={addProxy} style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <Plus color={colors.primary} size={17} />
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>添加子规则</Text>
          </Pressable>
        </View>
      </>;
    }
    if (editor.type === "subrule") return (
      <>
        {FormSection({ title: "基础设置", icon: Network, children: SubRuleFields({ data: value, onUpdate: update, scope: "subrule", ruleMode: editor.ruleMode ?? "simple", tlsEnabled: Boolean(editor.tlsEnabled) }) })}
        {FormSection({ title: "安全设置", icon: ShieldCheck, children: SecurityFields({ data: value, onUpdate: update, scope: "subrule-security", showIpFilter: editor.ruleMode === "diy" || value.WebServiceType === "SNIRouting" }) })}
      </>
    );
    if (editor.type === "group") return (
      <>
        {Field({ label: "分组名称", field: "Name" })}
        {editor.key ? Field({ label: "分组 Key", field: "Key", readOnly: true }) : null}
      </>
    );
    if (editor.type === "cgi") return (
      <>
        {Field({ label: "实例名称", field: "Name" })}
        {Toggle({ label: "启用 CGI", field: "Enable" })}
        {Choices({ label: "CGI 类型", field: "CGIType", options: ["php", "fastcgi"] })}
        {Choices({ label: "网络协议", field: "Network", options: ["tcp", "tcp4", "tcp6", "unix"] })}
        {Field({ label: "服务地址", field: "Address", hint: "例如 127.0.0.1:9000" })}
        {Field({ label: "最大连接数", field: "MaxConns", numeric: true })}
        {Field({ label: "连接超时（秒）", field: "ConnectTimeout", numeric: true })}
        {Field({ label: "默认文档根目录", field: "DefaultDocRoot" })}
        {Field({ label: "默认首页", field: "DefaultIndexNames", multiline: true, hint: "每行一个文件名" })}
        {Field({ label: "文件扩展名", field: "FileExtensions" })}
        {Field({ label: "禁止访问路径", field: "ForbiddenPaths", multiline: true })}
      </>
    );
    return <StructuredForm value={value} onChange={setValue} />;
  }

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <FullScreenSafeArea
        style={{
          flex: 1,
          backgroundColor: colors.card,
        }}
      >
        <View
          style={{
            flex: 1,
            width: "100%",
            backgroundColor: colors.card,
            padding: 18,
            gap: 13,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <IconTile icon={FileCog} size={36} iconSize={18} />
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
            <Pressable accessibilityLabel="关闭" onPress={onClose} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}>
              <X color={colors.subtext} size={18} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 13, paddingBottom: 4 }}
            style={{ flex: 1 }}
          >
            {form()}
          </ScrollView>
          {formError ? <ErrorState message={formError} /> : null}
          {!formError && serverError ? <ErrorState message={serverError} /> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable disabled={busy} onPress={onClose} style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.subtext, fontWeight: "700" }}>取消</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={save} style={{ flex: 1.4, minHeight: 48, borderRadius: 12, backgroundColor: busy ? colors.disabled : colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
              <Save color="#fff" size={17} />
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {busy ? "保存中" : editor.type === "subrule" ? (editor.key ? "保存子规则" : "添加子规则") : "保存配置"}
              </Text>
            </Pressable>
          </View>
        </View>
      </FullScreenSafeArea>
    </Modal>
  );
}

export default function WebServiceScreen() {
  const colors = useAppTheme();
  const [view, setView] = useState<ViewKey>("rules");
  const [expanded, setExpanded] = useState("");
  const [editor, setEditor] = useState<EditorState>();
  const [output, setOutput] = useState<unknown>("");
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
  const subRuleGroups = useQuery({
    queryKey: ["webservice", "subrule-group-options"],
    queryFn: getWebServiceGroupOptions,
    enabled: editor?.type === "subrule" || editor?.type === "rule",
  });
  const wafInstances = useQuery({
    queryKey: ["webservice", "coraza-instances"],
    queryFn: getWebServiceCorazaInstances,
    enabled: editor?.type === "subrule" || editor?.type === "rule",
  });
  const ipFilterRules = useQuery({
    queryKey: ["webservice", "ip-filter-rules"],
    queryFn: getWebServiceIpFilterRules,
    enabled: editor?.type === "subrule" || editor?.type === "rule",
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
        setOutput(result);
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
        ruleMode:
          rule.DiaglogShowMode === "full"
            ? "diy"
            : String(rule.DiaglogShowMode ?? "simple"),
        tlsEnabled: Boolean(rule.EnableTLS),
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
      setOutput(value);
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
      setOutput(result);
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
  const ipFilterNames: Record<string, string> = {
    disable: "停用",
    blacklist: "黑名单",
    whitelist: "白名单",
    globalblacklist: "全局黑名单",
  };
  const ipFilterOptionMap = new Map<string, SelectOption>(
    [["disable", { value: "disable", label: ipFilterNames.disable }]],
  );
  for (const [index, item] of (ipFilterRules.data ?? []).entries()) {
    const value = pick(item, ["Key", "key"]);
    if (!value) continue;
    ipFilterOptionMap.set(value, {
      value,
      label:
        ipFilterNames[value] ??
        pick(item, ["Name", "RuleName", "Remark"], `IP 规则 ${index + 1}`),
    });
  }
  const ipFilterOptions = [...ipFilterOptionMap.values()];

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
          {output ? <Panel><StructuredDataView value={output} /></Panel> : null}
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
                    setOutput(result.raw);
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
                  setOutput(tips.data ?? {})
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
          {output ? <Panel><StructuredDataView value={output} /></Panel> : null}
        </>
      ) : null}

      {editor ? (
        <WebServiceEditor
          key={`${editor.type}-${editor.key ?? "new"}`}
          editor={editor}
          busy={mutation.isPending}
          serverError={
            mutation.variables?.type === "save" &&
            mutation.variables.editor === editor
              ? mutation.error?.message
              : undefined
          }
          ipFilterOptions={ipFilterOptions}
          groupOptions={[
            { label: "未分组", value: "" },
            ...(subRuleGroups.data ?? []).map((item, index) => ({
              label: pick(item, ["Name", "GroupName", "Remark"], `分组 ${index + 1}`),
              value: keyOf(item, index),
            })),
          ]}
          wafOptions={[
            { label: "无", value: "" },
            ...(wafInstances.data ?? []).map((item, index) => ({
              label: pick(item, ["Name", "Remark"], `WAF ${index + 1}`),
              value: keyOf(item, index),
            })),
          ]}
          onClose={() => {
            mutation.reset();
            setEditor(undefined);
          }}
          onSave={(value) => mutation.mutate({ type: "save", editor, value })}
        />
      ) : null}
      {folderTarget ? (
        <Modal transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setFolderTarget(undefined)}>
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
                width: "100%",
                maxWidth: 520,
                alignSelf: "center",
                backgroundColor: colors.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 18,
                gap: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <IconTile icon={FolderUp} color={colors.warning} background={colors.warningBg} size={36} iconSize={18} />
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
                    borderRadius: 12,
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
                    borderRadius: 12,
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
                    borderRadius: 12,
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
