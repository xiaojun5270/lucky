import { useMutation, useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Box,
  CircleStop,
  Container,
  Database,
  FileText,
  Folder,
  Gauge,
  Image,
  Network,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  UploadCloud,
  Workflow,
  Wrench,
  X,
} from "lucide-react-native";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Alert, AppState, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  FullScreenSafeArea,
  IconTile,
  Page,
  Panel,
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
  readDockerComposeConfig,
  removeDockerContainer,
  removeDockerContainerGroup,
  removeDockerImage,
  removeDockerNetwork,
  removeDockerRegistryMirror,
  removeDockerTask,
  removeDockerVolume,
  renameDockerContainer,
  restoreDockerVolumeBackup,
  runDockerComposeAction,
  runDockerContainerAction,
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
function composePayload(item: LuckyRecord) {
  return {
    project_name: pick(item, ["Name", "name", "ProjectName", "projectName", "project_name"]),
    project_path: pick(item, [
      "Path",
      "path",
      "ProjectPath",
      "projectPath",
      "project_path",
      "WorkingDir",
      "working_dir",
    ]),
  };
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
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: running ? "#7c3aed" : colors.mutedCard, alignItems: "center", justifyContent: "center" }}>
      <Container color={running ? "#ffffff" : colors.disabled} size={Math.round(size * 0.45)} />
    </View>
  );
  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
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
  const rows = [
    [`CPU:${cpu}`, `内存:${memory}`],
    [
      `↓ ${compactDockerBytes(stats?.networkRx ?? 0, stats?.hasNetworkRx === true)}`,
      `↑ ${compactDockerBytes(stats?.networkTx ?? 0, stats?.hasNetworkTx === true)}`,
    ],
    [
      `R ${compactDockerBytes(stats?.blockRead ?? 0, stats?.hasBlockRead === true)}`,
      `W ${compactDockerBytes(stats?.blockWrite ?? 0, stats?.hasBlockWrite === true)}`,
    ],
  ];
  return <View style={{ flexShrink: 1, flexBasis: 162, minWidth: 160, maxWidth: 164, marginLeft: "auto", gap: 3 }}>
    {rows.map((row, rowIndex) => <View key={rowIndex} style={{ height: 22, borderRadius: 5, backgroundColor: colors.mutedCard, overflow: "hidden", flexDirection: "row", alignItems: "center" }}>
      {row.map((value, index) => <View key={index} style={{ flex: 1, minWidth: 0, height: 22, paddingHorizontal: 4, borderLeftWidth: index ? 1 : 0, borderLeftColor: colors.rowBorder, alignItems: "center", justifyContent: "center" }}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          numberOfLines={1}
          style={{ width: "100%", color: colors.subtext, fontSize: 9, lineHeight: 12, fontWeight: "600", fontVariant: ["tabular-nums"], textAlign: "center" }}
        >
          {value}
        </Text>
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
  onPress,
}: {
  icon: typeof Pencil;
  label: string;
  color: string;
  disabled?: boolean;
  fluid?: boolean;
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
        flexBasis: fluid ? 88 : "auto",
        minWidth: 64,
        minHeight: 36,
        paddingHorizontal: 8,
        borderRadius: 8,
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
      height: 36,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      opacity: pressed ? 0.55 : 1,
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
  const [containerMenu, setContainerMenu] = useState<{ key: string; name: string; running: boolean; paused: boolean }>();
  const [output, setOutput] = useState<unknown>("");
  const [localError, setLocalError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
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
        return updateDockerComposeConfig(
          projectPath,
          content,
        );
      }
      if (type === "compose-backup") {
        const projectPath = String(value?.project_path ?? "").trim();
        const projectName = String(value?.project_name ?? "").trim();
        if (!projectPath || !projectName) throw new Error("Compose 项目名称或路径缺失");
        return backupDockerCompose(
          projectPath,
          projectName,
        );
      }
      if (type.startsWith("compose-")) {
        const projectPath = String(value?.project_path ?? "").trim();
        const projectName = String(value?.project_name ?? "").trim();
        if (!projectPath || !projectName) throw new Error("Compose 项目名称或路径缺失");
        return runDockerComposeAction(
          type.replace("compose-", "") as "up" | "down" | "start" | "stop" | "restart",
          { ...value, project_path: projectPath, project_name: projectName },
        );
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
    onMutate: () => {
      setLocalError("");
      setLocalNotice("");
    },
    onSuccess: async () => {
      setEditor(undefined);
      setLocalError("");
      await queryClient.invalidateQueries({ queryKey: ["docker"] });
      setLocalNotice("操作已完成，数据已刷新");
    },
    onError: (error) => {
      setLocalNotice("");
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
  const containerStatRows = useMemo(
    () => dockerStatRows(containerStats.data, containers.data?.items ?? emptyDockerContainers),
    [containerStats.data, containers.data?.items],
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
  async function inspect(kind: "container" | "image" | "task", key: string) {
    try {
      const result =
        kind === "container"
          ? await getDockerContainer(key)
          : kind === "image"
            ? await getDockerImage(key)
            : await getDockerTask(key);
      setOutput(result);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取失败");
    }
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
      setLocalError(error instanceof Error ? error.message : "读取 Compose 配置失败");
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
        if (view === "overview" || view === "containers") containerStats.refetch();
        if (view === "settings") {
          mirrors.refetch();
          maintenance.refetch();
        }
      }}
    >
      <View style={{ width: "100%", maxWidth: 820, alignSelf: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {tabs.map(([key, label, Icon]) => (
          <Pressable
            key={key}
            onPress={() => {
              setView(key);
              setSearch("");
              setOutput("");
            }}
            style={{
              width: "31%",
              minWidth: 92,
              height: 42,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: view === key ? colors.primary : colors.border,
              backgroundColor: view === key ? colors.primary : colors.card,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
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
      {localNotice ? <View style={{ minHeight: 40, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.successBg, justifyContent: "center" }}><Text style={{ color: colors.success, fontSize: 12, fontWeight: "700" }}>{localNotice}</Text></View> : null}
      {active.error ? (
        <ErrorState
          message={active.error.message}
          retry={() => active.refetch()}
        />
      ) : null}
      {containerStats.error && (view === "overview" || view === "containers") ? (
        <ErrorState
          message={`容器实时统计：${containerStats.error.message}`}
          retry={() => containerStats.refetch()}
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
              height: 44,
              borderRadius: 8,
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
                <View key={key} style={{ borderRadius: 8, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card, padding: 14, gap: 12, shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}>
                  <Pressable onPress={() => setContainerMenu({ key, name, running, paused })} style={({ pressed }) => ({ minHeight: 86, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 10, opacity: pressed ? 0.62 : 1 })}>
                    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 132, minWidth: 132, alignItems: "flex-start", gap: 5 }}>
                      <Text numberOfLines={1} style={{ width: "100%", color: colors.primary, fontSize: 14, lineHeight: 18, fontWeight: "800" }}>{displayName}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <ContainerArtwork item={item} icons={iconLibrary.data ?? []} running={running} size={42} />
                        <View style={{ width: 3, height: 32, borderRadius: 2, backgroundColor: running ? colors.success : colors.disabled }} />
                      </View>
                      <Text numberOfLines={1} style={{ width: "100%", color: colors.subtext, fontSize: 10, lineHeight: 13 }}>{containerStatus(item, running, paused)}</Text>
                    </View>
                    <ContainerStatsGrid stats={stats} />
                  </Pressable>
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
                      color="#7c3aed"
                      onPress={() => updateContainer(key, displayName)}
                    />
                  </View>
                </View>
              );
            })
          ) : !containers.isLoading ? (
            <EmptyState message="暂无容器" icon={Container} />
          ) : null}
          {output ? <Panel><StructuredDataView value={output} /></Panel> : null}
        </>
      ) : null}

      {view === "images" ? (
        <>
          <SectionHeader
            icon={Image}
            title="镜像列表"
            meta={`${filtered.length} 项`}
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
                height: 42,
                borderRadius: 8,
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
                height: 42,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: "800" }}>
                构建
              </Text>
            </Pressable>
          </View>
          {filtered.length ? (
            filtered.map((item, index) => {
              const key = keyOf(item, index);
              const name = pick(item, ["RepoTags", "Tags", "Name"], "<none>");
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
                    <Image color={colors.warning} size={19} />
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={2}
                        style={{ color: colors.text, fontWeight: "800" }}
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
                    <IconButton
                      icon={Search}
                      label="详情"
                      color={colors.text}
                      onPress={() => inspect("image", key)}
                    />
                    <IconButton
                      icon={Pencil}
                      label="标记"
                      color={colors.primary}
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
              height: 42,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>扫描项目</Text>
          </Pressable>
          {filtered.length ? (
            filtered.map((item, index) => {
              const key = keyOf(item, index);
              const name = pick(item, ["Name", "ProjectName", "name"], key);
              const payload = composePayload(item);
              return (
                <Panel key={key}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 9,
                    }}
                  >
                    <Workflow color={colors.primary} size={19} />
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
              height: 42,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
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
                  <Network color={colors.cyan} size={19} />
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
              height: 42,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>创建数据卷</Text>
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
                  <Database color={colors.warning} size={19} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800" }}>
                      {name}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 11 }}>
                      {pick(item, ["Driver"], "local")} ·{" "}
                      {pick(item, ["Mountpoint"])}
                    </Text>
                  </View>
                  <IconButton
                    icon={Save}
                    label="备份"
                    color={colors.primary}
                    onPress={() =>
                      mutation.mutate({ type: "volume-backup", key: name })
                    }
                  />
                  <IconButton
                    icon={Search}
                    label="备份列表"
                    color={colors.text}
                    onPress={async () =>
                      setOutput(await listDockerVolumeBackups(name))
                    }
                  />
                  <IconButton
                    icon={RotateCw}
                    label="恢复备份"
                    color={colors.warning}
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
          {output ? <Panel><StructuredDataView value={output} /></Panel> : null}
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
              height: 40,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.danger,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
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
                  <Activity color={colors.primary} size={18} />
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
          {output ? <Panel><StructuredDataView value={output} /></Panel> : null}
        </>
      ) : null}

      {view === "overview" ? (
        <DockerOverviewDashboard
          data={overview.data}
          active={overviewActive}
          stats={containerStats.data}
          statsLoading={containerStats.isLoading}
          statsError={containerStats.error?.message}
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
                height: 42,
                borderRadius: 8,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
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
                  style={{ flex: 1, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
                ><Plus color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: "700" }}>添加分组</Text></Pressable>
                <Pressable
                  onPress={() => setEditor({ type: "group-remove", title: "删除容器分组", value: { key: "" } })}
                  style={{ flex: 1, height: 40, borderRadius: 8, borderWidth: 1, borderColor: colors.danger, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
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
                style={{ height: 40, borderRadius: 8, backgroundColor: colors.dangerBg, alignItems: "center", justifyContent: "center" }}
              ><Text style={{ color: colors.danger, fontWeight: "700" }}>清除升级状态</Text></Pressable>
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
                  height: 38,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
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
                  height: 38,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.danger,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
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
              height: 42,
              borderRadius: 8,
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
              setOutput(result);
              setEditor(undefined);
              return;
            }
            if (editor.type === "compose-discover") {
              setOutput(await discoverDockerCompose(String(value.scan_path ?? "")));
              setEditor(undefined);
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
                { icon: Activity, label: "查看进程", color: colors.cyan, action: async () => setOutput(await getDockerContainerProcesses(containerMenu.key)) },
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
