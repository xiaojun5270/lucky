import * as DocumentPicker from "expo-document-picker";
import * as Clipboard from "expo-clipboard";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCog,
  FolderUp,
  FolderTree,
  Globe2,
  ListTree,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Network,
  Pencil,
  Plus,
  Route,
  Save,
  ScrollText,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
  Workflow,
  Wrench,
  X,
} from "lucide-react-native";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  ResponsiveTabBar,
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
  disconnectWebServiceClient,
  flushWebServiceCache,
  getLightPanelConfigTemplate,
  getWebServiceAccessDetails,
  getWebServiceCgiList,
  getWebServiceCorazaLogs,
  getWebServiceCorazaInstances,
  getWebServiceGroups,
  getWebServiceGroupOptions,
  getWebServiceIpFilterRules,
  getWebServiceHttpLogs,
  getWebServiceLastLogs,
  getWebServiceLogs,
  getWebServiceRule,
  getWebServiceRuleLastLogs,
  getWebServiceRuleLogs,
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
type WebLogKind = "module" | "subrule" | "access" | "coraza" | "http";
type WebLogMode = "page" | "recent";
type WebLogTarget = {
  kind: WebLogKind;
  title: string;
  ruleKey?: string;
  subKey?: string;
};
type WebServiceToolsTarget = {
  ruleKey: string;
  ruleName: string;
  subKey?: string;
  subName?: string;
  fileService?: boolean;
};
type Action =
  | { type: "save"; editor: EditorState; value: LuckyRecord }
  | { type: "delete-rule" | "delete-group" | "delete-cgi"; key: string }
  | { type: "delete-subrule"; parentKey: string; key: string }
  | { type: "toggle-rule" | "toggle-cgi"; key: string; enabled: boolean }
  | { type: "toggle-subrule"; parentKey: string; key: string; enabled: boolean }
  | { type: "reorder-rules" | "reorder-groups"; keys: string[] }
  | { type: "reorder-group-subrules"; ruleKey: string; keys: string[] }
  | { type: "disconnect-client"; ruleKey: string; clientKey: string }
  | { type: "flush-cache"; ruleKey: string; subKey: string }
  | { type: "mark-tip"; version: string };

const WEB_LOG_PAGE_SIZE = 50;
const defaultWebLogTarget: WebLogTarget = {
  kind: "module",
  title: "Web 服务日志",
};

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
  return asBoolean(item.Enable ?? item.enable, true);
}

function asBoolean(value: unknown, fallback = false) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return fallback;
  if (value === false || value === 0) return false;
  if (typeof value === "string" && /^(?:false|0|off|no|disabled)$/i.test(value.trim())) return false;
  return true;
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

function StableNumberInput({ value, onChange }: { value: unknown; onChange: (value: number) => void }) {
  const colors = useAppTheme();
  const current = typeof value === "number" || typeof value === "string" ? String(value) : "";
  const [draft, setDraft] = useState(current);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(current);
  }, [current, focused]);
  function commit() {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed)) onChange(parsed);
    else setDraft(current);
    setFocused(false);
  }
  return <TextInput
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
    style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 12, paddingVertical: 8 }}
  />;
}

function cleanLines(value: unknown) {
  const lines = Array.isArray(value)
    ? value.map(String)
    : String(value ?? "").split(/\r?\n/);
  return lines.map((item) => item.trim()).filter(Boolean);
}

