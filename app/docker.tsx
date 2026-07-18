import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import { Directory, File as ExpoFile, Paths } from "expo-file-system";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { useIsFocused, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Archive,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Container,
  Copy,
  Cpu,
  Database,
  Download,
  Ellipsis,
  FileText,
  Folder,
  Gauge,
  GitBranch,
  HardDriveDownload,
  HardDriveUpload,
  Image,
  Layers,
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
  Tags,
  Upload,
  UploadCloud,
  Workflow,
  Wrench,
  X,
} from "lucide-react-native";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
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
import { refreshLuckyToken, withLuckyRequestNonce } from "@/src/lib/lucky-fetch";
import { queryClient } from "@/src/lib/query-client";
import { useAppTheme } from "@/src/lib/theme";
import { getIconLibraryIcons } from "@/src/services/iconlib";
import { luckySessionState } from "@/src/store/lucky-session";
import type { LuckyRecord } from "@/src/types/lucky";
import {
  addDockerRegistryMirror,
  backupDockerCompose,
  backupDockerVolume,
  buildDockerImage,
  buildDockerImageFromGit,
  buildDockerImageFromZip,
  cancelDockerComposeBackup,
  cancelDockerVolumeBackup,
  clearDockerComposeBackups,
  clearDockerTasks,
  clearDockerImageUpgradeStatus,
  checkDockerImagesUpgrade,
  checkDockerContainerUpgrade,
  commitDockerContainer,
  copyDockerContainer,
  createDockerContainerGroup,
  createDockerContainer,
  createDockerNetwork,
  createDockerVolume,
  discoverDockerCompose,
  downloadDockerComposeBackup,
  downloadDockerContainerFile,
  editDockerContainer,
  exportDockerContainer,
  exportDockerVolume,
  getDockerConfig,
  getAllDockerContainerStats,
  getDockerComposeLogs,
  getDockerContainer,
  getDockerContainerComposeConfig,
  getDockerContainerLogs,
  getDockerContainerProcesses,
  getDockerImage,
  getDockerImageFilesystem,
  getDockerImageHistory,
  getDockerImageTags,
  getDockerImageUpgradeStatus,
  getDockerLogs,
  getDockerMaintenanceStatus,
  getDockerOverview,
  getDockerRegistryMirrors,
  getDockerTask,
  importDockerImage,
  importDockerVolume,
  listDockerComposeProjects,
  listDockerComposeBackups,
  listDockerContainers,
  listDockerImages,
  listDockerNetworks,
  listDockerTasks,
  listDockerVolumeBackups,
  listDockerVolumes,
  loadDockerImage,
  pullDockerImage,
  pushDockerImage,
  pruneDocker,
  refreshDockerContainerStats,
  readDockerComposeConfig,
  readDockerComposeFile,
  readDockerComposeDockerfile,
  removeDockerComposeBackup,
  removeDockerContainer,
  removeDockerContainerGroup,
  removeDockerContainerLabel,
  removeDockerImage,
  removeDockerImages,
  removeDockerNetwork,
  removeDockerRegistryMirror,
  removeDockerTask,
  removeDockerVolume,
  removeDockerVolumeBackup,
  renameDockerContainer,
  restoreDockerComposeBackup,
  restoreDockerCompose,
  restoreDockerVolumeBackup,
  runDockerComposeAction,
  runDockerContainerFileOperation,
  runDockerContainerAction,
  scanUnusedDockerImages,
  setDockerContainerGroup,
  setDockerContainerLabel,
  switchDockerContainerVersion,
  tagDockerImage,
  updateDockerComposeConfig,
  updateDockerComposeDockerfile,
  updateDockerConfig,
  updateDockerContainerGroup,
  uploadDockerComposeBackup,
  uploadDockerContainerFile,
  uploadDockerVolumeBackup,
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
type DockerUploadAsset = {
  uri: string;
  name: string;
  mimeType?: string;
  file?: Blob;
};

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

function dockerUploadFormData(asset: DockerUploadAsset, fields: LuckyRecord = {}) {
  const data = new FormData();
  data.append(
    "file",
    (asset.file ?? {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType ?? "application/octet-stream",
    }) as Blob,
  );
  Object.entries(fields).forEach(([key, value]) => {
    if (["file_uri", "file_name"].includes(key) || value === undefined || value === null || value === "") return;
    data.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });
  return data;
}

function safeDownloadName(value: unknown, fallback: string) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Content-Disposition can contain a plain, non-URL-encoded filename.
  }
  return decoded.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || fallback;
}

function availableDockerFile(directory: Directory, filename: string) {
  let file = new ExpoFile(directory, filename);
  if (!file.exists) return file;
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : "";
  for (let index = 1; index <= 999; index += 1) {
    file = new ExpoFile(directory, `${base} (${index})${extension}`);
    if (!file.exists) return file;
  }
  return new ExpoFile(directory, `${base}-${Date.now()}${extension}`);
}

async function saveDockerBinary(payload: unknown, fallbackName: string) {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as LuckyRecord
    : {};
  const blob = record.data;
  if (!(blob instanceof Blob)) return payload;
  const filename = safeDownloadName(record.filename, fallbackName);
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { filename, byteLength: blob.size, saved: true } as LuckyRecord;
  }
  const directory = Platform.OS === "android"
    ? await Directory.pickDirectoryAsync()
    : new Directory(Paths.document);
  const file = availableDockerFile(directory, filename);
  let created = false;
  try {
    file.create({ overwrite: false, intermediates: true });
    created = true;
    if (typeof blob.stream === "function" && typeof file.writableStream === "function") {
      const reader = blob.stream().getReader();
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
    } else {
      file.write(new Uint8Array(await blob.arrayBuffer()));
    }
  } catch (error) {
    if (created) {
      try { if (file.exists) file.delete(); } catch { /* ignore cleanup errors */ }
    }
    throw error;
  }
  return { filename, byteLength: blob.size, saved: true, path: file.uri } as LuckyRecord;
}

