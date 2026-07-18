import { useMutation, useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Box,
  Check,
  CircleStop,
  Container,
  Cpu,
  Database,
  Download,
  Ellipsis,
  FileText,
  Folder,
  Gauge,
  HardDriveDownload,
  HardDriveUpload,
  Image,
  ListChecks,
  MemoryStick,
  Network,
  PackageSearch,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  Upload,
  UploadCloud,
  Workflow,
  Wrench,
  X,
} from "lucide-react-native";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  FullScreenSafeArea,
  IconTile,
  Page,
  Panel,
  ResponsiveTabBar,
  SearchField,
  SectionHeader,
  SheetHandle,
} from "@/src/components/lucky-ui";
import {
  DockerOverviewDashboard,
  dockerContainerState,
  dockerStatRows,
  type DockerStatRow,
} from "@/src/components/docker-overview";
import { StructuredDataView, StructuredForm } from "@/src/components/structured-form";
import { queryClient } from "@/src/lib/query-client";
import { useAppTheme } from "@/src/lib/theme";
import { getIconLibraryIcons } from "@/src/services/iconlib";
import { luckySessionState } from "@/src/store/lucky-session";
import type { LuckyRecord } from "@/src/types/lucky";
import {
  addDockerRegistryMirror,
  callDockerApi,
  backupDockerCompose,
  backupDockerVolume,
  buildDockerImage,
  clearDockerTasks,
  clearDockerImageUpgradeStatus,
  checkDockerImagesUpgrade,
  checkDockerContainerUpgrade,
  createDockerContainerGroup,
  createDockerContainer,
  createDockerNetwork,
  createDockerVolume,
  discoverDockerCompose,
  editDockerContainer,
  getDockerConfig,
  getAllDockerContainerStats,
  getDockerComposeLogs,
  getDockerContainer,
  getDockerContainerLogs,
  getDockerContainerProcesses,
  getDockerImage,
  getDockerImageUpgradeStatus,
  getDockerLogs,
  getDockerMaintenanceStatus,
  getDockerOverview,
  getDockerRegistryMirrors,
  getDockerTask,
  listDockerComposeProjects,
  listDockerContainers,
  listDockerImages,
  listDockerNetworks,
  listDockerTasks,
  listDockerVolumeBackups,
  listDockerVolumes,
  pullDockerImage,
  pruneDocker,
  refreshDockerContainerStats,
  readDockerComposeConfig,
  removeDockerContainer,
  removeDockerContainerGroup,
  removeDockerImage,
  removeDockerImages,
  removeDockerNetwork,
  removeDockerRegistryMirror,
  removeDockerTask,
  removeDockerVolume,
  renameDockerContainer,
  restoreDockerVolumeBackup,
  runDockerComposeAction,
  runDockerContainerAction,
  scanUnusedDockerImages,
  tagDockerImage,
  updateDockerComposeConfig,
  updateDockerConfig,
  upgradeDockerContainer,
} from "@/src/services/docker";

type DockerView =
  | "containers"
  | "images"
  | "compose"
  | "networks"
  | "volumes"
  | "tasks"
  | "overview"
  | "settings"
  | "logs";
type Editor = { type: string; title: string; value: LuckyRecord; key?: string };

const emptyDockerContainers: LuckyRecord[] = [];

const tabs = [
  ["containers", "容器", Container],
  ["images", "镜像", Image],
  ["compose", "Compose", Workflow],
  ["networks", "网络", Network],
  ["volumes", "数据卷", Database],
  ["tasks", "任务", Activity],
  ["overview", "总览", Gauge],
  ["settings", "设置", Settings2],
  ["logs", "日志", FileText],
] as const;