function buildSubRuleUrl(rule: LuckyRecord, subRule: LuckyRecord) {
  const domain = cleanLines(subRule.Domains)[0];
  if (!domain) return "";

  const scheme = asBoolean(rule.EnableTLS) ? "https" : "http";
  const schemeMatch = domain.match(/^([a-z][a-z\d+.-]*):\/\//i);
  if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) {
    throw new Error("前端地址格式不正确");
  }
  const address = schemeMatch
    ? domain.slice(schemeMatch[0].length)
    : domain.startsWith("//")
      ? domain.slice(2)
      : domain;
  if (!address || /^[/?#]/.test(address)) {
    throw new Error("前端地址格式不正确");
  }
  const candidate = `${scheme}://${address}`;
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("前端地址格式不正确");
  }

  const authorityStart = candidate.indexOf("//") + 2;
  const authorityEndMatch = candidate.slice(authorityStart).search(/[/?#]/);
  const authorityEnd =
    authorityEndMatch < 0
      ? candidate.length
      : authorityStart + authorityEndMatch;
  const authority = candidate.slice(authorityStart, authorityEnd);
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  const explicitPortMatch = host.startsWith("[")
    ? host.slice(host.indexOf("]") + 1).match(/^:(\d+)$/)
    : host.match(/:(\d+)$/);
  const explicitPort = explicitPortMatch?.[1];
  const listenPort = Number(rule.ListenPort);
  const defaultPort = parsed.protocol === "https:" ? 443 : 80;

  if (
    !explicitPort &&
    Number.isInteger(listenPort) &&
    listenPort > 0 &&
    listenPort <= 65535 &&
    listenPort !== defaultPort
  ) {
    parsed.port = String(listenPort);
  }
  const url = parsed.toString();
  if (!explicitPort || parsed.port) return url;

  const normalizedAuthorityStart = url.indexOf("//") + 2;
  const normalizedAuthorityEndMatch = url
    .slice(normalizedAuthorityStart)
    .search(/[/?#]/);
  const normalizedAuthorityEnd =
    normalizedAuthorityEndMatch < 0
      ? url.length
      : normalizedAuthorityStart + normalizedAuthorityEndMatch;
  return `${url.slice(0, normalizedAuthorityEnd)}:${explicitPort}${url.slice(normalizedAuthorityEnd)}`;
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
      asBoolean(source.AutoProxyLocation) || asBoolean(source.AutoRedirect)
        ? true
        : asBoolean(defaults.AutoProxyLocation),
    BasicAuthUserList:
      (currentBasicAuth || legacyBasicAuth) ??
      defaults.BasicAuthUserList ??
      "",
    OtherParams: {
      ...defaultOtherParams,
      ...sourceOtherParams,
      WebAuth:
        asBoolean(sourceOtherParams.WebAuth) || asBoolean(source.EnableWebAuth)
          ? true
          : asBoolean(defaultOtherParams.WebAuth),
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

function isRecordValue(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function entriesFromCandidate(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string")
    return value.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  return undefined;
}

function webLogEntries(value: unknown): unknown[] {
  const direct = entriesFromCandidate(value);
  if (direct) return direct;
  if (!isRecordValue(value)) return value === undefined || value === null ? [] : [value];

  const keys = [
    "accessDetails",
    "accessDetail",
    "clientList",
    "clients",
    "corazaLogs",
    "httpLogs",
    "logs",
    "lastLogs",
    "lastlogs",
    "rows",
    "items",
    "list",
    "text",
  ];
  for (const key of keys) {
    const entries = entriesFromCandidate(value[key]);
    if (entries) return entries;
  }
  for (const key of ["data", "result"]) {
    const nested = value[key];
    const entries = entriesFromCandidate(nested);
    if (entries) return entries;
    if (isRecordValue(nested)) {
      for (const nestedKey of keys) {
        const nestedEntries = entriesFromCandidate(nested[nestedKey]);
        if (nestedEntries) return nestedEntries;
      }
    }
  }
  const visible = Object.fromEntries(
    Object.entries(value).filter(([key]) => !["ret", "msg"].includes(key)),
  );
  return Object.keys(visible).length ? [visible] : [];
}

function webLogTotal(value: unknown) {
  for (const source of [value, isRecordValue(value) ? value.data : undefined, isRecordValue(value) ? value.result : undefined]) {
    if (!isRecordValue(source)) continue;
    for (const key of ["total", "Total", "totalCount", "TotalCount", "count", "Count"]) {
      const raw = source[key];
      const count = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(count) && count >= 0) return Math.trunc(count);
    }
  }
  return undefined;
}

function webServiceClientKey(value: unknown) {
  if (!isRecordValue(value)) return "";
  const explicit = pick(value, [
    "ClientKey",
    "clientKey",
    "ConnectionKey",
    "connectionKey",
    "ConnKey",
    "connKey",
  ]);
  if (explicit) return explicit;
  const looksLikeClient = [
    "ClientIP",
    "clientIP",
    "RemoteAddr",
    "remoteAddr",
    "RemoteIP",
    "remoteIP",
  ].some((key) => value[key] !== undefined);
  return looksLikeClient ? pick(value, ["Key", "key"]) : "";
}

function getWebLogPage(target: WebLogTarget, page: number, mode: WebLogMode, signal?: AbortSignal) {
  if (target.kind === "module") return mode === "recent"
    ? getWebServiceLastLogs({ signal })
    : getWebServiceLogs(WEB_LOG_PAGE_SIZE, page, signal);
  if (!target.ruleKey) throw new Error("缺少 Web 服务规则标识");
  if (target.kind === "http")
    return getWebServiceHttpLogs(target.ruleKey, WEB_LOG_PAGE_SIZE, page, signal);
  if (!target.subKey) throw new Error("缺少 Web 服务子规则标识");
  if (target.kind === "subrule") return mode === "recent"
    ? getWebServiceRuleLastLogs(target.ruleKey, target.subKey, signal)
    : getWebServiceRuleLogs(
      target.ruleKey,
      target.subKey,
      WEB_LOG_PAGE_SIZE,
      page,
      signal,
    );
  if (target.kind === "access")
    return getWebServiceAccessDetails(
      target.ruleKey,
      target.subKey,
      WEB_LOG_PAGE_SIZE,
      page,
      signal,
    );
  return getWebServiceCorazaLogs(
    target.ruleKey,
    target.subKey,
    WEB_LOG_PAGE_SIZE,
    page,
    signal,
  );
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
  visibleLabel,
}: {
  icon: typeof Pencil;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  visibleLabel: string;
}) {
  const colors = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{
        minWidth: 58,
        height: 36,
        paddingHorizontal: 8,
        borderRadius: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        backgroundColor: colors.mutedCard,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon color={color} size={16} />
      <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: "700" }}>
        {visibleLabel}
      </Text>
    </Pressable>
  );
}

function WebServiceLoadingState({ message = "正在加载" }: { message?: string }) {
  const colors = useAppTheme();
  return (
    <View style={{ flex: 1, minHeight: 160, alignItems: "center", justifyContent: "center", gap: 9 }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={{ color: colors.subtext, fontSize: 12 }}>{message}</Text>
    </View>
  );
}

function WebLogRow({
  value,
  index,
  accessDetails,
  disconnecting,
  onDisconnect,
}: {
  value: unknown;
  index: number;
  accessDetails: boolean;
  disconnecting: boolean;
  onDisconnect: (clientKey: string) => void;
}) {
  const colors = useAppTheme();
  const clientKey = accessDetails ? webServiceClientKey(value) : "";
  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: colors.subtext, fontSize: 10, fontWeight: "700" }}>
          第 {index + 1} 项
        </Text>
        {clientKey ? (
          <Pressable
            accessibilityLabel="断开客户端"
            disabled={disconnecting}
            onPress={() => onDisconnect(clientKey)}
            style={{
              minHeight: 38,
              paddingHorizontal: 11,
              borderRadius: 10,
              backgroundColor: colors.dangerBg,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: disconnecting ? 0.5 : 1,
            }}
          >
            <Ban color={colors.danger} size={15} />
            <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "700" }}>
              断开客户端
            </Text>
          </Pressable>
        ) : null}
      </View>
      {typeof value === "string" ? (
        <Text
          selectable
          style={{ color: colors.text, fontFamily: "monospace", fontSize: 10, lineHeight: 17 }}
        >
          {value}
        </Text>
      ) : (
        <StructuredDataView value={value} />
      )}
    </View>
  );
}