async function downloadDockerPathToDevice(
  path: string,
  fallbackName: string,
  method: "GET" | "POST" = "GET",
) {
  const directory = Platform.OS === "android"
    ? await Directory.pickDirectoryAsync()
    : new Directory(Paths.document);
  const filename = safeDownloadName(fallbackName, 'docker-download.bin');
  const destination = availableDockerFile(directory, filename);
  const url = `${luckySessionState.baseUrl.replace(/\/+$/, '')}${withLuckyRequestNonce(path)}`;
  const headersFor = (token: string) => ({
    Accept: 'application/octet-stream, application/json;q=0.7',
    ...(token ? { 'Lucky-Admin-Token': token } : {}),
  });

  if (method === "POST") {
    const run = async (token: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600000);
      try {
        const response = await expoFetch(url, {
          method,
          headers: headersFor(token),
          signal: controller.signal,
        });
        if (response.status === 401) {
          await response.body?.cancel();
          return undefined;
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || contentType.includes("application/json") || contentType.includes("+json")) {
          const raw = await response.text();
          let message = raw.trim();
          try {
            const payload = JSON.parse(raw) as LuckyRecord;
            message = typeof payload.msg === "string" && payload.msg.trim()
              ? payload.msg.trim()
              : message;
          } catch {
            // Preserve a plain-text server error when the response is not JSON.
          }
          throw new Error(message || `下载失败（HTTP ${response.status}）`);
        }
        if (!response.body) throw new Error("服务端未返回下载内容");

        destination.create({ overwrite: false, intermediates: true });
        const reader = response.body.getReader();
        const writer = destination.writableStream().getWriter();
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            await writer.write(chunk.value);
          }
          await writer.close();
        } catch (error) {
          try {
            await writer.abort(error);
          } catch {
            // The writer may already be closed after a native stream failure.
          }
          try {
            if (destination.exists) destination.delete();
          } catch {
            // A failed cleanup should not replace the original download error.
          }
          throw error;
        } finally {
          reader.releaseLock();
          writer.releaseLock();
        }
        return destination;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("下载超时，请检查服务器连接");
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    };

    let file = await run(luckySessionState.token);
    if (!file) file = await run(await refreshLuckyToken());
    if (!file) throw new Error("登录已失效，请重新登录");
    return { filename: file.name, byteLength: file.size, saved: true, path: file.uri } as LuckyRecord;
  }

  const run = (token: string) => ExpoFile.downloadFileAsync(url, destination, {
    idempotent: false,
    headers: headersFor(token),
  });
  let file: ExpoFile;
  try {
    file = await run(luckySessionState.token);
  } catch (error) {
    try { if (destination.exists) destination.delete(); } catch { /* preserve the request error */ }
    if (!(error instanceof Error) || !/\b401\b/.test(error.message)) throw error;
    try {
      file = await run(await refreshLuckyToken());
    } catch (retryError) {
      try { if (destination.exists) destination.delete(); } catch { /* preserve the retry error */ }
      throw retryError;
    }
  }
  return { filename: file.name, byteLength: file.size, saved: true, path: file.uri } as LuckyRecord;
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
function searchText(item: LuckyRecord) {
  try {
    return JSON.stringify(item).toLowerCase();
  } catch {
    return "";
  }
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

function imagePushValue(name: string) {
  const reference = name.split(",")[0]?.trim() ?? "";
  const lastSlash = reference.lastIndexOf("/");
  const lastColon = reference.lastIndexOf(":");
  if (lastColon > lastSlash) {
    return { image: reference.slice(0, lastColon), tag: reference.slice(lastColon + 1) || "latest" };
  }
  return { image: reference === "<none>" ? "" : reference, tag: "latest" };
}
function nested(payload: LuckyRecord, keys: string[]) {
  for (const key of keys) {
    const queue: LuckyRecord[] = [payload];
    const visited = new Set<object>();
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const matchedKey = Object.keys(current).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
      const value = matchedKey ? current[matchedKey] : undefined;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as LuckyRecord;
      }
      for (const child of Object.values(current)) {
        if (child && typeof child === "object" && !Array.isArray(child)) {
          queue.push(child as LuckyRecord);
        }
      }
    }
  }
  return payload;
}
function composeConfigText(payload: LuckyRecord) {
  const queue: LuckyRecord[] = [payload];
  const visited = new Set<object>();
  while (queue.length) {
    const source = queue.shift()!;
    if (visited.has(source)) continue;
    visited.add(source);
    const record = source;
    for (const key of ["content", "Content", "config", "Config", "yaml", "YAML", "dockerfile", "Dockerfile"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
    for (const key of ["data", "result"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
    for (const child of Object.values(record)) {
      if (child && typeof child === "object" && !Array.isArray(child)) {
        queue.push(child as LuckyRecord);
      }
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
  const result: string[] = [];
  const visited = new Set<object>();
  const textKeys = ["LogContent", "logContent", "message", "Message", "content", "Content", "text", "Text", "log", "Log"];
  const timeKeys = ["LogTime", "logTime", "timestamp", "Timestamp", "time", "Time"];
  const levelKeys = ["level", "Level", "logLevel", "LogLevel"];
  const wrapperKeys = ["logs", "Logs", "list", "List", "rows", "Rows", "items", "Items", "data", "Data", "result", "Result"];

  const append = (value: unknown) => {
    if (typeof value === "string") {
      result.push(...value.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim()));
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      result.push(String(value));
      return;
    }
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    const entry = value as LuckyRecord;
    const content = textKeys.map((key) => entry[key]).find((item) => item !== undefined && item !== null);
    if (content !== undefined) {
      const time = timeKeys.map((key) => entry[key]).find((item) => typeof item === "string" || typeof item === "number");
      const level = levelKeys.map((key) => entry[key]).find((item) => typeof item === "string" || typeof item === "number");
      const prefix = [time, level].filter((item) => item !== undefined && item !== "").map(String).join(" ");
      const before = result.length;
      append(content);
      if (prefix) {
        for (let index = before; index < result.length; index += 1) result[index] = `[${prefix}] ${result[index]}`;
      }
      return;
    }
    const wrapper = wrapperKeys.map((key) => entry[key]).find((item) => item !== undefined && item !== null);
    if (wrapper !== undefined) {
      append(wrapper);
      return;
    }
    const fields = Object.entries(entry)
      .filter(([key, item]) => !["ret", "msg", "total", "page", "pageSize"].includes(key) && ["string", "number", "boolean"].includes(typeof item))
      .map(([key, item]) => `${key}: ${String(item)}`);
    if (fields.length) result.push(fields.join(" · "));
  };

  append(payload);
  return result;
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
    : `${luckySessionState.baseUrl.replace(/\/+$/, "")}/api/iconlib/icon?path=${encodeURIComponent(icon)}`;
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

type DockerMenuAction = {
  icon: typeof Pencil;
  label: string;
  color: string;
  action: () => void;
};

function DockerActionSheet({
  title,
  subtitle,
  actions,
  close,
}: {
  title: string;
  subtitle?: string;
  actions: DockerMenuAction[];
  close: () => void;
}) {
  const colors = useAppTheme();
  return (
    <Modal transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end", paddingHorizontal: 12, paddingBottom: 10 }}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View style={{ width: "100%", maxWidth: 720, maxHeight: "84%", alignSelf: "center", backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10 }}>
          <SheetHandle />
          <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{title}</Text>
              {subtitle ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, marginTop: 3 }}>{subtitle}</Text> : null}
            </View>
            <Pressable accessibilityLabel="关闭" onPress={close} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.mutedCard, alignItems: "center", justifyContent: "center" }}>
              <X color={colors.subtext} size={18} />
            </Pressable>
          </View>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", gap: 7, paddingBottom: 2 }}
          >
            {actions.map(({ icon: Icon, label, color, action }) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => { close(); action(); }}
                style={({ pressed }) => ({
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 145,
                  minWidth: "46%",
                  minHeight: 48,
                  paddingHorizontal: 11,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.mutedCard,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 9,
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <Icon color={color} size={17} />
                <Text numberOfLines={1} style={{ flex: 1, color, fontSize: 13, fontWeight: "700" }}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
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
        </KeyboardAvoidingView>
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
  const [dockerLogPage, setDockerLogPage] = useState(1);
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
  const [imageMenu, setImageMenu] = useState<{ key: string; name: string }>();
  const [imageToolsOpen, setImageToolsOpen] = useState(false);
  const [dockerUpload, setDockerUpload] = useState<DockerUploadAsset>();
  const [output, setOutput] = useState<unknown>("");
  const [localError, setLocalError] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const [progressiveContainerStats, setProgressiveContainerStats] = useState<LuckyRecord>();
  const overviewActive = view === "overview" && isScreenFocused && appIsActive;
  const containerStatsActive =
    (view === "overview" || view === "containers") && isScreenFocused && appIsActive;
  const dockerLogsActive = view === "logs" && isScreenFocused && appIsActive;
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
    queryFn: ({ signal }) => listDockerContainers(signal),
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
    queryFn: ({ signal }) => listDockerImages(signal),
    enabled: view === "images",
  });
  const compose = useQuery({
    queryKey: ["docker", "compose"],
    queryFn: ({ signal }) => listDockerComposeProjects(signal),
    enabled: view === "compose",
  });
  const networks = useQuery({
    queryKey: ["docker", "networks"],
    queryFn: ({ signal }) => listDockerNetworks(signal),
    enabled: view === "networks",
  });
  const volumes = useQuery({
    queryKey: ["docker", "volumes"],
    queryFn: ({ signal }) => listDockerVolumes(signal),
    enabled: view === "volumes",
  });
  const tasks = useQuery({
    queryKey: ["docker", "tasks"],
    queryFn: ({ signal }) => listDockerTasks(signal),
    enabled: view === "tasks",
  });
  const overview = useQuery({
    queryKey: ["docker", "overview"],
    queryFn: ({ signal }) => getDockerOverview(signal),
    enabled: overviewActive,
    staleTime: 30_000,
    refetchInterval: overviewActive ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
  const containerStats = useQuery({
    queryKey: ["docker", "container-stats"],
    queryFn: ({ signal }) => getAllDockerContainerStats(signal),
    enabled: containerStatsActive,
    staleTime: 3_000,
    refetchOnMount: "always",
    refetchInterval: containerStatsActive ? 5_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const statsContainerItems = view === "containers"
    ? containers.data?.items
    : overview.data?.containers;
  const runningContainerCount = useMemo(
    () => (statsContainerItems ?? emptyDockerContainers).filter((item) => {
      const state = dockerContainerState(item);
      return state === "running" || state === "paused";
    }).length,
    [statsContainerItems],
  );
  const cachedContainerStatRows = useMemo(
    () => dockerStatRows(containerStats.data, statsContainerItems ?? emptyDockerContainers),
    [containerStats.data, statsContainerItems],
  );
  const liveStatsNeeded = containerStatsActive && (
    Boolean(containerStats.error) || (
      containerStats.isSuccess &&
      runningContainerCount > cachedContainerStatRows.length
    )
  );
  const liveContainerStats = useQuery({
    queryKey: ["docker", "container-stats-live"],
    queryFn: ({ signal }) => {
      setProgressiveContainerStats(undefined);
      return refreshDockerContainerStats(
        setProgressiveContainerStats,
        view === "containers" ? containers.data?.items : undefined,
        signal,
      );
    },
    enabled: liveStatsNeeded,
    staleTime: 10_000,
    refetchOnMount: "always",
    refetchInterval: liveStatsNeeded ? 15_000 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const config = useQuery({
    queryKey: ["docker", "config"],
    queryFn: ({ signal }) => getDockerConfig(signal),
    enabled: view === "settings",
  });
  const mirrors = useQuery({
    queryKey: ["docker", "mirrors"],
    queryFn: ({ signal }) => getDockerRegistryMirrors(signal),
    enabled: view === "settings",
  });
  const maintenance = useQuery({
    queryKey: ["docker", "maintenance"],
    queryFn: ({ signal }) => getDockerMaintenanceStatus(signal),
    enabled: view === "settings",
  });
  const logs = useQuery({
    queryKey: ["docker", "logs", dockerLogPage],
    queryFn: ({ signal }) => getDockerLogs(200, dockerLogPage, signal),
    enabled: dockerLogsActive,
    refetchInterval: dockerLogsActive ? 15000 : false,
    refetchIntervalInBackground: false,
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
      if (type === "container-copy") {
        const name = String(value?.name ?? "").trim();
        if (!name) throw new Error("请输入新容器名称");
        return copyDockerContainer(key ?? "", name);
      }
      if (type === "container-commit") {
        if (!String(value?.repository ?? "").trim()) throw new Error("请输入镜像仓库名称");
        return commitDockerContainer(key ?? "", value ?? {});
      }
      if (type === "container-label-set") {
        const label = String(value?.label ?? "").trim();
        if (!label) throw new Error("请输入容器标签");
        return setDockerContainerLabel(key ?? "", label);
      }
      if (type === "container-label-remove")
        return removeDockerContainerLabel(key ?? "");
      if (type === "container-group-set") {
        const containerName = String(value?.container_name ?? "").trim();
        const groupKey = String(value?.group_key ?? "").trim();
        if (!containerName || !groupKey) throw new Error("请输入容器名称和分组标识");
        return setDockerContainerGroup(containerName, groupKey);
      }
      if (type === "container-version-switch") {
        const target = String(value?.target_image_ref ?? "").trim();
        if (!target) throw new Error("请输入目标镜像标签");
        return switchDockerContainerVersion([key ?? ""].filter(Boolean), target);
      }
      if (type === "container-file-upload") {
        if (!dockerUpload) throw new Error("请重新选择要上传的文件");
        return uploadDockerContainerFile(key ?? "", dockerUploadFormData(dockerUpload, value ?? {}));
      }
      if (type === "container-files") {
        const operation = String(value?.operation ?? "list").trim();
        const request = { ...(value ?? {}) };
        delete request.operation;
        return runDockerContainerFileOperation(key ?? "", operation, request);
      }
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
      if (type === "image-build-git") {
        if (!String(value?.git_url ?? "").trim()) throw new Error("请输入 Git 仓库地址");
        return buildDockerImageFromGit(value ?? {});
      }
      if (type === "image-build-zip") {
        if (!dockerUpload) throw new Error("请重新选择 ZIP 构建文件");
        return buildDockerImageFromZip(dockerUploadFormData(dockerUpload, value ?? {}));
      }
      if (type === "image-import") {
        if (!String(value?.source ?? "").trim()) throw new Error("请输入镜像导入来源");
        return importDockerImage(value ?? {});
      }
      if (type === "image-load") {
        if (!dockerUpload) throw new Error("请重新选择镜像归档文件");
        return loadDockerImage(dockerUploadFormData(dockerUpload, value ?? {}));
      }
      if (type === "image-push") {
        const image = String(value?.image ?? "").trim();
        if (!image) throw new Error("请输入要推送的镜像");
        return pushDockerImage(image, String(value?.tag ?? "latest").trim() || "latest");
      }
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
      if (type === "compose-dockerfile-save") {
        const projectPath = String(value?.project_path ?? "").trim();
        const content = String(value?.content ?? "");
        if (!projectPath || !content.trim()) throw new Error("Dockerfile 路径或内容为空");
        return updateDockerComposeDockerfile(projectPath, content);
      }
      if (type === "compose-backup-restore") {
        const projectName = String(value?.project_name ?? "").trim();
        const backup = String(value?.backup ?? "").trim();
        if (!projectName || !backup) throw new Error("请输入项目名称和备份文件");
        return restoreDockerComposeBackup(projectName, backup);
      }
      if (type === "compose-backup-remove") {
        const projectName = String(value?.project_name ?? "").trim();
        const backup = String(value?.backup ?? "").trim();
        if (!projectName || !backup) throw new Error("请输入项目名称和备份文件");
        return removeDockerComposeBackup(projectName, backup);
      }
      if (type === "compose-backup-upload") {
        const projectName = String(value?.project_name ?? "").trim();
        if (!projectName || !dockerUpload) throw new Error("请重新选择 Compose 备份文件");
        const fields = { ...(value ?? {}) };
        delete fields.project_name;
        return uploadDockerComposeBackup(projectName, dockerUploadFormData(dockerUpload, fields));
      }
      if (type === "compose-backup-cancel") {
        const projectName = String(value?.project_name ?? "").trim();
        if (!projectName) throw new Error("Compose 项目名称缺失");
        return cancelDockerComposeBackup(projectName);
      }
      if (type === "compose-backups-clear") {
        const projectName = String(value?.project_name ?? "").trim();
        if (!projectName) throw new Error("Compose 项目名称缺失");
        return clearDockerComposeBackups(projectName);
      }
      if (type === "compose-restore") {
        const targetPath = String(value?.target_path ?? "").trim();
        if (!dockerUpload || !targetPath) throw new Error("请选择备份文件并填写目标路径");
        return restoreDockerCompose(dockerUploadFormData(dockerUpload, {
          target_path: targetPath,
          project_name: String(value?.project_name ?? "").trim(),
          auto_start: Boolean(value?.auto_start),
          config_file_name: String(value?.config_file_name ?? "").trim(),
        }));
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
      if (type === "volume-restore") {
        const backup = String(value?.backup ?? "").trim();
        if (!backup) throw new Error("请输入备份文件");
        return restoreDockerVolumeBackup(
          key ?? "",
          backup,
        );
      }
      if (type === "volume-backup-remove") {
        const backup = String(value?.backup ?? "").trim();
        if (!backup) throw new Error("请输入备份文件");
        return removeDockerVolumeBackup(key ?? "", backup);
      }
      if (type === "volume-backup-upload") {
        if (!dockerUpload) throw new Error("请重新选择数据卷备份文件");
        return uploadDockerVolumeBackup(key ?? "", dockerUploadFormData(dockerUpload, value ?? {}));
      }
      if (type === "volume-backup-cancel")
        return cancelDockerVolumeBackup(key ?? "");
      if (type === "volume-import") {
        const name = String(value?.volume_name ?? "").trim();
        if (!dockerUpload) throw new Error("请重新选择数据卷归档文件");
        if (name && (name.startsWith(".") || name.length > 255 || !/^[a-zA-Z0-9_.-]+$/.test(name))) {
          throw new Error("数据卷名称只能包含字母、数字、点、下划线和连字符，且不能以点开头");
        }
        return importDockerVolume(dockerUploadFormData(dockerUpload, {
          volume_name: name,
          driver: String(value?.driver ?? "local").trim() || "local",
        }));
      }
      if (type === "task-remove") return removeDockerTask(key ?? "");
      if (type === "tasks-clear") return clearDockerTasks();
      if (type === "group-create") return createDockerContainerGroup(value ?? {});
      if (type === "group-update") {
        if (!String(value?.Key ?? value?.key ?? "").trim()) throw new Error("请输入分组标识");
        return updateDockerContainerGroup(value ?? {});
      }
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
    onSuccess: (result, variables) => {
      setEditor(undefined);
      if (["image-build-zip", "image-load", "container-file-upload", "compose-backup-upload", "compose-restore", "volume-backup-upload", "volume-import"].includes(variables.type)) {
        setDockerUpload(undefined);
      }
      setLocalError("");
      setImageDeleteProgress(undefined);
      const invalidations: unknown[][] = [];
      const invalidate = (...key: string[]) => invalidations.push(key);
      if (variables.type === "container-files") {
        // File contents do not change container list metadata.
      } else if (variables.type.startsWith("container-")) {
        invalidate("docker", "containers");
        invalidate("docker", "container-stats");
        invalidate("docker", "overview");
        if (["container-commit", "container-version-switch"].includes(variables.type)) {
          invalidate("docker", "images");
        }
        if (["container-label-set", "container-label-remove", "container-group-set"].includes(variables.type)) {
          invalidate("docker", "maintenance");
        }
      } else if (variables.type.startsWith("image-") || variables.type === "images-remove-batch") {
        invalidate("docker", "images");
        invalidate("docker", "overview");
      } else if (variables.type.startsWith("compose-")) {
        invalidate("docker", "compose");
        invalidate("docker", "overview");
        if (variables.type.includes("backup")) invalidate("docker", "maintenance");
      } else if (variables.type.startsWith("network-")) {
        invalidate("docker", "networks");
        invalidate("docker", "overview");
      } else if (variables.type.startsWith("volume-")) {
        invalidate("docker", "volumes");
        invalidate("docker", "overview");
        if (variables.type.includes("backup") || variables.type === "volume-restore") {
          invalidate("docker", "maintenance");
        }
      } else if (variables.type.startsWith("task-") || variables.type === "tasks-clear") {
        invalidate("docker", "tasks");
      } else if (variables.type.startsWith("group-")) {
        invalidate("docker", "containers");
        invalidate("docker", "overview");
        invalidate("docker", "maintenance");
      } else if (variables.type === "config-save") {
        invalidate("docker", "config");
      } else if (variables.type.startsWith("mirror-")) {
        invalidate("docker", "mirrors");
      } else if (variables.type === "upgrade-status-clear") {
        invalidate("docker", "maintenance");
      } else {
        invalidate("docker", "overview");
      }
      invalidations.forEach((queryKey) => {
        void queryClient.invalidateQueries({ queryKey });
      });
      if (variables.type === "container-files") {
        setDetail({ title: "文件操作结果", value: result });
        setLocalNotice("文件操作已完成");
      } else if (variables.type === "images-remove-batch") {
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
  const searchableSource = useMemo(
    () => (source ?? []).map((item) => ({ item, text: searchText(item) })),
    [source],
  );
  const filtered = useMemo(() => {
    const word = deferredSearch.trim().toLowerCase();
    return searchableSource.filter(({ text }) => !word || text.includes(word)).map(({ item }) => item);
  }, [deferredSearch, searchableSource]);
  const dockerLogLines = useMemo(() => lines(logs.data), [logs.data]);
  const imageEntries = useMemo(
    () => (images.data?.items ?? []).map((item, index) => ({
      item,
      id: keyOf(item, index),
      references: imageReferences(item),
      searchText: searchText(item),
    })),
    [images.data?.items],
  );
  const visibleImageEntries = useMemo(() => {
    const word = deferredSearch.trim().toLowerCase();
    return imageEntries.filter(({ searchText: value }) => !word || value.includes(word));
  }, [deferredSearch, imageEntries]);
  const imageIdSet = useMemo(() => new Set(imageEntries.map(({ id }) => id)), [imageEntries]);
  const validSelectedImageIds = useMemo(
    () => selectedImageIds.filter((id) => imageIdSet.has(id)),
    [imageIdSet, selectedImageIds],
  );
  const selectedImageSet = useMemo(() => new Set(validSelectedImageIds), [validSelectedImageIds]);
  const visibleImageIds = useMemo(() => visibleImageEntries.map(({ id }) => id), [visibleImageEntries]);
  const allVisibleImagesSelected = visibleImageIds.length > 0 && visibleImageIds.every((id) => selectedImageSet.has(id));
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
    () => liveStatsNeeded
      ? [containerStats.data, liveContainerStats.data, progressiveContainerStats]
      : [containerStats.data],
    [containerStats.data, liveContainerStats.data, liveStatsNeeded, progressiveContainerStats],
  );
  const containerStatRows = useMemo(
    () => liveStatsNeeded
      ? dockerStatRows(containerStatsSource, statsContainerItems ?? emptyDockerContainers)
      : cachedContainerStatRows,
    [cachedContainerStatRows, containerStatsSource, liveStatsNeeded, statsContainerItems],
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
  async function downloadDockerResource(
    title: string,
    fallbackName: string,
    request: () => Promise<unknown>,
    nativePath?: string,
    nativeMethod: "GET" | "POST" = "GET",
  ) {
    const requestId = ++detailRequestRef.current;
    setDetail({ title, loading: true, status: "正在下载" });
    try {
      const value = Platform.OS !== "web" && nativePath
        ? await downloadDockerPathToDevice(nativePath, fallbackName, nativeMethod)
        : await saveDockerBinary(await request(), fallbackName);
      if (detailRequestRef.current === requestId) setDetail({ title, value });
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setDetail({ title, error: error instanceof Error ? error.message : "下载失败" });
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
    const targets = imageEntries.filter((item) => selectedImageSet.has(item.id));
    const references = [...new Set(targets.map((item) => item.references[0]).filter(Boolean))];
    if (!references.length) {
      setLocalError(validSelectedImageIds.length ? "所选镜像没有可检测的标签" : "请先选择需要检测的镜像");
      return;
    }
    const title = `检测镜像升级 · ${references.length} 个主标签`;
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
  async function showImageUpgradeStatus() {
    if (imageActionBusy || imageUpgradeRunningRef.current) return;
    const title = "镜像升级状态";
    const requestId = ++detailRequestRef.current;
    const controller = new AbortController();
    imageUpgradeAbortRef.current = controller;
    imageUpgradeRunningRef.current = true;
    setImageUpgradeChecking(true);
    setDetail({ title, loading: true, status: "正在读取升级状态" });
    try {
      const imageUpgrades = await getDockerImageUpgradeStatus("", controller.signal);
      if (detailRequestRef.current === requestId) setDetail({ title, value: { imageUpgrades } });
    } catch (error) {
      if (detailRequestRef.current === requestId) {
        setDetail({ title, error: error instanceof Error ? error.message : "读取升级状态失败" });
      }
    } finally {
      imageUpgradeRunningRef.current = false;
      if (imageUpgradeAbortRef.current === controller) imageUpgradeAbortRef.current = undefined;
      setImageUpgradeChecking(false);
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
  async function chooseDockerArchive(type: "image-build-zip" | "image-load") {
    setLocalError("");
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: type === "image-build-zip"
          ? ["application/zip", "application/x-zip-compressed"]
          : ["application/x-tar", "application/gzip", "application/x-gzip", "application/octet-stream"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      setDockerUpload({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? undefined,
        file: asset.file,
      });
      setEditor(type === "image-build-zip" ? {
        type,
        title: "从 ZIP 构建镜像",
        value: {
          file_name: asset.name,
          file_uri: asset.uri,
          tag: "",
          dockerfile: "Dockerfile",
          build_args: {},
          no_cache: false,
        },
      } : {
        type,
        title: "加载镜像归档",
        value: { file_name: asset.name, file_uri: asset.uri },
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "选择文件失败");
    }
  }
  async function chooseDockerUpload(
    type: "container-file-upload" | "compose-backup-upload" | "compose-restore" | "volume-backup-upload" | "volume-import",
    key: string,
    title: string,
    fields: LuckyRecord,
  ) {
    setLocalError("");
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: type === "container-file-upload"
          ? "*/*"
          : ["application/gzip", "application/x-gzip", "application/x-tar", "application/octet-stream"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (selection.canceled) return;
      const asset = selection.assets[0];
      setDockerUpload({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? undefined,
        file: asset.file,
      });
      const nextFields = type === "volume-import" && !String(fields.volume_name ?? "").trim()
        ? { ...fields, volume_name: asset.name.replace(/(?:\.tar\.gz|\.tgz)$/i, "").replace(/-backup-\d{8}-\d{6}$/i, "") }
        : fields;
      setEditor({
        type,
        title,
        key,
        value: { ...nextFields, file_name: asset.name, file_uri: asset.uri },
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "选择上传文件失败");
    }
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
      setDockerLogPage(1);
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
      setDockerLogPage(1);
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
  async function editComposeDockerfile(projectPath: string) {
    try {
      setLocalError("");
      setLocalNotice("");
      const result = await readDockerComposeDockerfile(projectPath);
      const content = composeConfigText(result);
      if (!content) throw new Error("接口未返回 Dockerfile 内容");
      setEditor({
        type: "compose-dockerfile",
        title: "编辑 Dockerfile",
        key: projectPath,
        value: { project_path: projectPath, content },
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "读取 Dockerfile 失败");
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
      const value = { ...nested(result, ["config", "upgrade", "result", "data"]) };
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
      scrollable={!(["containers", "images", "compose", "networks", "volumes", "tasks", "logs"] as DockerView[]).includes(view)}
      refreshing={active.isFetching || (view === "settings" && maintenance.isFetching)}
      onRefresh={() => {
        active.refetch();
        if (view === "overview" || view === "containers") {
          containerStats.refetch();
          if (liveStatsNeeded) liveContainerStats.refetch();
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
          if (key === "logs") setDockerLogPage(1);
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
      {!containerStatRows.length && liveStatsNeeded && liveContainerStats.error && (view === "overview" || view === "containers") ? (
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
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => keyOf(item, index)}
            extraData={containerStatRows}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: filtered.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={!containers.isLoading ? <EmptyState message="暂无容器" icon={Container} /> : null}
            renderItem={({ item, index }) => {
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
                <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, gap: 12, shadowColor: colors.shadow, shadowOpacity: Platform.OS === "ios" || Platform.OS === "web" ? 0.055 : 0, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: Platform.OS === "android" ? 2 : 0 }}>
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
            }}
          />
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="打开镜像高级工具"
            onPress={() => setImageToolsOpen(true)}
            style={({ pressed }) => ({
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Wrench color={colors.text} size={16} />
            <Text style={{ color: colors.text, fontWeight: "800" }}>镜像高级工具</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={validSelectedImageIds.length ? `检测已选择的 ${validSelectedImageIds.length} 个镜像升级` : "查看镜像升级状态"}
              accessibilityState={{ disabled: imageActionBusy }}
              disabled={imageActionBusy}
              onPress={() => void (validSelectedImageIds.length ? detectImageUpgrades() : showImageUpgradeStatus())}
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
                opacity: imageActionBusy ? 0.45 : pressed ? 0.62 : 1,
              })}
            >
              {imageUpgradeChecking ? <ActivityIndicator color={colors.primary} size="small" /> : <RefreshCw color={colors.primary} size={16} />}
              <Text style={{ color: colors.primary, fontWeight: "800" }}>{imageUpgradeChecking ? "处理中" : validSelectedImageIds.length ? "检测所选" : "升级状态"}</Text>
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
                borderColor: imageSelectionMode ? colors.primary : colors.border,
                backgroundColor: imageSelectionMode ? colors.primarySoft : colors.card,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: mutation.isPending || imageUpgradeChecking ? 0.45 : pressed ? 0.62 : 1,
              })}
            >
              <ListChecks color={imageSelectionMode ? colors.primary : colors.text} size={16} />
              <Text style={{ color: imageSelectionMode ? colors.primary : colors.text, fontWeight: "800" }}>{imageSelectionMode ? "退出批量" : "批量操作"}</Text>
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
          <FlatList
            data={visibleImageEntries}
            keyExtractor={({ id }) => id}
            extraData={`${imageSelectionMode}:${validSelectedImageIds.join(",")}:${imageActionBusy}`}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: visibleImageEntries.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={!images.isLoading ? <EmptyState message="暂无镜像" icon={Image} /> : null}
            renderItem={({ item: entry }) => {
              const { item, id: key } = entry;
              const name = pick(item, ["RepoTags", "Tags", "Name"], "<none>");
              const selected = selectedImageSet.has(key);
              return (
                <Panel>
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
                      icon={Ellipsis}
                      label="更多"
                      color={colors.cyan}
                      fluid
                      onPress={() => setImageMenu({ key, name })}
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
            }}
          />
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
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => {
              const payload = composePayload(item);
              return [payload.project_name, payload.project_path]
                .filter(Boolean)
                .join(":") || keyOf(item, index);
            }}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: filtered.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={!compose.isLoading ? <EmptyState message="暂无 Compose 项目" icon={Workflow} /> : null}
            renderItem={({ item, index }) => {
              const payload = composePayload(item);
              const key = [payload.project_name, payload.project_path]
                .filter(Boolean)
                .join(":") || keyOf(item, index);
              const name = payload.project_name || key;
              return (
                <Panel>
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
                      icon={Archive}
                      label="备份列表"
                      color={colors.text}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => void openDetail(`Compose 备份 · ${name}`, () => listDockerComposeBackups(name))}
                    />
                    <IconButton
                      icon={Download}
                      label="下载备份"
                      color={colors.cyan}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => setEditor({
                        type: "compose-backup-download",
                        title: `下载 Compose 备份 · ${name}`,
                        value: { project_name: name, backup: "" },
                      })}
                    />
                    <IconButton
                      icon={Trash2}
                      label="清空备份"
                      color={colors.danger}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => danger(
                        "清空 Compose 备份",
                        `确定删除项目 ${name} 的全部备份吗？`,
                        () => mutation.mutate({ type: "compose-backups-clear", value: { project_name: name } }),
                      )}
                    />
                    <IconButton
                      icon={Upload}
                      label="上传备份"
                      color={colors.cyan}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => void chooseDockerUpload(
                        "compose-backup-upload",
                        name,
                        `上传 Compose 备份 · ${name}`,
                        { project_name: name },
                      )}
                    />
                    <IconButton
                      icon={RotateCw}
                      label="恢复备份"
                      color={colors.warning}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => setEditor({
                        type: "compose-backup-restore",
                        title: `恢复 Compose 备份 · ${name}`,
                        value: { project_name: name, backup: "" },
                      })}
                    />
                    <IconButton
                      icon={Trash2}
                      label="删除备份"
                      color={colors.danger}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => setEditor({
                        type: "compose-backup-remove",
                        title: `删除 Compose 备份 · ${name}`,
                        value: { project_name: name, backup: "" },
                      })}
                    />
                    <IconButton
                      icon={CircleStop}
                      label="取消备份"
                      color={colors.danger}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => danger("取消备份", `取消 Compose 项目 ${name} 的备份任务？`, () =>
                        mutation.mutate({ type: "compose-backup-cancel", value: { project_name: name } }))}
                    />
                    <IconButton
                      icon={Pencil}
                      label="编辑配置"
                      color={colors.primary}
                      disabled={mutation.isPending}
                      fluid
                        onPress={() => void editComposeConfig(payload.project_path)}
                    />
                    <IconButton
                      icon={FileText}
                      label="读取文件"
                      color={colors.text}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => setEditor({
                        type: "compose-read-file",
                        title: `读取 Compose 文件 · ${name}`,
                        value: { project_path: payload.project_path, file_path: "docker-compose.yml" },
                      })}
                    />
                    <IconButton
                      icon={RotateCw}
                      label="恢复配置"
                      color={colors.warning}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => void chooseDockerUpload(
                        "compose-restore",
                        name,
                        `恢复 Compose 配置 · ${name}`,
                        {
                          target_path: payload.project_path,
                          project_name: name,
                          auto_start: true,
                          config_file_name: "",
                        },
                      )}
                    />
                    <IconButton
                      icon={FileText}
                      label="Dockerfile"
                      color={colors.primary}
                      disabled={mutation.isPending}
                      fluid
                      onPress={() => void editComposeDockerfile(payload.project_path)}
                    />
                  </View>
                </Panel>
              );
            }}
          />
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
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => keyOf(item, index)}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: filtered.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={!networks.isLoading ? <EmptyState message="暂无 Docker 网络" icon={Network} /> : null}
            renderItem={({ item, index }) => {
              const key = keyOf(item, index);
              const name = pick(item, ["Name", "name"], key);
              return (
              <Panel>
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
            }}
          />
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
          <Pressable
            onPress={() => void chooseDockerUpload(
              "volume-import",
              "",
              "导入数据卷",
              { volume_name: "", driver: "local" },
            )}
            style={{
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.primary,
              backgroundColor: colors.primarySoft,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Upload color={colors.primary} size={17} />
            <Text style={{ color: colors.primary, fontWeight: "800" }}>导入数据卷</Text>
          </Pressable>
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => keyOf(item, index)}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: filtered.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={!volumes.isLoading ? <EmptyState message="暂无数据卷" icon={Database} /> : null}
            renderItem={({ item, index }) => {
              const key = keyOf(item, index);
              const name = pick(item, ["Name", "name"], key);
              return (
              <Panel>
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
                    icon={Download}
                    label="导出"
                    color={colors.cyan}
                    fluid
                    basis={120}
                    onPress={() => void downloadDockerResource(
                      `导出数据卷 · ${name}`,
                      `${name}.tar.gz`,
                      () => exportDockerVolume(name),
                      `/api/docker/volumes/export?name=${encodeURIComponent(name)}`,
                    )}
                  />
                  <IconButton
                    icon={Upload}
                    label="上传备份"
                    color={colors.cyan}
                    fluid
                    basis={120}
                    onPress={() => void chooseDockerUpload(
                      "volume-backup-upload",
                      name,
                      `上传数据卷备份 · ${name}`,
                      {},
                    )}
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
                    label="删除备份"
                    color={colors.danger}
                    fluid
                    basis={120}
                    onPress={() => setEditor({
                      type: "volume-backup-remove",
                      title: `删除数据卷备份 · ${name}`,
                      key: name,
                      value: { backup: "" },
                    })}
                  />
                  <IconButton
                    icon={CircleStop}
                    label="取消备份"
                    color={colors.danger}
                    fluid
                    basis={120}
                    onPress={() => danger("取消备份", `取消数据卷 ${name} 的备份任务？`, () =>
                      mutation.mutate({ type: "volume-backup-cancel", key: name }))}
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
            }}
          />
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
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => keyOf(item, index)}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={Platform.OS === "android"}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
            style={{ flex: 1, width: "100%" }}
            contentContainerStyle={{ paddingBottom: 98, flexGrow: filtered.length ? 0 : 1 }}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            ListEmptyComponent={!tasks.isLoading ? <EmptyState message="暂无后台任务" icon={Activity} /> : null}
            renderItem={({ item, index }) => {
              const key = keyOf(item, index);
              return (
              <Panel>
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
            }}
          />
        </>
      ) : null}

      {view === "overview" ? (
        <DockerOverviewDashboard
          data={overview.data}
          active={overviewActive}
          stats={containerStatsSource}
          statsLoading={!containerStatRows.length && (containerStats.isLoading || (liveStatsNeeded && liveContainerStats.isLoading))}
          statsError={!containerStatRows.length && liveStatsNeeded && liveContainerStats.error ? "容器统计暂时不可用" : undefined}
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
                  onPress={() => setEditor({ type: "group-update", title: "编辑容器分组", value: { Name: "", Key: "" } })}
                  style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
                ><Pencil color={colors.primary} size={15} /><Text style={{ color: colors.primary, fontWeight: "700" }}>编辑分组</Text></Pressable>
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
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 98 }}>
              <Panel><StructuredDataView value={output} /></Panel>
            </ScrollView>
          ) : (
            <>
              <FlatList
                data={dockerLogLines}
                keyExtractor={(line, index) => `${index}-${line.slice(0, 24)}`}
                removeClippedSubviews={Platform.OS === "android"}
                initialNumToRender={30}
                maxToRenderPerBatch={30}
                windowSize={9}
                style={{ flex: 1, width: "100%" }}
                contentContainerStyle={{ paddingBottom: 98, flexGrow: dockerLogLines.length ? 0 : 1 }}
                ListEmptyComponent={!logs.isLoading ? <EmptyState message="暂无 Docker 日志" icon={FileText} /> : null}
                renderItem={({ item: line, index }) => (
                  <Text
                    selectable
                    style={{
                      color: colors.text,
                      fontFamily: "monospace",
                      fontSize: 10,
                      lineHeight: 17,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderTopWidth: index ? 1 : 0,
                      borderTopColor: colors.rowBorder,
                      backgroundColor: colors.card,
                    }}
                  >
                    {line}
                  </Text>
                )}
              />
              <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <Pressable
                  accessibilityLabel="上一页 Docker 日志"
                  disabled={dockerLogPage <= 1 || logs.isFetching}
                  onPress={() => setDockerLogPage((page) => Math.max(1, page - 1))}
                  style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: dockerLogPage <= 1 ? colors.muted : colors.primarySoft, alignItems: "center", justifyContent: "center" }}
                >
                  <ChevronLeft color={dockerLogPage <= 1 ? colors.disabled : colors.primary} size={18} />
                </Pressable>
                <Text style={{ color: colors.subtext, fontSize: 12 }}>第 {dockerLogPage} 页</Text>
                <Pressable
                  accessibilityLabel="下一页 Docker 日志"
                  disabled={logs.isFetching || dockerLogLines.length < 200}
                  onPress={() => setDockerLogPage((page) => page + 1)}
                  style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: dockerLogLines.length < 200 ? colors.muted : colors.primarySoft, alignItems: "center", justifyContent: "center" }}
                >
                  <ChevronRight color={dockerLogLines.length < 200 ? colors.disabled : colors.primary} size={18} />
                </Pressable>
              </View>
            </>
          )}
        </>
      ) : null}

      {detail ? <DockerDetailViewer detail={detail} close={closeDetail} /> : null}
      {editor ? (
        <DockerFormEditor
          key={`${editor.type}-${editor.key ?? "new"}`}
          editor={editor}
          busy={mutation.isPending}
          close={() => {
            setEditor(undefined);
            if (["image-build-zip", "image-load", "container-file-upload", "compose-backup-upload", "compose-restore", "volume-backup-upload", "volume-import"].includes(editor.type)) {
              setDockerUpload(undefined);
            }
          }}
          save={async (value) => {
            if (editor.type === "container-file-download") {
              const containerId = editor.key ?? "";
              const path = String(value.path ?? "").trim();
              if (!path) {
                setLocalError("请输入容器内文件路径");
                return;
              }
              setEditor(undefined);
              const fallbackName = path.split("/").filter(Boolean).pop() || "container-file.bin";
              await downloadDockerResource(
                `下载容器文件 · ${path}`,
                fallbackName,
                () => downloadDockerContainerFile(containerId, path),
                `/api/docker/containers/${encodeURIComponent(containerId)}/files/download?path=${encodeURIComponent(path)}`,
              );
              return;
            }
            if (editor.type === "image-filesystem-view") {
              const imageId = editor.key ?? "";
              const path = String(value.path ?? "/").trim() || "/";
              setEditor(undefined);
              await openDetail(`镜像文件系统 · ${path}`, () => getDockerImageFilesystem(imageId, path));
              return;
            }
            if (editor.type === "compose-discover") {
              const result = await discoverDockerCompose(String(value.scan_path ?? ""));
              setEditor(undefined);
              setDetail({ title: "Compose 扫描结果", value: result });
              return;
            }
            if (editor.type === "compose-read-file") {
              const projectPath = String(value.project_path ?? "").trim();
              const filePath = String(value.file_path ?? "").trim();
              if (!projectPath || !filePath) {
                setLocalError("请输入 Compose 项目路径和文件路径");
                return;
              }
              setEditor(undefined);
              await openDetail(`读取 Compose 文件 · ${filePath}`, () => readDockerComposeFile(projectPath, filePath));
              return;
            }
            if (editor.type === "compose-backup-download") {
              const projectName = String(value.project_name ?? "").trim();
              const backup = String(value.backup ?? "").trim();
              if (!projectName || !backup) {
                setLocalError("请输入 Compose 项目名称和备份文件");
                return;
              }
              setEditor(undefined);
              const fallbackName = backup.split(/[\\/]/).filter(Boolean).pop() || `${projectName}-backup.tar.gz`;
              await downloadDockerResource(
                `下载 Compose 备份 · ${projectName}`,
                fallbackName,
                () => downloadDockerComposeBackup(projectName, backup),
                `/api/docker/compose/${encodeURIComponent(projectName)}/backups/download.tar.gz?backup=${encodeURIComponent(backup)}`,
              );
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
            if (editor.type === "compose-dockerfile") {
              mutation.mutate({
                type: "compose-dockerfile-save",
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
      {imageToolsOpen ? <DockerActionSheet
        title="镜像高级工具"
        subtitle="构建、导入与加载"
        close={() => setImageToolsOpen(false)}
        actions={[
          { icon: GitBranch, label: "Git 构建", color: colors.primary, action: () => setEditor({ type: "image-build-git", title: "从 Git 构建镜像", value: { git_url: "", branch: "main", dockerfile: "Dockerfile", tag: "", build_args: {}, no_cache: false } }) },
          { icon: Archive, label: "ZIP 构建", color: colors.warning, action: () => void chooseDockerArchive("image-build-zip") },
          { icon: Download, label: "导入镜像", color: colors.cyan, action: () => setEditor({ type: "image-import", title: "导入镜像", value: { source: "", repository: "", tag: "latest" } }) },
          { icon: Upload, label: "加载归档", color: colors.success, action: () => void chooseDockerArchive("image-load") },
        ]}
      /> : null}
      {imageMenu ? <DockerActionSheet
        title="镜像操作"
        subtitle={imageMenu.name}
        close={() => setImageMenu(undefined)}
        actions={[
          { icon: Archive, label: "镜像历史", color: colors.text, action: () => void openDetail(`镜像历史 · ${imageMenu.name}`, () => getDockerImageHistory(imageMenu.key)) },
          { icon: Tags, label: "查看标签", color: colors.primary, action: () => void openDetail(`镜像标签 · ${imageMenu.name}`, () => getDockerImageTags(imageMenu.key)) },
          { icon: Folder, label: "文件系统", color: colors.warning, action: () => setEditor({ type: "image-filesystem-view", title: "浏览镜像文件系统", key: imageMenu.key, value: { path: "/" } }) },
          { icon: UploadCloud, label: "推送镜像", color: colors.cyan, action: () => setEditor({ type: "image-push", title: "推送镜像", key: imageMenu.key, value: imagePushValue(imageMenu.name) }) },
          { icon: Trash2, label: "删除镜像", color: colors.danger, action: () => danger("确认删除", `删除镜像 ${imageMenu.name}？`, () => mutation.mutate({ type: "image-remove", key: imageMenu.name !== "<none>" ? imageMenu.name.split(",")[0] : imageMenu.key })) },
        ]}
      /> : null}
      {containerMenu ? <DockerActionSheet
        title="容器操作"
        subtitle={containerMenu.name}
        close={() => setContainerMenu(undefined)}
        actions={[
          ...(containerMenu.running && !containerMenu.paused ? [{ icon: Pause, label: "暂停容器", color: colors.warning, action: () => mutation.mutate({ type: "container-pause", key: containerMenu.key }) }] : []),
          { icon: Search, label: "容器详情", color: colors.text, action: () => void inspect("container", containerMenu.key) },
          { icon: FileText, label: "查看日志", color: colors.cyan, action: () => void containerLogs(containerMenu.key) },
          { icon: Folder, label: "管理文件", color: colors.warning, action: () => setEditor({ type: "container-files", title: "容器文件操作", key: containerMenu.key, value: { operation: "list", path: "/" } }) },
          { icon: Download, label: "下载文件", color: colors.cyan, action: () => setEditor({ type: "container-file-download", title: "下载容器文件", key: containerMenu.key, value: { path: "/" } }) },
          { icon: Upload, label: "上传文件", color: colors.warning, action: () => void chooseDockerUpload("container-file-upload", containerMenu.key, `上传文件 · ${containerMenu.name}`, { path: "/" }) },
          { icon: Archive, label: "导出容器", color: colors.warning, action: () => void downloadDockerResource(`导出容器 · ${containerMenu.name}`, `${containerMenu.name.replace(/^\/+/, "") || "container"}.tar`, () => exportDockerContainer(containerMenu.key), `/api/docker/containers/${encodeURIComponent(containerMenu.key)}/export`, "POST") },
          { icon: Activity, label: "查看进程", color: colors.cyan, action: () => void openDetail(`容器进程 · ${containerMenu.name}`, () => getDockerContainerProcesses(containerMenu.key)) },
          { icon: FileText, label: "Compose 配置", color: colors.text, action: () => void openDetail(`Compose 配置 · ${containerMenu.name}`, () => getDockerContainerComposeConfig(containerMenu.key)) },
          { icon: Pencil, label: "编辑配置", color: colors.primary, action: () => void editContainer(containerMenu.key) },
          { icon: Box, label: "重命名", color: colors.primary, action: () => setEditor({ type: "container-rename", title: "重命名容器", key: containerMenu.key, value: { name: containerMenu.name } }) },
          { icon: Copy, label: "复制容器", color: colors.primary, action: () => setEditor({ type: "container-copy", title: "复制容器", key: containerMenu.key, value: { name: `${containerMenu.name.replace(/^\/+/, "")}-copy` } }) },
          { icon: Archive, label: "提交为镜像", color: colors.warning, action: () => setEditor({ type: "container-commit", title: "提交容器为镜像", key: containerMenu.key, value: { repository: "", tag: "latest", author: "", comment: "", pause: true } }) },
          { icon: Tags, label: "设置标签", color: colors.primary, action: () => setEditor({ type: "container-label-set", title: "设置容器标签", key: containerMenu.key, value: { label: "" } }) },
          { icon: Trash2, label: "移除标签", color: colors.danger, action: () => danger("移除标签", `移除容器 ${containerMenu.name} 的标签？`, () => mutation.mutate({ type: "container-label-remove", key: containerMenu.key })) },
          { icon: Layers, label: "设置分组", color: colors.primary, action: () => setEditor({ type: "container-group-set", title: "设置容器分组", key: containerMenu.key, value: { container_name: containerMenu.name.replace(/^\/+/, ""), group_key: "" } }) },
          { icon: GitBranch, label: "切换版本", color: colors.cyan, action: () => setEditor({ type: "container-version-switch", title: "切换容器版本", key: containerMenu.key, value: { target_image_ref: "" } }) },
          { icon: Trash2, label: "删除容器", color: colors.danger, action: () => danger("确认删除", `强制删除容器 ${containerMenu.name}？`, () => mutation.mutate({ type: "container-remove", key: containerMenu.key })) },
        ]}
      /> : null}
    </Page>
  );
}