function dockerViewParam(value: string | string[] | undefined): DockerView | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return tabs.some(([key]) => key === candidate) ? candidate as DockerView : undefined;
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function pick(item: LuckyRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" || typeof value === "number")
      return String(value);
    if (Array.isArray(value) && value.length)
      return value.map(String).join(", ");
  }
  return fallback;
}
function keyOf(item: LuckyRecord, index: number) {
  return pick(
    item,
    ["Id", "ID", "id", "Name", "name", "Key", "key"],
    String(index),
  );
}
function imageReferences(item: LuckyRecord) {
  const references: string[] = [];
  for (const key of ["RepoTags", "Tags", "repoTags", "tags", "Name", "name"]) {
    const value = item[key];
    const candidates = Array.isArray(value)
      ? value.map(String)
      : typeof value === "string"
        ? value.split(",")
        : [];
    references.push(...candidates.map((candidate) => candidate.trim()).filter((candidate) => candidate && !/<none>/i.test(candidate)));
  }
  return [...new Set(references)];
}
function nested(payload: LuckyRecord, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value && typeof value === "object" && !Array.isArray(value))
      return value as LuckyRecord;
  }
  return payload;
}
function composeConfigText(payload: LuckyRecord) {
  for (const source of [payload, payload.data, payload.result, payload.config]) {
    if (typeof source === "string") return source;
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const record = source as LuckyRecord;
    for (const key of ["content", "Content", "config", "Config", "yaml", "YAML"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return "";
}
function containerStatus(item: LuckyRecord, running: boolean, paused: boolean) {
  if (paused) return "已暂停";
  const raw = pick(item, ["Status", "status", "State", "state"], running ? "运行中" : "已停止");
  if (!running) return /exit|stop|dead/i.test(raw) ? "已停止" : raw;
  const duration = raw.match(/Up\s+(.+?)(?:\s+\(|$)/i)?.[1];
  if (!duration) return "运行中";
  const localized = duration
    .replace(/seconds?/i, "秒")
    .replace(/minutes?/i, "分钟")
    .replace(/hours?/i, "小时")
    .replace(/days?/i, "天")
    .replace(/weeks?/i, "周")
    .replace(/months?/i, "个月");
  return `运行: ${localized}`;
}
function bytes(value: unknown) {
  const size = Number(value) || 0;
  if (!size) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  return `${(size / 1024 ** i).toFixed(i ? 2 : 0)} ${units[i]}`;
}

function lines(payload?: LuckyRecord) {
  if (!payload) return [];
  const value =
    payload.logs ?? payload.list ?? payload.data ?? payload.text ?? "";
  return Array.isArray(value)
    ? value.map((item) =>
        typeof item === "string" ? item : JSON.stringify(item),
      )
    : String(value || "")
        .split("\n")
        .filter(Boolean);
}
function pickComposeField(item: LuckyRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}
function composePayload(item: LuckyRecord) {
  return {
    project_name: pickComposeField(item, [
      "name",
      "Name",
      "project_name",
      "projectName",
      "ProjectName",
    ]),
    project_path: pickComposeField(item, [
      "path",
      "Path",
      "project_path",
      "projectPath",
      "ProjectPath",
      "working_dir",
      "WorkingDir",
    ]),
  };
}

function composeProjectError(error: unknown, projectPath: string) {
  const message = error instanceof Error ? error.message : String(error || "Compose 操作失败");
  if (/目录不存在|directory\s+(?:does not exist|not found)|no such (?:file|directory)/i.test(message)) {
    return new Error(
      `Lucky 服务无法访问项目目录：${projectPath}。请将宿主机 Compose 目录按相同绝对路径读写挂载到 Lucky 容器。`,
    );
  }
  return error instanceof Error ? error : new Error(message);
}

function containerIcon(item: LuckyRecord, icons: LuckyRecord[]) {
  const labels = item.Labels && typeof item.Labels === "object" && !Array.isArray(item.Labels)
    ? item.Labels as LuckyRecord
    : {};
  const direct = [
    item.Icon,
    item.icon,
    item.Logo,
    item.logo,
    item.ImageIcon,
    labels["net.unraid.docker.icon"],
    labels["org.opencontainers.image.icon"],
    labels["com.docker.desktop.extension.icon"],
    labels.icon,
  ].find((value) => typeof value === "string" && value.trim());
  if (typeof direct === "string") return direct.trim();

  const terms = [pick(item, ["Names", "Name", "name"]), pick(item, ["Image", "ImageName"])]
    .flatMap((value) => value.toLowerCase().split(/[\/:@._-]+/))
    .filter((value) => value.length >= 3 && !["latest", "docker", "library", "ghcr", "com"].includes(value));
  let best = "";
  let bestScore = 0;
  for (const icon of icons) {
    const path = pick(icon, ["RelativePath", "Path", "path"]);
    const name = pick(icon, ["Name", "FileName", "name"], path).toLowerCase();
    const score = terms.reduce((total, term) => total + (name === term ? 10 : name.includes(term) ? term.length : 0), 0);
    if (score > bestScore) {
      best = path;
      bestScore = score;
    }
  }
  return bestScore >= 3 ? best : "";
}

function ContainerArtwork({ item, icons, running, size = 44 }: { item: LuckyRecord; icons: LuckyRecord[]; running: boolean; size?: number }) {
  const colors = useAppTheme();
  const [failed, setFailed] = useState(false);
  const icon = useMemo(() => containerIcon(item, icons), [item, icons]);
  const external = /^(https?:|data:|file:)/i.test(icon);
  const uri = !icon ? "" : external
    ? icon
    : `${luckySessionState.baseUrl.replace(/\/$/, "")}/api/iconlib/icon?path=${encodeURIComponent(icon)}`;
  useEffect(() => setFailed(false), [uri]);
  if (!uri || failed) return (
    <View style={{ width: size, height: size, borderRadius: Math.max(10, Math.round(size * 0.26)), backgroundColor: running ? colors.primarySoft : colors.mutedCard, alignItems: "center", justifyContent: "center" }}>
      <Container color={running ? colors.primary : colors.disabled} size={Math.round(size * 0.45)} />
    </View>
  );
  return (
    <View style={{ width: size, height: size, borderRadius: Math.max(10, Math.round(size * 0.26)), backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <ExpoImage
        source={{ uri, headers: external || !luckySessionState.token ? undefined : { "Lucky-Admin-Token": luckySessionState.token } }}
        onError={() => setFailed(true)}
        contentFit="contain"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={120}
        style={{ width: size - 6, height: size - 6 }}
      />
    </View>
  );
}

function compactDockerBytes(value: number, available: boolean) {
  if (!available) return "N/A";
  return value > 0 ? bytes(value) : "0 B";
}

function ContainerStatsGrid({ stats }: { stats?: DockerStatRow }) {
  const colors = useAppTheme();
  const cpu = stats?.hasCpu ? `${stats.cpu.toFixed(1)}%` : "-";
  const memory = stats?.hasMemoryPercent
    ? `${stats.memoryPercent.toFixed(1)}%`
    : stats?.hasMemory
      ? compactDockerBytes(stats.memory, true)
      : "-";
  const groups = [
    [
      { label: "CPU", value: cpu, icon: Cpu, color: colors.primary },
      { label: "内存", value: memory, icon: MemoryStick, color: colors.success },
    ],
    [
      { label: "下载", value: compactDockerBytes(stats?.networkRx ?? 0, stats?.hasNetworkRx === true), icon: Download, color: colors.cyan },
      { label: "上传", value: compactDockerBytes(stats?.networkTx ?? 0, stats?.hasNetworkTx === true), icon: Upload, color: colors.warning },
    ],
    [
      { label: "读取", value: compactDockerBytes(stats?.blockRead ?? 0, stats?.hasBlockRead === true), icon: HardDriveDownload, color: colors.subtext },
      { label: "写入", value: compactDockerBytes(stats?.blockWrite ?? 0, stats?.hasBlockWrite === true), icon: HardDriveUpload, color: colors.subtext },
    ],
  ];
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
    {groups.map((group) => <View key={group[0].label} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 145, minWidth: 132, minHeight: 54, padding: 8, borderRadius: 12, backgroundColor: colors.mutedCard, flexDirection: "row", alignItems: "center" }}>
      {group.map(({ label, value, icon: MetricIcon, color }, index) => <View key={label} style={{ flex: 1, minWidth: 0, paddingHorizontal: 4, borderLeftWidth: index ? 1 : 0, borderLeftColor: colors.rowBorder, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <MetricIcon color={color} size={12} strokeWidth={2.2} />
          <Text style={{ color: colors.subtext, fontSize: 10, lineHeight: 12, fontWeight: "600" }}>{label}</Text>
        </View>
        <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={{ width: "100%", color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "center" }}>{value}</Text>
      </View>)}
    </View>)}
  </View>;
}

function IconButton({
  icon: Icon,
  label,
  color,
  disabled = false,
  fluid = false,
  basis = 88,
  onPress,
}: {
  icon: typeof Pencil;
  label: string;
  color: string;
  disabled?: boolean;
  fluid?: boolean;
  basis?: number;
  onPress: () => void;
}) {
  const colors = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: fluid ? 1 : 0,
        flexShrink: fluid ? 1 : 0,
        flexBasis: fluid ? basis : "auto",
        minWidth: 64,
        minHeight: 42,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.mutedCard,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 5,
        opacity: disabled ? 0.5 : pressed ? 0.65 : 1,
      })}
    >
      <Icon color={color} size={16} />
      <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

function ContainerCommandButton({ icon: Icon, label, color, onPress }: { icon: typeof Pencil; label: string; color: string; onPress: () => void }) {
  const colors = useAppTheme();
  return <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      flex: 1,
      minWidth: 0,
      minHeight: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.mutedCard,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      opacity: pressed ? 0.55 : 1,
      transform: [{ scale: pressed ? 0.985 : 1 }],
    })}
  ><Icon color={color} size={15} /><Text numberOfLines={1} style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text></Pressable>;
}

function DockerFormEditor({
  editor,
  busy,
  close,
  save,
}: {
  editor: Editor;
  busy: boolean;
  close: () => void;
  save: (value: LuckyRecord) => void;
}) {
  const colors = useAppTheme();
  const [value, setValue] = useState(() => clone(editor.value));
  return (
    <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
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
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <IconTile icon={Wrench} size={36} iconSize={18} />
            <Text
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 18,
                fontWeight: "800",
                marginLeft: 9,
              }}
            >
              {editor.title}
            </Text>
            <Pressable accessibilityLabel="关闭" onPress={close} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}>
              <X color={colors.subtext} size={18} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 12, paddingBottom: 4 }}
            style={{ flex: 1 }}
          >
            <StructuredForm value={value} onChange={setValue} />
          </ScrollView>
          <Pressable
            disabled={busy}
            onPress={() => save(value)}
            style={{
              height: 48,
              borderRadius: 12,
              backgroundColor: busy ? colors.disabled : colors.primary,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Save color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>
              {busy ? "执行中" : "确认执行"}
            </Text>
          </Pressable>
        </View>
      </FullScreenSafeArea>
    </Modal>
  );
}

type DetailState = {
  title: string;
  value?: unknown;
  loading?: boolean;
  status?: string;
  error?: string;
};

function DockerDetailViewer({ detail, close }: { detail: DetailState; close: () => void }) {
  const colors = useAppTheme();
  return <Modal animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    <FullScreenSafeArea style={{ flex: 1, backgroundColor: colors.page }}>
      <View style={{ flex: 1, width: "100%", maxWidth: 820, alignSelf: "center", padding: 18, gap: 14 }}>
        <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <IconTile icon={Search} size={38} iconSize={19} />
          <Text numberOfLines={2} style={{ flex: 1, color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "800" }}>{detail.title}</Text>
          <Pressable accessibilityLabel="关闭详情" onPress={close} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}>
            <X color={colors.subtext} size={19} />
          </Pressable>
        </View>
        {detail.error ? <ErrorState message={detail.error} /> : detail.loading && detail.value === undefined ? <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={{ color: colors.subtext, fontSize: 13 }}>{detail.status ?? "正在读取详情"}</Text>
        </View> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 18, gap: 12 }}>
          {detail.loading ? <View style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", gap: 9 }}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={{ flex: 1, color: colors.primary, fontSize: 12, fontWeight: "700" }}>{detail.status ?? "正在处理"}</Text>
          </View> : null}
          <View style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
            <StructuredDataView value={detail.value} />
          </View>
        </ScrollView>}
      </View>
    </FullScreenSafeArea>
  </Modal>;
}