function WebServiceToolsModal({
  target,
  busy,
  onClose,
  onOpenLog,
  onFlushCache,
  onUpdateFolder,
}: {
  target: WebServiceToolsTarget;
  busy: boolean;
  onClose: () => void;
  onOpenLog: (target: WebLogTarget) => void;
  onFlushCache: () => void;
  onUpdateFolder: () => void;
}) {
  const colors = useAppTheme();
  const subTitle = target.subName || target.subKey || "子规则";
  const actions: Array<{
    key: string;
    label: string;
    icon: typeof ScrollText;
    color: string;
    onPress: () => void;
  }> = [
    {
      key: "http",
      label: "HTTP 服务日志",
      icon: Server,
      color: colors.cyan,
      onPress: () => onOpenLog({ kind: "http", title: `${target.ruleName} · HTTP 日志`, ruleKey: target.ruleKey }),
    },
  ];
  if (target.subKey) {
    actions.push(
      {
        key: "subrule",
        label: "子规则日志",
        icon: ScrollText,
        color: colors.cyan,
        onPress: () => onOpenLog({ kind: "subrule", title: `${subTitle} · 日志`, ruleKey: target.ruleKey, subKey: target.subKey }),
      },
      {
        key: "access",
        label: "访问详情与客户端",
        icon: Users,
        color: colors.primary,
        onPress: () => onOpenLog({ kind: "access", title: `${subTitle} · 访问详情`, ruleKey: target.ruleKey, subKey: target.subKey }),
      },
      {
        key: "coraza",
        label: "Coraza WAF 日志",
        icon: ShieldAlert,
        color: colors.warning,
        onPress: () => onOpenLog({ kind: "coraza", title: `${subTitle} · WAF 日志`, ruleKey: target.ruleKey, subKey: target.subKey }),
      },
    );
    if (target.fileService) {
      actions.push(
        {
          key: "flush",
          label: "刷新目录缓存",
          icon: ListTree,
          color: colors.success,
          onPress: onFlushCache,
        },
        {
          key: "folder",
          label: "更新文件服务目录",
          icon: FolderUp,
          color: colors.warning,
          onPress: onUpdateFolder,
        },
      );
    }
  }
  return (
    <Modal
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
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
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 16,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <IconTile icon={MoreHorizontal} size={36} iconSize={18} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                {target.subKey ? subTitle : target.ruleName}
              </Text>
              <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 2 }}>更多操作</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭更多操作"
              onPress={onClose}
              style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}
            >
              <X color={colors.subtext} size={18} />
            </Pressable>
          </View>
          {actions.map(({ key, label, icon: Icon, color, onPress }) => (
            <Pressable
              key={key}
              disabled={busy}
              onPress={onPress}
              style={{
                minHeight: 46,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.mutedCard,
                paddingHorizontal: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Icon color={color} size={18} />
              <Text style={{ flex: 1, color: colors.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function GroupOrderEditor({
  groupName,
  groupKey,
  initialKeys,
  busy,
  onClose,
  onSave,
}: {
  groupName: string;
  groupKey: string;
  initialKeys: string[];
  busy: boolean;
  onClose: () => void;
  onSave: (keys: string[]) => void;
}) {
  const colors = useAppTheme();
  const [keys, setKeys] = useState(() => initialKeys.slice());
  const moveKey = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= keys.length) return;
    setKeys((current) => {
      const next = current.slice();
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };
  return <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (!busy) onClose(); }}>
    <FullScreenSafeArea style={{ flex: 1, backgroundColor: colors.page }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flex: 1, padding: 18, gap: 13 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><IconTile icon={ListOrdered} size={38} iconSize={19} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>子规则排序</Text><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{groupName || groupKey}</Text></View><Pressable accessibilityLabel="关闭" disabled={busy} onPress={onClose} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.45 : 1 }}><X color={colors.subtext} size={18} /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: 12, paddingBottom: 24 }} style={{ flex: 1 }}>
            <Panel>
              <Text style={{ color: colors.subtext, fontSize: 12, lineHeight: 18 }}>调整顺序后保存，应用顺序与此列表一致。</Text>
              {keys.map((key, index) => <View key={`subrule-order-${key}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, paddingTop: index ? 10 : 0 }}>
                <Text style={{ width: 24, color: colors.subtext, fontSize: 12, textAlign: 'center' }}>{index + 1}</Text>
                <View style={{ flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, justifyContent: 'center', paddingHorizontal: 10 }}><Text numberOfLines={1} selectable style={{ color: colors.text, fontSize: 12 }}>{key}</Text></View>
                <Pressable accessibilityLabel="上移子规则" disabled={index === 0} onPress={() => moveKey(index, -1)} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: index === 0 ? colors.muted : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><ArrowUp color={index === 0 ? colors.disabled : colors.primary} size={16} /></Pressable>
                <Pressable accessibilityLabel="下移子规则" disabled={index === keys.length - 1} onPress={() => moveKey(index, 1)} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: index === keys.length - 1 ? colors.muted : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><ArrowDown color={index === keys.length - 1 ? colors.disabled : colors.primary} size={16} /></Pressable>
              </View>)}
            </Panel>
          </ScrollView>
          <Pressable disabled={busy} onPress={() => onSave(keys)} style={{ height: 48, borderRadius: 13, backgroundColor: busy ? colors.disabled : colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}><Save color="#fff" size={17} /><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? '保存中...' : '保存排序'}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </FullScreenSafeArea>
  </Modal>;
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
        asBoolean(value.EnableTLS) &&
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
        !asBoolean(value.EnableTLS) &&
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
          !asBoolean(value.EnableTLS) &&
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
        {numeric && !readOnly ? <StableNumberInput value={source[field]} onChange={(next) => write(field, next)} /> : <TextInput
          value={current}
          editable={!readOnly}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
          keyboardType="default"
          secureTextEntry={secret}
          autoCapitalize="none"
          autoCorrect={false}
          textAlignVertical={multiline ? "top" : "center"}
          onChangeText={(next) => {
            if (Array.isArray(source[field])) write(field, next.split(/\r?\n/));
            else write(field, next);
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
        />}
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
          value={asBoolean(source[field])}
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
    const useGlobalAuth = asBoolean(data.UseRuleGlobalAuthSettings);
    const updateOtherParam = (field: string, next: unknown) =>
      onUpdate("OtherParams", { ...otherParams, [field]: next });
    return <>
      {Toggle({ label: "使用规则全局认证设置", field: "UseRuleGlobalAuthSettings", data, onUpdate })}
      {!useGlobalAuth ? <>
        {Toggle({ label: "Basic 认证", field: "EnableBasicAuth", data, onUpdate })}
        {asBoolean(data.EnableBasicAuth)
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
      {ruleMode === "diy" && asBoolean(data.AutoProxyLocation)
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
          asBoolean(value.EnableTLS) ||
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
          {asBoolean(value.EnableTLS) ? <>
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
          {diyMode && asBoolean(defaultProxy.AutoProxyLocation)
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
              <View style={{ gap: 8 }}>
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
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7 }}>
                  <IconButton icon={Pencil} label={`编辑${title}`} visibleLabel="编辑" color={colors.primary} onPress={() => setExpandedProxyId(draftId)} />
                  <IconButton icon={Trash2} label={`移除${title}`} visibleLabel="移除" color={colors.danger} onPress={() => removeProxy(index, draftId)} />
                </View>
              </View>
              {open ? <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.rowBorder, paddingTop: 12 }}>
                {SubRuleFields({ data: proxy, onUpdate: write, scope: draftId, ruleMode: String(value.DiaglogShowMode ?? "simple"), tlsEnabled: asBoolean(value.EnableTLS) })}
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
        {FormSection({ title: "基础设置", icon: Network, children: SubRuleFields({ data: value, onUpdate: update, scope: "subrule", ruleMode: editor.ruleMode ?? "simple", tlsEnabled: asBoolean(editor.tlsEnabled) }) })}
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
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (!busy) onClose(); }}>
      <FullScreenSafeArea
        style={{
          flex: 1,
          backgroundColor: colors.card,
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
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
            <Pressable accessibilityLabel="关闭" disabled={busy} onPress={onClose} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center", opacity: busy ? 0.45 : 1 }}>
              <X color={colors.subtext} size={18} />
            </Pressable>
          </View>
          <ScrollView
            automaticallyAdjustKeyboardInsets
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
        </KeyboardAvoidingView>
      </FullScreenSafeArea>
    </Modal>
  );
}

export default function WebServiceScreen() {
  const colors = useAppTheme();
  const isFocused = useIsFocused();
  const [view, setView] = useState<ViewKey>("rules");
  const [expanded, setExpanded] = useState("");
  const [editor, setEditor] = useState<EditorState>();
  const [output, setOutput] = useState<unknown>("");
  const [localError, setLocalError] = useState("");
  const [logTarget, setLogTarget] = useState<WebLogTarget>(defaultWebLogTarget);
  const [logPage, setLogPage] = useState(1);
  const [logMode, setLogMode] = useState<WebLogMode>("page");
  const [toolsTarget, setToolsTarget] = useState<WebServiceToolsTarget>();
  const [groupOrderEditor, setGroupOrderEditor] = useState<{ key: string; name: string; keys: string[] }>();
  const [folderTarget, setFolderTarget] = useState<{ parentKey: string; subKey: string }>();
  const [mountIndex, setMountIndex] = useState("0");
  const [uploadBusy, setUploadBusy] = useState(false);
  const rules = useQuery({
    queryKey: ["webservice", "rules"],
    queryFn: ({ signal }) => getWebServiceRules(false, signal),
    enabled: view === "rules",
  });
  const groups = useQuery({
    queryKey: ["webservice", "groups"],
    queryFn: ({ signal }) => getWebServiceGroups({ signal, includeCounts: true }),
    enabled: view === "groups",
  });
  const subRuleGroups = useQuery({
    queryKey: ["webservice", "subrule-group-options"],
    queryFn: ({ signal }) => getWebServiceGroupOptions({ signal }),
    enabled: editor?.type === "subrule" || editor?.type === "rule",
  });
  const wafInstances = useQuery({
    queryKey: ["webservice", "coraza-instances"],
    queryFn: ({ signal }) => getWebServiceCorazaInstances({ signal }),
    enabled: editor?.type === "subrule" || editor?.type === "rule",
  });
  const ipFilterRules = useQuery({
    queryKey: ["webservice", "ip-filter-rules"],
    queryFn: ({ signal }) => getWebServiceIpFilterRules({ signal }),
    enabled: editor?.type === "subrule" || editor?.type === "rule",
  });
  const cgi = useQuery({
    queryKey: ["webservice", "cgi"],
    queryFn: ({ signal }) => getWebServiceCgiList({ signal }),
    enabled: view === "cgi",
  });
  const settings = useQuery({
    queryKey: ["webservice", "settings"],
    queryFn: ({ signal }) => getWebServiceSettings({ signal }),
    enabled: view === "settings",
  });
  const logs = useQuery({
    queryKey: [
      "webservice",
      "log-view",
      logTarget.kind,
      logTarget.ruleKey ?? "",
      logTarget.subKey ?? "",
      logPage,
      logMode,
    ],
    queryFn: ({ signal }) => getWebLogPage(logTarget, logPage, logMode, signal),
    enabled: view === "logs" && isFocused,
    refetchInterval: view === "logs" && isFocused && (logMode === "recent" || logPage === 1) ? 15000 : false,
    refetchIntervalInBackground: false,
  });
  const tips = useQuery({
    queryKey: ["webservice", "tips"],
    queryFn: ({ signal }) => getWebServiceTipInfo({ signal }),
    enabled: view === "tools",
  });

  const logEntries = useMemo(() => webLogEntries(logs.data), [logs.data]);
  const logTotal = useMemo(() => webLogTotal(logs.data), [logs.data]);
  const supportsRecentLogs = logTarget.kind === "module" || logTarget.kind === "subrule";
  const logHasNext =
    logMode === "page" && logTotal !== undefined
      ? logPage * WEB_LOG_PAGE_SIZE < logTotal
      : logMode === "page" && logEntries.length >= WEB_LOG_PAGE_SIZE;

  async function invalidateWebService(action: Action) {
    const keys: Array<readonly unknown[]> = [];
    if (action.type === "save") {
      if (action.editor.type === "rule" || action.editor.type === "subrule")
        keys.push(["webservice", "rules"], ["webservice", "groups"]);
      else if (action.editor.type === "group")
        keys.push(
          ["webservice", "groups"],
          ["webservice", "subrule-group-options"],
        );
      else if (action.editor.type === "cgi") keys.push(["webservice", "cgi"]);
      else if (action.editor.type === "settings") keys.push(["webservice", "settings"]);
    } else if (
      [
        "delete-rule",
        "delete-subrule",
        "toggle-rule",
        "toggle-subrule",
        "reorder-rules",
      ].includes(action.type)
    ) {
      keys.push(["webservice", "rules"], ["webservice", "groups"]);
    } else if (action.type === "delete-group" || action.type === "reorder-groups") {
      keys.push(
        ["webservice", "groups"],
        ["webservice", "subrule-group-options"],
      );
    } else if (action.type === "reorder-group-subrules") {
      keys.push(["webservice", "groups"], ["webservice", "rules"]);
    } else if (action.type === "delete-cgi" || action.type === "toggle-cgi") {
      keys.push(["webservice", "cgi"]);
    } else if (action.type === "mark-tip") {
      keys.push(["webservice", "tips"]);
    } else if (action.type === "disconnect-client") {
      keys.push(["webservice", "log-view"]);
    } else if (action.type === "flush-cache") {
      keys.push(["webservice", "rules"], ["webservice", "log-view"]);
    }
    await Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
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
      if (action.type === "reorder-group-subrules") {
        const rule = await getWebServiceRule(action.ruleKey);
        const items = array(rule, ["ProxyList"]);
        if (!items.length) throw new Error("当前规则没有可排序的子规则");
        const byKey = new Map(items.map((item, index) => [keyOf(item, index), item]));
        const ordered: LuckyRecord[] = [];
        const used = new Set<string>();
        for (const key of action.keys) {
          const item = byKey.get(key);
          if (!item || used.has(key)) continue;
          used.add(key);
          ordered.push(item);
        }
        if (ordered.length !== items.length)
          throw new Error("排序列表已过期，请刷新规则后重试");
        rule.ProxyList = ordered;
        return updateWebServiceRule(action.ruleKey, rule);
      }
      if (action.type === "disconnect-client")
        return disconnectWebServiceClient(action.ruleKey, action.clientKey);
      if (action.type === "flush-cache")
        return flushWebServiceCache(action.ruleKey, action.subKey);
      if (action.type === "mark-tip")
        return markWebServiceTipRead(action.version);
      throw new Error("不支持的 Web 服务操作");
    },
    onSuccess: async (result, action) => {
      if (action.type === "save") setEditor(undefined);
      if (action.type === "reorder-group-subrules") setGroupOrderEditor(undefined);
      if (action.type === "disconnect-client")
        Alert.alert("客户端已断开", "访问详情正在刷新");
      if (action.type === "flush-cache") {
        setOutput(result);
        setToolsTarget(undefined);
        Alert.alert("缓存已刷新");
      }
      setLocalError("");
      await invalidateWebService(action);
    },
    onError: (error, action) => {
      setLocalError(error.message);
      if (action.type === "disconnect-client" || action.type === "flush-cache")
        Alert.alert("操作失败", error.message);
    },
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
  ) {
    try {
      const rule = await getWebServiceRule(parentKey);
      const value = key
        ? array(rule, ["ProxyList"]).find((item, i) => keyOf(item, i) === key)
        : newWebServiceSubRule();
      if (!value) throw new Error("子规则不存在");
      const draft = clone(value);
      setEditor({
        type: "subrule",
        title: key ? "编辑子规则" : "添加子规则",
        value: draft,
        key,
        parentKey,
        ruleMode:
          rule.DiaglogShowMode === "full"
            ? "diy"
            : String(rule.DiaglogShowMode ?? "simple"),
        tlsEnabled: asBoolean(rule.EnableTLS),
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取子规则失败");
    }
  }

  async function copySubRuleUrl(rule: LuckyRecord, subRule: LuckyRecord) {
    let url: string;
    try {
      url = buildSubRuleUrl(rule, subRule);
    } catch {
      Alert.alert("无法复制", "该子规则的前端地址格式不正确");
      return;
    }
    if (!url) {
      Alert.alert("无法复制", "该子规则没有前端地址");
      return;
    }
    try {
      const copied = await Clipboard.setStringAsync(url);
      if (!copied) {
        Alert.alert("复制失败", "无法写入系统剪贴板，请检查权限后重试");
        return;
      }
      Alert.alert("网址已复制", url);
    } catch {
      Alert.alert("复制失败", "无法写入系统剪贴板，请重试");
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

  function openWebLog(target: WebLogTarget) {
    setLogTarget(target);
    setLogPage(1);
    setLogMode("page");
    setOutput("");
    setLocalError("");
    setToolsTarget(undefined);
    setView("logs");
  }

  function confirmDisconnectClient(ruleKey: string, clientKey: string) {
    Alert.alert("断开客户端", "确定断开此客户端连接吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "断开",
        style: "destructive",
        onPress: () =>
          mutation.mutate({ type: "disconnect-client", ruleKey, clientKey }),
      },
    ]);
  }

  function confirmFlushCache(target: WebServiceToolsTarget) {
    if (!target.subKey) return;
    Alert.alert("刷新目录缓存", "确定重新读取此子规则的目录占用信息吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "刷新",
        onPress: () =>
          mutation.mutate({
            type: "flush-cache",
            ruleKey: target.ruleKey,
            subKey: target.subKey ?? "",
          }),
      },
    ]);
  }

  async function resolveFolderUpdate(
    target: { parentKey: string; subKey: string },
    tempId: string,
    applyUpdate: boolean,
  ) {
    const title = applyUpdate ? "应用目录更新失败" : "取消目录更新失败";
    setUploadBusy(true);
    setLocalError("");
    try {
      const result = applyUpdate
        ? await confirmWebServiceFolderUpdate(target.parentKey, target.subKey, tempId)
        : await cancelWebServiceFolderUpdate(target.parentKey, target.subKey, tempId);
      setOutput(result);
      setFolderTarget(undefined);
      if (applyUpdate)
        await queryClient.invalidateQueries({ queryKey: ["webservice", "rules"] });
    } catch (error) {
      const message = error instanceof Error ? error.message : title;
      setLocalError(message);
      Alert.alert(title, message);
    } finally {
      setUploadBusy(false);
    }
  }

  async function uploadFolderUpdate() {
    if (!folderTarget) return;
    const target = folderTarget;
    setUploadBusy(true);
    setLocalError("");
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/gzip", "application/x-tar"],
        copyToCacheDirectory: true,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      const result = await uploadWebServiceFolder(
        target.parentKey,
        target.subKey,
        Math.max(0, Number.parseInt(mountIndex, 10) || 0),
        { uri: asset.uri, name: asset.name, type: asset.mimeType ?? undefined, file: asset.file },
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
          onPress: () => { void resolveFolderUpdate(target, tempId, false); },
        },
        {
          text: "应用更新",
          onPress: () => { void resolveFolderUpdate(target, tempId, true); },
        },
      ], { cancelable: false });
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
      scrollable={
        view !== "rules" && view !== "groups" && view !== "cgi" && view !== "logs"
      }
      refreshing={activeQuery.isFetching}
      onRefresh={() => activeQuery.refetch()}
    >
      <ResponsiveTabBar
        tabs={tabs}
        value={view}
        onChange={(key) => {
          setView(key);
          if (key === "logs") {
            setOutput("");
            setLogTarget(defaultWebLogTarget);
            setLogPage(1);
            setLogMode("page");
          }
          setLocalError("");
        }}
      />
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
              height: 46,
              borderRadius: 12,
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
          <FlatList
            data={rules.data?.items ?? []}
            keyExtractor={(item, index) => keyOf(item, index)}
            extraData={`${expanded}:${mutation.isPending}`}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: rules.data?.items.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={
              rules.isLoading ? (
                <WebServiceLoadingState message="正在读取 Web 服务规则" />
              ) : !rules.error ? (
                <EmptyState message="暂无 Web 服务规则" icon={Route} />
              ) : null
            }
            renderItem={({ item, index }) => {
              const key = keyOf(item, index);
              const open = expanded === key;
              const subs = array(item, ["ProxyList"]);
              const name = pick(item, ["RuleName", "Name"], "未命名规则");
              return (
                <Panel>
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
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
                      <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: "700" }}>
                        {enabled(item) ? "规则已启用" : "规则已停用"}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 7 }}>
                      <View style={{ flexDirection: "row", gap: 7 }}>
                        <IconButton
                          icon={ArrowUp}
                          label="上移"
                          visibleLabel="上移"
                          color={colors.text}
                          disabled={mutation.isPending || index === 0}
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
                          visibleLabel="下移"
                          color={colors.text}
                          disabled={mutation.isPending || index === ruleKeys.length - 1}
                          onPress={() =>
                            mutation.mutate({
                              type: "reorder-rules",
                              keys: move(ruleKeys, index, 1),
                            })
                          }
                        />
                      </View>
                      <View style={{ flexDirection: "row", gap: 7 }}>
                        <IconButton
                          icon={ListOrdered}
                          label="子规则排序"
                          visibleLabel="排序"
                          color={colors.text}
                          disabled={mutation.isPending || subs.length < 2}
                          onPress={() =>
                            setGroupOrderEditor({
                              key,
                              name,
                              keys: subs.map((sub, subIndex) => keyOf(sub, subIndex)),
                            })
                          }
                        />
                        <IconButton
                          icon={MoreHorizontal}
                          label="规则更多操作"
                          visibleLabel="更多"
                          color={colors.text}
                          onPress={() =>
                            setToolsTarget({ ruleKey: key, ruleName: name })
                          }
                        />
                        <IconButton
                          icon={Copy}
                          label="复制规则"
                          visibleLabel="复制规则"
                          color={colors.primary}
                          onPress={() => editRule(key, true)}
                        />
                        <IconButton
                          icon={Pencil}
                          label="编辑"
                          visibleLabel="编辑"
                          color={colors.primary}
                          onPress={() => editRule(key)}
                        />
                        <IconButton
                          icon={Trash2}
                          label="删除"
                          visibleLabel="删除"
                          color={colors.danger}
                          disabled={mutation.isPending}
                          onPress={() => confirmDelete("rule", key, name)}
                        />
                      </View>
                    </View>
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
                          const subName = pick(
                            sub,
                            ["Remark"],
                            domains || `子规则 ${subIndex + 1}`,
                          );
                          const fileService = pick(sub, ["WebServiceType"])
                            .toLowerCase()
                            .includes("file");
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
                                    {subName}
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
                                  disabled={mutation.isPending}
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
                              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 7 }}>
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                                  <IconButton
                                    icon={Copy}
                                    label="复制完整网址"
                                    visibleLabel="复制网址"
                                    color={colors.primary}
                                    onPress={() => copySubRuleUrl(item, sub)}
                                  />
                                  <IconButton
                                    icon={MoreHorizontal}
                                    label="子规则更多操作"
                                    visibleLabel="更多"
                                    color={colors.text}
                                    onPress={() =>
                                      setToolsTarget({
                                        ruleKey: key,
                                        ruleName: name,
                                        subKey,
                                        subName,
                                        fileService,
                                      })
                                    }
                                  />
                                </View>
                                <View style={{ flexDirection: "row", gap: 7 }}>
                                  <IconButton
                                    icon={Pencil}
                                    label="编辑子规则"
                                    visibleLabel="编辑"
                                    color={colors.primary}
                                    onPress={() => editSubRule(key, subKey)}
                                  />
                                  <IconButton
                                    icon={Trash2}
                                    label="删除子规则"
                                    visibleLabel="删除"
                                    color={colors.danger}
                                    disabled={mutation.isPending}
                                    onPress={() =>
                                      confirmDeleteSubRule(
                                        key,
                                        subKey,
                                        subName,
                                      )
                                    }
                                  />
                                </View>
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
            }}
          />
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
          <FlatList
            data={groups.data?.items ?? []}
            keyExtractor={(item, index) => keyOf(item, index)}
            extraData={mutation.isPending}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: groups.data?.items.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={
              groups.isLoading ? (
                <WebServiceLoadingState message="正在读取分组" />
              ) : !groups.error ? (
                <EmptyState message="暂无分组" icon={FolderTree} />
              ) : null
            }
            renderItem={({ item, index }) => {
              const key = keyOf(item, index);
              const name = pick(item, ["Name", "GroupName"], key);
              return (
                <Panel>
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
                        {key} · {item.subRuleCount === undefined ? "接口未返回子规则数量" : `${item.subRuleCount} 个子规则`}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7 }}>
                    <IconButton
                      icon={ArrowUp}
                      label="上移"
                      visibleLabel="上移"
                      color={colors.text}
                      disabled={mutation.isPending || index === 0}
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
                      visibleLabel="下移"
                      color={colors.text}
                      disabled={mutation.isPending || index === groupKeys.length - 1}
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
                      visibleLabel="编辑"
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
                      visibleLabel="删除"
                      color={colors.danger}
                      disabled={mutation.isPending}
                      onPress={() => confirmDelete("group", key, name)}
                    />
                  </View>
                </Panel>
              );
            }}
          />
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
          <FlatList
            data={cgi.data?.items ?? []}
            keyExtractor={(item, index) => keyOf(item, index)}
            extraData={mutation.isPending}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: cgi.data?.items.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={
              cgi.isLoading ? (
                <WebServiceLoadingState message="正在读取 CGI 实例" />
              ) : !cgi.error ? (
                <EmptyState message="暂无 CGI 实例" icon={Workflow} />
              ) : null
            }
            renderItem={({ item, index }) => {
              const key = keyOf(item, index);
              const name = pick(item, ["Name"], key);
              return (
                <Panel>
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
                      disabled={mutation.isPending}
                      onValueChange={(value) =>
                        mutation.mutate({
                          type: "toggle-cgi",
                          key,
                          enabled: value,
                        })
                      }
                    />
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7 }}>
                    <IconButton
                      icon={Pencil}
                      label="编辑"
                      visibleLabel="编辑"
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
                      visibleLabel="删除"
                      color={colors.danger}
                      disabled={mutation.isPending}
                      onPress={() => confirmDelete("cgi", key, name)}
                    />
                  </View>
                </Panel>
              );
            }}
          />
        </>
      ) : null}

      {view === "settings" ? (
        <>
          <SectionHeader icon={Settings2} title="模块设置" />
          {settings.isLoading ? (
            <WebServiceLoadingState message="正在读取模块设置" />
          ) : settings.data ? (
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
          ) : !settings.error ? (
            <EmptyState message="暂无模块设置" icon={Settings2} />
          ) : null}
        </>
      ) : null}

      {view === "logs" ? (
        <>
          <SectionHeader
            icon={logTarget.kind === "access" ? Users : logTarget.kind === "coraza" ? ShieldAlert : ScrollText}
            title={logTarget.title}
            meta={logMode === "recent" ? "最近日志" : logTotal === undefined ? `第 ${logPage} 页` : `共 ${logTotal} 项`}
          />
          <View
            style={{
              minHeight: 46,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
            }}
          >
            {logTarget.kind !== "module" ? (
              <Pressable
                onPress={() => openWebLog(defaultWebLogTarget)}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 11,
                  borderRadius: 9,
                  backgroundColor: colors.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>
                  模块日志
                </Text>
              </Pressable>
            ) : null}
            {supportsRecentLogs ? <Pressable
              onPress={() => { setLogMode((current) => current === "page" ? "recent" : "page"); setLogPage(1); }}
              style={{ minHeight: 36, paddingHorizontal: 11, borderRadius: 9, backgroundColor: logMode === "recent" ? colors.primarySoft : colors.mutedCard, alignItems: "center", justifyContent: "center" }}
            ><Text style={{ color: logMode === "recent" ? colors.primary : colors.subtext, fontSize: 11, fontWeight: "700" }}>{logMode === "recent" ? "最近日志" : "分页日志"}</Text></Pressable> : null}
            <View style={{ flex: 1 }} />
            {logMode === "page" ? <><Pressable
              accessibilityLabel="上一页"
              disabled={logPage <= 1 || logs.isFetching}
              onPress={() => setLogPage((page) => Math.max(1, page - 1))}
              style={{
                width: 38,
                height: 36,
                borderRadius: 9,
                backgroundColor: colors.mutedCard,
                alignItems: "center",
                justifyContent: "center",
                opacity: logPage <= 1 || logs.isFetching ? 0.4 : 1,
              }}
            >
              <ChevronUp color={colors.text} size={17} />
            </Pressable>
            <Text style={{ minWidth: 54, textAlign: "center", color: colors.text, fontSize: 11, fontWeight: "700" }}>
              {logPage} / {logTotal === undefined ? "--" : Math.max(1, Math.ceil(logTotal / WEB_LOG_PAGE_SIZE))}
            </Text>
            <Pressable
              accessibilityLabel="下一页"
              disabled={!logHasNext || logs.isFetching}
              onPress={() => setLogPage((page) => page + 1)}
              style={{
                width: 38,
                height: 36,
                borderRadius: 9,
                backgroundColor: colors.mutedCard,
                alignItems: "center",
                justifyContent: "center",
                opacity: !logHasNext || logs.isFetching ? 0.4 : 1,
              }}
            >
              <ChevronDown color={colors.text} size={17} />
            </Pressable></> : null}
          </View>
          <FlatList
            data={logEntries}
            keyExtractor={(item, index) => {
              const itemKey = isRecordValue(item)
                ? pick(item, ["ClientKey", "clientKey", "ID", "id", "Key", "key", "Time", "time"])
                : "";
              return `${logMode}-${logPage}-${itemKey || "row"}-${index}`;
            }}
            extraData={mutation.isPending}
            refreshing={logs.isRefetching && !logs.isLoading}
            onRefresh={() => {
              void logs.refetch();
            }}
            initialNumToRender={12}
            maxToRenderPerBatch={12}
            windowSize={7}
            removeClippedSubviews={Platform.OS === "android"}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: logEntries.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListEmptyComponent={
              logs.isLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : !logs.error ? (
                <EmptyState message={`暂无${logTarget.title}`} icon={ScrollText} />
              ) : null
            }
            renderItem={({ item, index }) => (
              <WebLogRow
                value={item}
                index={(logPage - 1) * WEB_LOG_PAGE_SIZE + index}
                accessDetails={logTarget.kind === "access"}
                disconnecting={
                  mutation.isPending && mutation.variables?.type === "disconnect-client"
                }
                onDisconnect={(clientKey) => {
                  if (logTarget.ruleKey)
                    confirmDisconnectClient(logTarget.ruleKey, clientKey);
                }}
              />
            )}
          />
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

      {toolsTarget ? (
        <WebServiceToolsModal
          target={toolsTarget}
          busy={mutation.isPending}
          onClose={() => {
            if (!mutation.isPending) setToolsTarget(undefined);
          }}
          onOpenLog={openWebLog}
          onFlushCache={() => confirmFlushCache(toolsTarget)}
          onUpdateFolder={() => {
            if (!toolsTarget.subKey) return;
            setMountIndex("0");
            setFolderTarget({
              parentKey: toolsTarget.ruleKey,
              subKey: toolsTarget.subKey,
            });
            setToolsTarget(undefined);
          }}
        />
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
      {groupOrderEditor ? <GroupOrderEditor
        groupName={groupOrderEditor.name}
        groupKey={groupOrderEditor.key}
        initialKeys={groupOrderEditor.keys}
        busy={mutation.isPending}
        onClose={() => setGroupOrderEditor(undefined)}
        onSave={(keys) => {
          if (!keys.length) {
            setLocalError("至少填写一个子规则 Key");
            return;
          }
          mutation.mutate({ type: "reorder-group-subrules", ruleKey: groupOrderEditor.key, keys });
        }}
      /> : null}
      {folderTarget ? (
        <Modal transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => { if (!uploadBusy) setFolderTarget(undefined); }}>
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
                    {uploadBusy ? "处理中" : "选择文件"}
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