export default function DockerScreen() {
  const colors = useAppTheme();
  const isScreenFocused = useIsFocused();
  const params = useLocalSearchParams<{ view?: string; search?: string }>();
  const requestedView = dockerViewParam(params.view);
  const requestedSearch = stringParam(params.search);
  const [view, setView] = useState<DockerView>(requestedView ?? "containers");
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState !== "background" && AppState.currentState !== "inactive",
  );
  const [search, setSearch] = useState(requestedSearch ?? "");
  const deferredSearch = useDeferredValue(search);
  const [editor, setEditor] = useState<Editor>();
  const [detail, setDetail] = useState<DetailState>();
  const detailRequestRef = useRef(0);
  const [imageSelectionMode, setImageSelectionMode] = useState(false);
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
  const [imageUpgradeChecking, setImageUpgradeChecking] = useState(false);
  const imageUpgradeRunningRef = useRef(false);
  const imageUpgradeAbortRef = useRef<AbortController | undefined>(undefined);
  const [unusedImageScanChecking, setUnusedImageScanChecking] = useState(false);
  const [unusedImageScanProgress, setUnusedImageScanProgress] = useState<{ completed: number; total: number }>();
  const unusedImageScanRequestRef = useRef(0);
  const unusedImageScanRunningRef = useRef(false);
  const unusedImageScanAbortRef = useRef<AbortController | undefined>(undefined);
  const [imageDeleteProgress, setImageDeleteProgress] = useState<{ completed: number; total: number }>();
  const [containerMenu, setContainerMenu] = useState<{ key: string; name: string; running: boolean; paused: boolean }>();
  const [output, setOutput] = useState<unknown>("");
  const [localError, setLocalError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const [progressiveContainerStats, setProgressiveContainerStats] = useState<LuckyRecord>();
  const overviewActive = view === "overview" && isScreenFocused && appIsActive;
  const containerStatsActive =
    (view === "overview" || view === "containers") && isScreenFocused && appIsActive;
  useEffect(() => {
    if (requestedView) {
      setView(requestedView);
      setSearch(requestedSearch ?? "");
      setOutput("");
    } else if (requestedSearch !== undefined) {
      setSearch(requestedSearch);
    }
  }, [requestedSearch, requestedView]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppIsActive(state === "active");
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => () => {
    detailRequestRef.current += 1;
    unusedImageScanRequestRef.current += 1;
    imageUpgradeAbortRef.current?.abort();
    unusedImageScanAbortRef.current?.abort();
  }, []);
  const containers = useQuery({
    queryKey: ["docker", "containers"],
    queryFn: listDockerContainers,
    enabled: view === "containers",
  });
  const iconLibrary = useQuery({
    queryKey: ["iconlib", "icons"],
    queryFn: getIconLibraryIcons,
    enabled: view === "containers",
    staleTime: 30 * 60 * 1000,
  });
  const images = useQuery({
    queryKey: ["docker", "images"],
    queryFn: listDockerImages,
    enabled: view === "images",
  });
  const compose = useQuery({
    queryKey: ["docker", "compose"],
    queryFn: listDockerComposeProjects,
    enabled: view === "compose",
  });
  const networks = useQuery({
    queryKey: ["docker", "networks"],
    queryFn: listDockerNetworks,
    enabled: view === "networks",
  });
  const volumes = useQuery({
    queryKey: ["docker", "volumes"],
    queryFn: listDockerVolumes,
    enabled: view === "volumes",
  });
  const tasks = useQuery({
    queryKey: ["docker", "tasks"],
    queryFn: listDockerTasks,
    enabled: view === "tasks",
  });
  const overview = useQuery({
    queryKey: ["docker", "overview"],
    queryFn: getDockerOverview,
    enabled: overviewActive,
    staleTime: 30_000,
    refetchInterval: overviewActive ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
  const containerStats = useQuery({
    queryKey: ["docker", "container-stats"],
    queryFn: getAllDockerContainerStats,
    enabled: containerStatsActive,
    staleTime: 3_000,
    refetchOnMount: "always",
    refetchInterval: containerStatsActive ? 5_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const liveContainerStats = useQuery({
    queryKey: ["docker", "container-stats-live"],
    queryFn: () => refreshDockerContainerStats(setProgressiveContainerStats),
    enabled: containerStatsActive,
    staleTime: 5_000,
    refetchOnMount: "always",
    refetchInterval: containerStatsActive ? 15_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const config = useQuery({
    queryKey: ["docker", "config"],
    queryFn: getDockerConfig,
    enabled: view === "settings",
  });
  const mirrors = useQuery({
    queryKey: ["docker", "mirrors"],
    queryFn: getDockerRegistryMirrors,
    enabled: view === "settings",
  });
  const maintenance = useQuery({
    queryKey: ["docker", "maintenance"],
    queryFn: getDockerMaintenanceStatus,
    enabled: view === "settings",
  });
  const logs = useQuery({
    queryKey: ["docker", "logs"],
    queryFn: () => getDockerLogs(),
    enabled: view === "logs",
    refetchInterval: view === "logs" ? 15000 : false,
  });

  const mutation = useMutation({
    mutationFn: async ({
      type,
      key,
      value,
    }: {
      type: string;
      key?: string;
      value?: LuckyRecord;
    }) => {
      if (type === "container-create")
        return createDockerContainer(value ?? {});
      if (type === "container-edit")
        return editDockerContainer(key ?? "", value ?? {});
      if (type === "container-remove")
        return removeDockerContainer(key ?? "", true, false);
      if (type === "container-rename")
        return renameDockerContainer(key ?? "", String(value?.name ?? ""));
      if (type === "container-upgrade")
        return upgradeDockerContainer(key ?? "", value ?? {});
      if (type.startsWith("container-"))
        return runDockerContainerAction(
          key ?? "",
          type.replace("container-", "") as "start",
        );
      if (type === "image-pull") return pullDockerImage(value ?? {});
      if (type === "image-remove") return removeDockerImage(key ?? "", true);
      if (type === "images-remove-batch") {
        const ids = Array.isArray(value?.ids) ? value.ids.map(String).filter(Boolean) : [];
        if (!ids.length) throw new Error("未选择要删除的镜像");
        const result = await removeDockerImages(ids, (progress) => {
          setImageDeleteProgress({
            completed: Number(progress.completedCount) || 0,
            total: Number(progress.totalCount) || ids.length,
          });
        });
        if (Number(result.removedCount) === 0 && Number(result.failedCount) > 0) {
          const firstFailure = Array.isArray(result.failed) && result.failed[0] && typeof result.failed[0] === "object"
            ? String((result.failed[0] as LuckyRecord).error ?? "")
            : "";
          throw new Error(firstFailure || "批量删除镜像失败");
        }
        return result;
      }
      if (type === "image-tag")
        return tagDockerImage(
          key ?? "",
          String(value?.repository ?? ""),
          String(value?.tag ?? "latest"),
        );
      if (type === "image-build") return buildDockerImage(value ?? {});
      if (type === "compose-config-save") {
        const projectPath = String(value?.project_path ?? "").trim();
        const content = String(value?.content ?? "");
        if (!projectPath || !content.trim()) throw new Error("Compose 配置路径或内容为空");
        try {
          return await updateDockerComposeConfig(projectPath, content);
        } catch (error) {
          throw composeProjectError(error, projectPath);
        }
      }
      if (type === "compose-backup") {
        const projectPath = String(value?.project_path ?? "").trim();
        const projectName = String(value?.project_name ?? "").trim();
        if (!projectPath || !projectName) throw new Error("Compose 项目名称或路径缺失");
        const configResult = await getDockerConfig();
        const dockerConfig = nested(configResult, ["config", "data", "result"]);
        const backupPath = pickComposeField(dockerConfig, ["compose_backup_path"]);
        if (!backupPath) {
          throw new Error("请先在 Docker 设置中配置 Compose 备份路径");
        }
        try {
          await readDockerComposeConfig(projectPath);
          return await backupDockerCompose(projectPath, projectName);
        } catch (error) {
          const projectError = composeProjectError(error, projectPath);
          if (projectError === error && /^invalid request:?\s*$/i.test(projectError.message)) {
            throw new Error(
              `Compose 备份请求被服务端拒绝，请确认备份目录 ${backupPath} 已存在且 Lucky 具有写入权限。`,
            );
          }
          throw projectError;
        }
      }
      if (type.startsWith("compose-")) {
        const projectPath = String(value?.project_path ?? "").trim();
        const projectName = String(value?.project_name ?? "").trim();
        if (!projectPath || !projectName) throw new Error("Compose 项目名称或路径缺失");
        try {
          return await runDockerComposeAction(
            type.replace("compose-", "") as "up" | "down" | "start" | "stop" | "restart",
            { ...value, project_path: projectPath, project_name: projectName },
          );
        } catch (error) {
          throw composeProjectError(error, projectPath);
        }
      }
      if (type === "network-create") return createDockerNetwork(value ?? {});
      if (type === "network-remove") return removeDockerNetwork(key ?? "");
      if (type === "volume-create") return createDockerVolume(value ?? {});
      if (type === "volume-remove") return removeDockerVolume(key ?? "");
      if (type === "volume-backup") return backupDockerVolume(key ?? "");
      if (type === "volume-restore")
        return restoreDockerVolumeBackup(
          key ?? "",
          String(value?.backup ?? ""),
        );
      if (type === "task-remove") return removeDockerTask(key ?? "");
      if (type === "tasks-clear") return clearDockerTasks();
      if (type === "group-create") return createDockerContainerGroup(value ?? {});
      if (type === "group-remove") return removeDockerContainerGroup(String(value?.key ?? key ?? ""));
      if (type === "upgrade-status-clear") return clearDockerImageUpgradeStatus();
      if (type === "config-save") return updateDockerConfig(value ?? {});
      if (type === "prune") return pruneDocker(value ?? {});
      if (type === "mirror-add")
        return addDockerRegistryMirror(String(value?.mirror ?? ""));
      if (type === "mirror-remove")
        return removeDockerRegistryMirror(key ?? "");
      throw new Error("不支持的 Docker 操作");
    },
    onMutate: (variables) => {
      setLocalError("");
      setLocalNotice("");
      if (variables.type === "images-remove-batch") {
        const total = Array.isArray(variables.value?.ids) ? variables.value.ids.length : 0;
        setImageDeleteProgress({ completed: 0, total });
      } else {
        setImageDeleteProgress(undefined);
      }
    },
    onSuccess: async (result, variables) => {
      setEditor(undefined);
      setLocalError("");
      setImageDeleteProgress(undefined);
      await queryClient.invalidateQueries({ queryKey: ["docker"] });
      if (variables.type === "images-remove-batch") {
        const record = result as unknown as LuckyRecord;
        const removedCount = Number(record.removedCount) || 0;
        const failedCount = Number(record.failedCount) || 0;
        const failedIds = Array.isArray(record.failed)
          ? record.failed.map((item) => item && typeof item === "object" ? String((item as LuckyRecord).item ?? "") : "").filter(Boolean)
          : [];
        setSelectedImageIds(failedIds);
        setImageSelectionMode(Boolean(failedIds.length));
        setLocalNotice(`已删除 ${removedCount} 个镜像${failedCount ? `，${failedCount} 个删除失败` : ""}`);
      } else {
        setLocalNotice("操作已完成，数据已刷新");
      }
    },
    onError: (error) => {
      setLocalNotice("");
      setImageDeleteProgress(undefined);
      setLocalError(error.message);
    },
  });

  const active =
    view === "containers"
      ? containers
      : view === "images"
        ? images
        : view === "compose"
          ? compose
          : view === "networks"
            ? networks
            : view === "volumes"
              ? volumes
              : view === "tasks"
                ? tasks
                : view === "overview"
                  ? overview
                  : view === "logs"
                    ? logs
                    : config;
  const source =
    view === "containers"
      ? containers.data?.items
      : view === "images"
        ? images.data?.items
        : view === "compose"
          ? compose.data?.items
          : view === "networks"
            ? networks.data?.items
            : view === "volumes"
              ? volumes.data?.items
              : view === "tasks"
                ? tasks.data?.items
                : [];
  const filtered = useMemo(() => {
    const word = deferredSearch.trim().toLowerCase();
    return (source ?? []).filter(
      (item) => !word || JSON.stringify(item).toLowerCase().includes(word),
    );
  }, [source, deferredSearch]);
  const imageEntries = useMemo(
    () => (images.data?.items ?? []).map((item, index) => ({
      item,
      id: keyOf(item, index),
      references: imageReferences(item),
    })),
    [images.data?.items],
  );
  const visibleImageEntries = useMemo(() => {
    const word = deferredSearch.trim().toLowerCase();
    return imageEntries.filter(({ item }) => !word || JSON.stringify(item).toLowerCase().includes(word));
  }, [deferredSearch, imageEntries]);
  const imageIdSet = useMemo(() => new Set(imageEntries.map(({ id }) => id)), [imageEntries]);
  const validSelectedImageIds = useMemo(
    () => selectedImageIds.filter((id) => imageIdSet.has(id)),
    [imageIdSet, selectedImageIds],
  );
  const selectedImageSet = useMemo(() => new Set(validSelectedImageIds), [validSelectedImageIds]);
  const visibleImageIds = useMemo(() => visibleImageEntries.map(({ id }) => id), [visibleImageEntries]);
  const allVisibleImagesSelected = visibleImageIds.length > 0 && visibleImageIds.every((id) => selectedImageSet.has(id));
  const hasImageUpgradeTargets = validSelectedImageIds.length > 0 || visibleImageEntries.length > 0;
  const imageSelectionBusy = mutation.isPending || unusedImageScanChecking;
  const imageActionBusy = imageSelectionBusy || imageUpgradeChecking;
  useEffect(() => {
    unusedImageScanRequestRef.current += 1;
    unusedImageScanAbortRef.current?.abort();
    setSelectedImageIds((current) => {
      const next = current.filter((id) => imageIdSet.has(id));
      return next.length === current.length ? current : next;
    });
  }, [imageIdSet]);
  useEffect(() => {
    if (view === "images") return;
    unusedImageScanRequestRef.current += 1;
    unusedImageScanAbortRef.current?.abort();
    setImageSelectionMode(false);
    setSelectedImageIds((current) => current.length ? [] : current);
  }, [view]);
  const containerStatsSource = useMemo(
    () => [containerStats.data, liveContainerStats.data, progressiveContainerStats],
    [containerStats.data, liveContainerStats.data, progressiveContainerStats],
  );
  const containerStatRows = useMemo(
    () => dockerStatRows(containerStatsSource, containers.data?.items ?? emptyDockerContainers),
    [containerStatsSource, containers.data?.items],
  );
  const containerStatsByKey = useMemo(() => {
    const result = new Map<string, DockerStatRow>();
    containerStatRows.forEach((row) => {
      result.set(row.key, row);
      result.set(row.name, row);
    });
    return result;
  }, [containerStatRows]);
  const danger = (title: string, message: string, action: () => void) =>
    Alert.alert(title, message, [
      { text: "取消", style: "cancel" },
      { text: "继续", style: "destructive", onPress: action },
    ]);
  const closeDetail = () => {
    detailRequestRef.current += 1;
    imageUpgradeAbortRef.current?.abort();
    setDetail(undefined);
  };
  async function openDetail(title: string, request: () => Promise<unknown>) {
    const requestId = ++detailRequestRef.current;
    setDetail({ title, loading: true });
    try {
      const value = await request();
      if (detailRequestRef.current === requestId) setDetail({ title, value });
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setDetail({ title, error: error instanceof Error ? error.message : "读取详情失败" });
      }
    }
  }
  function toggleImageSelection(id: string) {
    if (imageActionBusy) return;
    setSelectedImageIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  function toggleImageSelectionMode() {
    if (mutation.isPending || imageUpgradeChecking) return;
    if (unusedImageScanChecking) {
      unusedImageScanRequestRef.current += 1;
      unusedImageScanAbortRef.current?.abort();
    }
    setImageSelectionMode((current) => {
      if (current) setSelectedImageIds([]);
      return !current;
    });
  }
  function toggleVisibleImageSelection() {
    if (imageActionBusy || !visibleImageIds.length) return;
    setSelectedImageIds((current) => {
      const next = new Set(current.filter((id) => imageIdSet.has(id)));
      if (visibleImageIds.every((id) => next.has(id))) {
        visibleImageIds.forEach((id) => next.delete(id));
      } else {
        visibleImageIds.forEach((id) => next.add(id));
      }
      return [...next];
    });
  }
  async function selectUnusedImages() {
    if (imageActionBusy || unusedImageScanRunningRef.current || !visibleImageIds.length) return;
    const requestId = ++unusedImageScanRequestRef.current;
    const total = visibleImageIds.length;
    const controller = new AbortController();
    unusedImageScanAbortRef.current = controller;
    unusedImageScanRunningRef.current = true;
    setUnusedImageScanChecking(true);
    setLocalError("");
    setLocalNotice("");
    setUnusedImageScanProgress({ completed: 0, total });
    try {
      const result = await scanUnusedDockerImages(
        visibleImageIds,
        (progress) => {
          if (unusedImageScanRequestRef.current !== requestId) return;
          setUnusedImageScanProgress({
            completed: Number(progress.completedCount) || 0,
            total: Number(progress.totalCount) || total,
          });
        },
        controller.signal,
      );
      if (unusedImageScanRequestRef.current !== requestId) return;
      const unusedIds = Array.isArray(result.unused) ? result.unused.map(String).filter((id) => imageIdSet.has(id)) : [];
      const usedCount = Number(result.usedCount) || 0;
      const failedCount = Number(result.failedCount) || 0;
      setSelectedImageIds(unusedIds);
      if (!unusedIds.length && !usedCount && failedCount) {
        const firstFailure = Array.isArray(result.failed) && result.failed[0] && typeof result.failed[0] === "object"
          ? String((result.failed[0] as LuckyRecord).error ?? "")
          : "";
        setLocalError(firstFailure || "未能确认镜像使用情况");
      } else {
        setLocalNotice(`已选择 ${unusedIds.length} 个未使用镜像，${usedCount} 个正在使用${failedCount ? `，${failedCount} 个无法确认` : ""}`);
      }
    } catch (error) {
      if (unusedImageScanRequestRef.current === requestId) {
        setLocalError(error instanceof Error ? error.message : "检查镜像使用情况失败");
      }
    } finally {
      unusedImageScanRunningRef.current = false;
      if (unusedImageScanAbortRef.current === controller) unusedImageScanAbortRef.current = undefined;
      setUnusedImageScanChecking(false);
      setUnusedImageScanProgress(undefined);
    }
  }
  async function detectImageUpgrades() {
    if (imageActionBusy || imageUpgradeRunningRef.current) return;
    setLocalError("");
    setLocalNotice("");
    const hasExplicitSelection = validSelectedImageIds.length > 0;
    const targets = hasExplicitSelection
      ? imageEntries.filter((item) => selectedImageSet.has(item.id))
      : visibleImageEntries;
    const references = [...new Set(hasExplicitSelection
      ? targets.flatMap((item) => item.references)
      : targets.map((item) => item.references[0]).filter(Boolean))];
    if (!references.length) {
      setLocalError("没有可检测升级的镜像标签");
      return;
    }
    const title = `检测镜像升级 · ${references.length} 个${hasExplicitSelection ? "标签" : "镜像主标签"}`;
    const requestId = ++detailRequestRef.current;
    const controller = new AbortController();
    imageUpgradeAbortRef.current = controller;
    imageUpgradeRunningRef.current = true;
    setImageUpgradeChecking(true);
    setDetail({
      title,
      loading: true,
      status: `正在检测 0/${references.length}`,
      value: { completedCount: 0, totalCount: references.length, checkedCount: 0, failedCount: 0, inProgress: true },
    });
    try {
      const checked = await checkDockerImagesUpgrade(
        references,
        (progress) => {
          if (detailRequestRef.current !== requestId) return;
          const completed = Number(progress.completedCount) || 0;
          const total = Number(progress.totalCount) || references.length;
          setDetail({ title, value: progress, loading: completed < total, status: `正在检测 ${completed}/${total}` });
        },
        controller.signal,
      );
      if (detailRequestRef.current !== requestId) return;
      setDetail({ title, value: checked, loading: true, status: "正在读取升级状态" });
      try {
        const imageUpgrades = await getDockerImageUpgradeStatus("", controller.signal);
        if (detailRequestRef.current === requestId) setDetail({ title, value: { ...checked, imageUpgrades } });
      } catch (error) {
        if (detailRequestRef.current === requestId) {
          setDetail({
            title,
            value: { ...checked, statusError: error instanceof Error ? error.message : "读取升级状态失败" },
          });
        }
      }
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setDetail({ title, error: error instanceof Error ? error.message : "检测镜像升级失败" });
      }
    } finally {
      imageUpgradeRunningRef.current = false;
      if (imageUpgradeAbortRef.current === controller) imageUpgradeAbortRef.current = undefined;
      setImageUpgradeChecking(false);
      void queryClient.invalidateQueries({ queryKey: ["docker", "maintenance"] });
    }
  }
  function removeSelectedImages() {
    if (imageActionBusy) return;
    if (!validSelectedImageIds.length) {
      setLocalError("请先选择要删除的镜像");
      return;
    }
    danger("批量删除镜像", `确定删除已选择的 ${validSelectedImageIds.length} 个镜像？正在使用的镜像会自动跳过。`, () =>
      mutation.mutate({ type: "images-remove-batch", value: { ids: validSelectedImageIds } }),
    );
  }
  async function inspect(kind: "container" | "image" | "task", key: string) {
    const title = kind === "container" ? "容器详情" : kind === "image" ? "镜像详情" : "任务详情";
    await openDetail(title, () =>
        kind === "container"
          ? getDockerContainer(key)
          : kind === "image"
            ? getDockerImage(key)
            : getDockerTask(key),
    );
  }
  async function containerLogs(key: string) {
    try {
      setOutput(await getDockerContainerLogs(key));
      setView("logs");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取日志失败");
    }
  }
  async function composeLogs(name: string) {
    try {
      setLocalError("");
      setLocalNotice("");
      setOutput(await getDockerComposeLogs(name, { tail: 200 }));
      setView("logs");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取 Compose 日志失败");
    }
  }
  async function editComposeConfig(projectPath: string) {
    try {
      setLocalError("");
      setLocalNotice("");
      const result = await readDockerComposeConfig(projectPath);
      const content = composeConfigText(result);
      if (!content) throw new Error("接口未返回 Compose 配置内容");
      setEditor({
        type: "compose-config",
        title: "编辑 Compose 配置",
        key: projectPath,
        value: {
          project_path: projectPath,
          content,
        },
      });
    } catch (error) {
      setLocalError(composeProjectError(error, projectPath).message);
    }
  }
  async function editContainer(key: string) {
    try {
      const result = await getDockerContainer(key);
      setEditor({
        type: "container-edit",
        title: "编辑容器",
        key,
        value: nested(result, ["container", "data"]),
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取容器配置失败");
    }
  }
  async function updateContainer(key: string, name: string) {
    try {
      setLocalError("");
      const result = await checkDockerContainerUpgrade(key);
      const value = { ...nested(result, ["data", "result", "upgrade", "config"]) };
      delete value.ret;
      delete value.msg;
      setEditor({
        type: "container-upgrade",
        title: `更新容器 ${name}`,
        key,
        value,
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "检查容器更新失败");
    }
  }

  return (
    <Page
      title="Docker"
      subtitle="容器、镜像与 Compose 管理"
      icon={Container}
      safeTop={false}
      contentMaxWidth={view === "overview" ? 1120 : 820}
      refreshing={active.isFetching || (view === "settings" && maintenance.isFetching)}
      onRefresh={() => {
        active.refetch();
        if (view === "overview" || view === "containers") {
          containerStats.refetch();
          liveContainerStats.refetch();
        }
        if (view === "settings") {
          mirrors.refetch();
          maintenance.refetch();
        }
      }}
    >
      <ResponsiveTabBar
        tabs={tabs}
        value={view}
        onChange={(key) => {
          setView(key);
          setSearch("");
          setOutput("");
        }}
      />
      {localError ? <ErrorState message={localError} /> : null}
      {localNotice ? <View style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.successBg, justifyContent: "center" }}><Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>{localNotice}</Text></View> : null}
      {active.error ? (
        <ErrorState
          message={active.error.message}
          retry={() => active.refetch()}
        />
      ) : null}
      {!containerStats.data && !liveContainerStats.data && !progressiveContainerStats && containerStats.error && liveContainerStats.error && (view === "overview" || view === "containers") ? (
        <ErrorState
          message="容器统计暂时不可用"
          retry={() => {
            containerStats.refetch();
            liveContainerStats.refetch();
          }}
        />
      ) : null}
      {[
        "containers",
        "images",
        "compose",
        "networks",
        "volumes",
        "tasks",
      ].includes(view) ? (
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={`搜索${tabs.find(([key]) => key === view)?.[1] ?? ""}`}
        />
      ) : null}

      {view === "containers" ? (
        <>
          <SectionHeader
            icon={Container}
            title="容器"
            meta={`${filtered.length} 项`}
          />
          <Pressable
            onPress={() =>
              setEditor({
                type: "container-create",
                title: "创建容器",
                value: { name: "", image: "", config: {} },
              })
            }
            style={{
              height: 46,
              borderRadius: 12,
              backgroundColor: colors.primary,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Plus color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>创建容器</Text>
          </Pressable>
          {filtered.length ? (
            filtered.map((item, index) => {
              const key = keyOf(item, index);
              const state = dockerContainerState(item);
              const paused = state === "paused";
              const running = state === "running" || paused;
              const name = pick(
                item,
                ["Names", "Name", "name"],
                key.slice(0, 12),
              );
              const displayName = name.replace(/^\/+/, "") || name;
              const stats = containerStatsByKey.get(key) ?? containerStatsByKey.get(displayName);
              return (
                <View key={key} style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 12, shadowColor: colors.shadow, shadowOpacity: Platform.OS === "ios" || Platform.OS === "web" ? 0.055 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: Platform.OS === "android" ? 2 : 0 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`打开容器 ${displayName} 操作菜单`} onPress={() => setContainerMenu({ key, name, running, paused })} style={({ pressed }) => ({ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 11, opacity: pressed ? 0.62 : 1 })}>
                    <ContainerArtwork item={item} icons={iconLibrary.data ?? []} running={running} size={48} />
                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <Text numberOfLines={1} style={{ width: "100%", color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: "800" }}>{displayName}</Text>
                      <View style={{ alignSelf: "flex-start", maxWidth: "100%", minHeight: 24, paddingHorizontal: 8, borderRadius: 8, backgroundColor: running ? colors.successBg : colors.mutedCard, flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: running ? colors.success : colors.disabled }} />
                        <Text numberOfLines={1} style={{ flexShrink: 1, color: running ? colors.success : colors.subtext, fontSize: 10, lineHeight: 13, fontWeight: "600" }}>{containerStatus(item, running, paused)}</Text>
                      </View>
                    </View>
                    <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}>
                      <Ellipsis color={colors.subtext} size={18} />
                    </View>
                  </Pressable>
                  <ContainerStatsGrid stats={stats} />
                  <View style={{ height: 1, backgroundColor: colors.rowBorder }} />
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {paused ? (
                      <ContainerCommandButton
                        icon={Play}
                        label="恢复"
                        color={colors.success}
                        onPress={() =>
                          mutation.mutate({ type: "container-unpause", key })
                        }
                      />
                    ) : !running ? (
                      <ContainerCommandButton
                        icon={Play}
                        label="启动"
                        color={colors.success}
                        onPress={() =>
                          mutation.mutate({ type: "container-start", key })
                        }
                      />
                    ) : (
                      <ContainerCommandButton
                        icon={CircleStop}
                        label="停止"
                        color={colors.danger}
                        onPress={() =>
                          danger("确认停止", `停止容器 ${name}？`, () =>
                            mutation.mutate({ type: "container-stop", key }),
                          )
                        }
                      />
                    )}
                    <ContainerCommandButton
                      icon={RotateCw}
                      label="重启"
                      color={colors.primary}
                      onPress={() =>
                        danger("确认重启", `重启容器 ${name}？`, () =>
                          mutation.mutate({ type: "container-restart", key }),
                        )
                      }
                    />
                    <ContainerCommandButton
                      icon={UploadCloud}
                      label="更新"
                      color={colors.cyan}
                      onPress={() => updateContainer(key, displayName)}
                    />
                  </View>
                </View>
              );
            })
          ) : !containers.isLoading ? (
            <EmptyState message="暂无容器" icon={Container} />
          ) : null}
        </>
      ) : null}

      {view === "images" ? (
        <>
          <SectionHeader
            icon={Image}
            title="镜像列表"
            meta={`${visibleImageEntries.length} 项`}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() =>
                setEditor({
                  type: "image-pull",
                  title: "拉取镜像",
                  value: { image: "", tag: "latest", architecture: "" },
                })
              }
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 6,
              }}
            >
              <UploadCloud color="#fff" size={16} />
              <Text style={{ color: "#fff", fontWeight: "800" }}>拉取</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                setEditor({ type: "image-build", title: "构建镜像", value: {} })
              }
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 6,
              }}
            >
              <Wrench color={colors.primary} size={16} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>
                构建
              </Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={validSelectedImageIds.length ? `检测已选择的 ${validSelectedImageIds.length} 个镜像升级` : `检测当前 ${visibleImageEntries.length} 个镜像升级`}
              accessibilityState={{ disabled: images.isLoading || !hasImageUpgradeTargets || imageActionBusy }}
              disabled={images.isLoading || !hasImageUpgradeTargets || imageActionBusy}
              onPress={() => void detectImageUpgrades()}
              style={({ pressed }) => ({
                flex: 1,
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: colors.primarySoft,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: images.isLoading || !hasImageUpgradeTargets || imageActionBusy ? 0.45 : pressed ? 0.62 : 1,
              })}
            >
              {imageUpgradeChecking ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={16} />}
              <Text style={{ color: colors.primary, fontWeight: "800" }}>{imageUpgradeChecking ? "检测中" : "检测升级"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: imageSelectionMode, disabled: mutation.isPending || imageUpgradeChecking }}
              disabled={mutation.isPending || imageUpgradeChecking}
              onPress={toggleImageSelectionMode}
              style={({ pressed }) => ({
                flex: 1,
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: imageSelectionMode ? colors.danger : colors.border,
                backgroundColor: imageSelectionMode ? colors.dangerBg : colors.card,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: mutation.isPending || imageUpgradeChecking ? 0.45 : pressed ? 0.62 : 1,
              })}
            >
              <ListChecks color={imageSelectionMode ? colors.danger : colors.text} size={16} />
              <Text style={{ color: imageSelectionMode ? colors.danger : colors.text, fontWeight: "800" }}>{imageSelectionMode ? "退出批量" : "批量删除"}</Text>
            </Pressable>
          </View>
          {imageSelectionMode ? <View style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>已选择 {validSelectedImageIds.length} 项</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={allVisibleImagesSelected ? "取消选择当前显示的全部镜像" : "选择当前显示的全部镜像"}
                accessibilityState={{ checked: allVisibleImagesSelected, disabled: !visibleImageIds.length || imageActionBusy }}
                disabled={!visibleImageIds.length || imageActionBusy}
                onPress={toggleVisibleImageSelection}
                style={{ flex: 1, height: 44, paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: !visibleImageIds.length || imageActionBusy ? 0.45 : 1 }}
              >
                <ListChecks color={colors.primary} size={15} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{allVisibleImagesSelected ? "取消全选" : "全选"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={unusedImageScanChecking ? "正在检查未使用镜像" : "选择当前显示的未使用镜像"}
                accessibilityState={{ disabled: !visibleImageIds.length || imageActionBusy }}
                disabled={!visibleImageIds.length || imageActionBusy}
                onPress={() => void selectUnusedImages()}
                style={{ flex: 1, height: 44, paddingHorizontal: 10, borderRadius: 11, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: unusedImageScanChecking ? 1 : !visibleImageIds.length || imageActionBusy ? 0.45 : 1 }}
              >
                {unusedImageScanChecking ? <ActivityIndicator color={colors.primary} size="small" /> : <PackageSearch color={colors.primary} size={15} />}
                <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>{unusedImageScanChecking ? unusedImageScanProgress ? `${unusedImageScanProgress.completed}/${unusedImageScanProgress.total}` : "检查中" : "选择未使用"}</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`删除已选择的 ${validSelectedImageIds.length} 个镜像`}
              accessibilityState={{ disabled: !validSelectedImageIds.length || imageActionBusy }}
              disabled={!validSelectedImageIds.length || imageActionBusy}
              onPress={removeSelectedImages}
              style={{ width: "100%", height: 44, paddingHorizontal: 10, borderRadius: 11, backgroundColor: validSelectedImageIds.length ? colors.dangerBg : colors.muted, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, opacity: imageActionBusy && !imageDeleteProgress ? 0.45 : 1 }}
            >
              {imageDeleteProgress ? <ActivityIndicator color={colors.danger} size="small" /> : <Trash2 color={validSelectedImageIds.length ? colors.danger : colors.disabled} size={15} />}
              <Text style={{ color: validSelectedImageIds.length ? colors.danger : colors.disabled, fontSize: 12, fontWeight: "700" }}>{imageDeleteProgress ? `删除中 ${imageDeleteProgress.completed}/${imageDeleteProgress.total}` : "删除所选"}</Text>
            </Pressable>
          </View> : null}
          {visibleImageEntries.length ? (
            visibleImageEntries.map(({ item, id: key }) => {
              const name = pick(item, ["RepoTags", "Tags", "Name"], "<none>");
              const selected = selectedImageSet.has(key);
              return (
                <Panel key={key}>
                  <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}>
                    {imageSelectionMode ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: imageActionBusy }} accessibilityLabel={`选择镜像 ${name}`} disabled={imageActionBusy} onPress={() => toggleImageSelection(key)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: imageActionBusy ? 0.45 : 1 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: selected ? colors.danger : colors.border, backgroundColor: selected ? colors.danger : colors.card, alignItems: "center", justifyContent: "center" }}>
                        {selected ? <Check color="#fff" size={15} strokeWidth={2.6} /> : null}
                      </View>
                    </Pressable> : null}
                    <IconTile icon={Image} color={colors.warning} background={colors.warningBg} size={38} iconSize={19} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={2}
                        style={{ color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: "800" }}
                      >
                        {name}
                      </Text>
                      <Text
                        style={{
                          color: colors.subtext,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        {key.slice(0, 16)} · {bytes(item.Size)}
                      </Text>
                    </View>
                  </View>
                  {!imageSelectionMode ? <>
                    <View style={{ height: 1, backgroundColor: colors.rowBorder }} />
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                    <IconButton
                      icon={Search}
                      label="详情"
                      color={colors.text}
                      fluid
                      onPress={() => inspect("image", key)}
                    />
                    <IconButton
                      icon={Pencil}
                      label="标记"
                      color={colors.primary}
                      fluid
                      onPress={() =>
                        setEditor({
                          type: "image-tag",
                          title: "添加镜像标签",
                          key,
                          value: { repository: "", tag: "latest" },
                        })
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      label="删除"
                      color={colors.danger}
                      fluid
                      onPress={() =>
                        danger("确认删除", `删除镜像 ${name}？`, () =>
                          mutation.mutate({
                            type: "image-remove",
                            key: name !== "<none>" ? name.split(",")[0] : key,
                          }),
                        )
                      }
                    />
                    </View>
                  </> : null}
                </Panel>
              );
            })
          ) : !images.isLoading ? (
            <EmptyState message="暂无镜像" icon={Image} />
          ) : null}
        </>
      ) : null}

      {view === "compose" ? (
        <>
          <SectionHeader
            icon={Workflow}
            title="Compose 项目"
            meta={`${filtered.length} 项`}
          />
          <Pressable
            onPress={() =>
              setEditor({
                type: "compose-discover",
                title: "发现 Compose 项目",
                value: { scan_path: "" },
              })
            }
            style={{
              height: 46,
              borderRadius: 12,
              backgroundColor: colors.primary,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Search color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>扫描项目</Text>
          </Pressable>
          {filtered.length ? (
            filtered.map((item, index) => {
              const payload = composePayload(item);
              const key = [payload.project_name, payload.project_path]
                .filter(Boolean)
                .join(":") || keyOf(item, index);
              const name = payload.project_name || key;
              return (
                <Panel key={key}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 9,
                    }}
                  >
                    <IconTile icon={Workflow} size={40} iconSize={20} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "800" }}>
                        {name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ color: colors.subtext, fontSize: 11 }}
                      >
                        {payload.project_path}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
                  >
                    <IconButton
                      icon={Play}
                      label="启动"
                      color={colors.success}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() =>
                        mutation.mutate({ type: "compose-start", value: payload })
                      }
                    />
                    <IconButton
                      icon={CircleStop}
                      label="停止"
                      color={colors.danger}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() =>
                        danger("确认停止", `停止 Compose 项目 ${name}？`, () =>
                          mutation.mutate({
                            type: "compose-stop",
                            value: payload,
                          }),
                        )
                      }
                    />
                    <IconButton
                      icon={RotateCw}
                      label="重启"
                      color={colors.primary}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() =>
                        mutation.mutate({
                          type: "compose-restart",
                          value: payload,
                        })
                      }
                    />
                    <IconButton
                      icon={FileText}
                      label="日志"
                      color={colors.cyan}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => void composeLogs(name)}
                    />
                    <IconButton
                      icon={Save}
                      label="备份"
                      color={colors.warning}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() =>
                        danger("确认备份", `备份 Compose 项目 ${name}？`, () =>
                          mutation.mutate({ type: "compose-backup", value: payload }),
                        )
                      }
                    />
                    <IconButton
                      icon={Pencil}
                      label="编辑配置"
                      color={colors.primary}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => void editComposeConfig(payload.project_path)}
                    />
                  </View>
                </Panel>
              );
            })
          ) : !compose.isLoading ? (
            <EmptyState message="暂无 Compose 项目" icon={Workflow} />
          ) : null}
        </>
      ) : null}

      {view === "networks" ? (
        <>
          <SectionHeader
            icon={Network}
            title="Docker 网络"
            meta={`${filtered.length} 项`}
          />
          <Pressable
            onPress={() =>
              setEditor({
                type: "network-create",
                title: "创建网络",
                value: { Name: "", Driver: "bridge", Options: {}, IPAM: {} },
              })
            }
            style={{
              height: 46,
              borderRadius: 12,
              backgroundColor: colors.primary,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Plus color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>创建网络</Text>
          </Pressable>
          {filtered.map((item, index) => {
            const key = keyOf(item, index);
            const name = pick(item, ["Name", "name"], key);
            return (
              <Panel key={key}>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <IconTile icon={Network} color={colors.cyan} background={colors.cyanBg} size={38} iconSize={19} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {name}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>
                      {pick(item, ["Driver"])} · {pick(item, ["Scope"])}
                    </Text>
                  </View>
                  <IconButton
                    icon={Trash2}
                    label="删除"
                    color={colors.danger}
                    onPress={() =>
                      danger("确认删除", `删除网络 ${name}？`, () =>
                        mutation.mutate({ type: "network-remove", key }),
                      )
                    }
                  />
                </View>
              </Panel>
            );
          })}
        </>
      ) : null}

      {view === "volumes" ? (
        <>
          <SectionHeader
            icon={Database}
            title="数据卷"
            meta={`${filtered.length} 项`}
          />
          <Pressable
            onPress={() =>
              setEditor({
                type: "volume-create",
                title: "创建数据卷",
                value: {
                  Name: "",
                  Driver: "local",
                  DriverOpts: {},
                  Labels: {},
                },
              })
            }
            style={{
              height: 46,
              borderRadius: 12,
              backgroundColor: colors.primary,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Plus color="#fff" size={17} />
            <Text style={{ color: "#fff", fontWeight: "800" }}>创建数据卷</Text>
          </Pressable>
          {filtered.map((item, index) => {
            const key = keyOf(item, index);
            const name = pick(item, ["Name", "name"], key);
            return (
              <Panel key={key}>
                <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <IconTile icon={Database} color={colors.warning} background={colors.warningBg} size={38} iconSize={19} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: "800" }}>
                      {name}
                    </Text>
                    <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 11, lineHeight: 15, marginTop: 3 }}>
                      {pick(item, ["Driver"], "local")} ·{" "}
                      {pick(item, ["Mountpoint"])}
                    </Text>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: colors.rowBorder }} />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                  <IconButton
                    icon={Save}
                    label="备份"
                    color={colors.primary}
                    fluid
                    basis={120}
                    onPress={() =>
                      mutation.mutate({ type: "volume-backup", key: name })
                    }
                  />
                  <IconButton
                    icon={Search}
                    label="备份列表"
                    color={colors.text}
                    fluid
                    basis={120}
                    onPress={() => void openDetail(`备份列表 · ${name}`, () => listDockerVolumeBackups(name))}
                  />
                  <IconButton
                    icon={RotateCw}
                    label="恢复备份"
                    color={colors.warning}
                    fluid
                    basis={120}
                    onPress={() =>
                      setEditor({
                        type: "volume-restore",
                        title: "恢复数据卷备份",
                        key: name,
                        value: { backup: "" },
                      })
                    }
                  />
                  <IconButton
                    icon={Trash2}
                    label="删除"
                    color={colors.danger}
                    fluid
                    basis={120}
                    onPress={() =>
                      danger("确认删除", `删除数据卷 ${name}？`, () =>
                        mutation.mutate({ type: "volume-remove", key: name }),
                      )
                    }
                  />
                </View>
              </Panel>
            );
          })}
        </>
      ) : null}

      {view === "tasks" ? (
        <>
          <SectionHeader
            icon={Activity}
            title="后台任务"
            meta={`${filtered.length} 项`}
          />
          <Pressable
            onPress={() =>
              danger("清空任务", "删除全部 Docker 任务记录？", () =>
                mutation.mutate({ type: "tasks-clear" }),
              )
            }
            style={{
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.danger,
              backgroundColor: colors.dangerBg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Trash2 color={colors.danger} size={16} />
            <Text style={{ color: colors.danger, fontWeight: "800" }}>
              清空任务
            </Text>
          </Pressable>
          {filtered.map((item, index) => {
            const key = keyOf(item, index);
            return (
              <Panel key={key}>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9 }}
                >
                  <IconTile icon={Activity} size={36} iconSize={18} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {pick(item, ["Name", "Type", "Action"], key)}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>
                      {pick(item, ["Status", "state", "Progress"])}
                    </Text>
                  </View>
                  <IconButton
                    icon={Search}
                    label="详情"
                    color={colors.text}
                    onPress={() => inspect("task", key)}
                  />
                  <IconButton
                    icon={Trash2}
                    label="删除"
                    color={colors.danger}
                    onPress={() =>
                      mutation.mutate({ type: "task-remove", key })
                    }
                  />
                </View>
              </Panel>
            );
          })}
        </>
      ) : null}

      {view === "overview" ? (
        <DockerOverviewDashboard
          data={overview.data}
          active={overviewActive}
          stats={containerStatsSource}
          statsLoading={!containerStats.data && !liveContainerStats.data && !progressiveContainerStats && (containerStats.isLoading || liveContainerStats.isLoading)}
          statsError={!containerStats.data && !liveContainerStats.data && !progressiveContainerStats && containerStats.error && liveContainerStats.error ? "容器统计暂时不可用" : undefined}
          onSelectView={(nextView) => {
            setView(nextView);
            setSearch("");
            setOutput("");
          }}
          onSelectContainer={(name) => {
            setView("containers");
            setSearch(name);
            setOutput("");
          }}
        />
      ) : null}

      {view === "settings" ? (
        <>
          <SectionHeader icon={Settings2} title="Docker 设置" />
          {config.data ? (
            <Pressable
              onPress={() =>
                setEditor({
                  type: "config-save",
                  title: "编辑 Docker 设置",
                  value: nested(config.data, ["config", "data"]),
                })
              }
              style={{
                height: 46,
                borderRadius: 12,
                backgroundColor: colors.primary,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              <Settings2 color="#fff" size={17} />
              <Text style={{ color: "#fff", fontWeight: "800" }}>编辑设置</Text>
            </Pressable>
          ) : null}
          {maintenance.error ? <ErrorState message={maintenance.error.message} retry={() => maintenance.refetch()} /> : null}
          <SectionHeader icon={Activity} title="维护状态" meta={maintenance.isFetching ? "正在刷新" : "7 个接口"} />
          {maintenance.data ? <>
            <Panel>
              <SectionHeader icon={Box} title="分组与标签" />
              <StructuredDataView value={{ labels: maintenance.data.labels, containerGroups: maintenance.data.containerGroups, collapsedStates: maintenance.data.collapsedStates, orderMapping: maintenance.data.orderMapping }} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => setEditor({ type: "group-create", title: "添加容器分组", value: { Name: "", Key: "" } })}
                  style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
                ><Plus color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: "700" }}>添加分组</Text></Pressable>
                <Pressable
                  onPress={() => setEditor({ type: "group-remove", title: "删除容器分组", value: { key: "" } })}
                  style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerBg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
                ><Trash2 color={colors.danger} size={15} /><Text style={{ color: colors.danger, fontWeight: "700" }}>删除分组</Text></Pressable>
              </View>
            </Panel>
            <Panel>
              <SectionHeader icon={Database} title="备份任务" />
              <StructuredDataView value={{ composeBackup: maintenance.data.composeBackup, volumeBackup: maintenance.data.volumeBackup }} />
            </Panel>
            <Panel>
              <SectionHeader icon={Image} title="镜像升级" />
              <StructuredDataView value={maintenance.data.imageUpgrades} />
              <Pressable
                onPress={() => danger("清除升级状态", "确定清除全部镜像升级检查记录吗？", () => mutation.mutate({ type: "upgrade-status-clear" }))}
                style={{ minHeight: 44, borderRadius: 12, backgroundColor: colors.dangerBg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
              ><Trash2 color={colors.danger} size={15} /><Text style={{ color: colors.danger, fontWeight: "700" }}>清除升级状态</Text></Pressable>
            </Panel>
          </> : null}
          <Panel>
            <Text style={{ color: colors.text, fontWeight: "800" }}>
              Registry Mirrors
            </Text>
            <StructuredDataView value={mirrors.data?.mirrors ?? mirrors.data?.list ?? []} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() =>
                  setEditor({
                    type: "mirror-add",
                    title: "添加镜像加速地址",
                    value: { mirror: "" },
                  })
                }
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  backgroundColor: colors.primarySoft,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Plus color={colors.primary} size={15} />
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  添加
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setEditor({
                    type: "mirror-remove",
                    title: "删除镜像加速地址",
                    value: { mirror: "" },
                  })
                }
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.danger,
                  backgroundColor: colors.dangerBg,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Trash2 color={colors.danger} size={15} />
                <Text style={{ color: colors.danger, fontWeight: "700" }}>
                  删除
                </Text>
              </Pressable>
            </View>
          </Panel>
          <Pressable
            onPress={() =>
              setEditor({
                type: "prune",
                title: "清理 Docker 资源",
                value: {
                  containers: true,
                  images: true,
                  networks: true,
                  volumes: false,
                  build_cache: true,
                },
              })
            }
            style={{
              minHeight: 46,
              borderRadius: 12,
              backgroundColor: colors.dangerBg,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <ShieldAlert color={colors.danger} size={17} />
            <Text style={{ color: colors.danger, fontWeight: "800" }}>
              清理未使用资源
            </Text>
          </Pressable>
        </>
      ) : null}

      {view === "logs" ? (
        <>
          <SectionHeader icon={FileText} title="Docker 日志" />
          {output ? (
            <Panel><StructuredDataView value={output} /></Panel>
          ) : lines(logs.data).length ? (
            <Panel>
              {lines(logs.data).map((line, index) => (
                <Text
                  selectable
                  key={`${index}-${line.slice(0, 10)}`}
                  style={{
                    color: colors.text,
                    fontFamily: "monospace",
                    fontSize: 10,
                    lineHeight: 17,
                    paddingTop: index ? 5 : 0,
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.rowBorder,
                  }}
                >
                  {line}
                </Text>
              ))}
            </Panel>
          ) : !logs.isLoading ? (
            <EmptyState message="暂无 Docker 日志" icon={FileText} />
          ) : null}
        </>
      ) : null}

      {detail ? <DockerDetailViewer detail={detail} close={closeDetail} /> : null}
      {editor ? (
        <DockerFormEditor
          key={`${editor.type}-${editor.key ?? "new"}`}
          editor={editor}
          busy={mutation.isPending}
          close={() => setEditor(undefined)}
          save={async (value) => {
            if (editor.type === "container-files") {
              const operation = String(value.operation ?? "list");
              const request = { ...value };
              delete request.operation;
              const readOperations = [
                "list",
                "read",
                "download",
                "preview-archive",
              ];
              const result = await callDockerApi(
                `containers/${encodeURIComponent(editor.key ?? "")}/files/${operation}`,
                readOperations.includes(operation) ? "GET" : "POST",
                readOperations.includes(operation) ? undefined : request,
                readOperations.includes(operation) ? request : undefined,
                operation.includes("async") ? 600000 : undefined,
              );
              setEditor(undefined);
              setDetail({ title: "文件操作结果", value: result });
              return;
            }
            if (editor.type === "compose-discover") {
              const result = await discoverDockerCompose(String(value.scan_path ?? ""));
              setEditor(undefined);
              setDetail({ title: "Compose 扫描结果", value: result });
              return;
            }
            if (editor.type === "compose-config") {
              mutation.mutate({
                type: "compose-config-save",
                value: {
                  ...value,
                  project_path: String(value.project_path ?? editor.key ?? ""),
                },
              });
              return;
            }
            if (editor.type === "mirror-remove") {
              mutation.mutate({
                type: "mirror-remove",
                key: String(value.mirror ?? ""),
              });
              return;
            }
            mutation.mutate({ type: editor.type, key: editor.key, value });
          }}
        />
      ) : null}
      {containerMenu ? (
        <Modal transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={() => setContainerMenu(undefined)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end", paddingHorizontal: 12, paddingBottom: 10 }}>
            <Pressable style={{ flex: 1 }} onPress={() => setContainerMenu(undefined)} />
            <View style={{ width: "100%", maxWidth: 720, alignSelf: "center", backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 6 }}>
              <SheetHandle />
              <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>更多操作</Text>
                  <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 3 }}>{containerMenu.name}</Text>
                </View>
                <Pressable accessibilityLabel="关闭" onPress={() => setContainerMenu(undefined)} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}><X color={colors.subtext} size={18} /></Pressable>
              </View>
              {[
                ...(containerMenu.running && !containerMenu.paused ? [{ icon: Pause, label: "暂停容器", color: colors.warning, action: () => mutation.mutate({ type: "container-pause", key: containerMenu.key }) }] : []),
                { icon: Search, label: "容器详情", color: colors.text, action: () => inspect("container", containerMenu.key) },
                { icon: FileText, label: "查看日志", color: colors.cyan, action: () => containerLogs(containerMenu.key) },
                { icon: Folder, label: "管理文件", color: colors.warning, action: () => setEditor({ type: "container-files", title: "容器文件操作", key: containerMenu.key, value: { operation: "list", path: "/" } }) },
                { icon: Activity, label: "查看进程", color: colors.cyan, action: () => void openDetail(`容器进程 · ${containerMenu.name}`, () => getDockerContainerProcesses(containerMenu.key)) },
                { icon: Pencil, label: "编辑配置", color: colors.primary, action: () => editContainer(containerMenu.key) },
                { icon: Box, label: "重命名", color: colors.primary, action: () => setEditor({ type: "container-rename", title: "重命名容器", key: containerMenu.key, value: { name: containerMenu.name } }) },
                { icon: Trash2, label: "删除容器", color: colors.danger, action: () => danger("确认删除", `强制删除容器 ${containerMenu.name}？`, () => mutation.mutate({ type: "container-remove", key: containerMenu.key })) },
              ].map(({ icon: Icon, label, color, action }, index) => (
                <Pressable
                  key={label}
                  onPress={() => { setContainerMenu(undefined); action(); }}
                  style={({ pressed }) => ({ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: index ? 1 : 0, borderTopColor: colors.rowBorder, opacity: pressed ? 0.5 : 1 })}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}><Icon color={color} size={17} /></View>
                  <Text style={{ flex: 1, color, fontSize: 15, fontWeight: "600" }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
    </Page>
  );
}
