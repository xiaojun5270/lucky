import { useMutation, useQuery } from "@tanstack/react-query";
import { Image as ExpoImage } from "expo-image";
import { useIsFocused } from "expo-router";
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
import Svg, { Circle } from "react-native-svg";

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
import { StructuredDataView, StructuredForm } from "@/src/components/structured-form";
import { useLuckyStatus } from "@/src/hooks/use-lucky-status";
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

const emptyDockerInfo: LuckyRecord = {};
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

function deepDockerValue(source: unknown, key: string): unknown {
  const queue: unknown[] = [source];
  const visited = new Set<object>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = current as LuckyRecord;
    const match = Object.keys(record).find((item) => item.toLowerCase() === key.toLowerCase());
    if (match) return record[match];
    queue.push(...Object.values(record));
  }
  return undefined;
}

function dockerNumber(source: unknown, keys: string[]) {
  for (const key of keys) {
    const value = deepDockerValue(source, key);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      if (match) return Number(match[0]);
    }
  }
  return undefined;
}

function parseDockerBytes(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value
    .trim()
    .replace(/,/g, "")
    .match(/^(-?\d+(?:\.\d+)?)\s*([kmgtpe]?i?b)?/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "b").toLowerCase();
  const powers: Record<string, number> = {
    b: 0,
    kb: 1,
    kib: 1,
    mb: 2,
    mib: 2,
    gb: 3,
    gib: 3,
    tb: 4,
    tib: 4,
    pb: 5,
    pib: 5,
    eb: 6,
    eib: 6,
  };
  const base = unit.includes("i") ? 1024 : 1000;
  return amount * base ** (powers[unit] ?? 0);
}

function dockerValue(source: unknown, keys: string[]) {
  for (const key of keys) {
    const value = deepDockerValue(source, key);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function dockerDirectValue(source: LuckyRecord, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const match = Object.keys(source).find((key) => wanted.has(key.toLowerCase()));
  return match ? source[match] : undefined;
}

function dockerChildRecord(source: LuckyRecord, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(source)) {
    if (
      wanted.has(key.toLowerCase()) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value as LuckyRecord;
    }
  }
  return undefined;
}

function dockerCpuPercent(source: LuckyRecord) {
  const direct = dockerNumber(source, [
    "CPUPercent",
    "cpuPercent",
    "cpu_percent",
    "CPUPerc",
    "cpuPerc",
  ]);
  if (direct !== undefined) return Math.max(0, direct);

  const cpuStats = dockerChildRecord(source, ["cpu_stats", "cpuStats", "CPUStats"]);
  const previous = dockerChildRecord(source, ["precpu_stats", "preCpuStats", "PreCPUStats"]);
  const fallback = () => dockerNumber(source, [
    "CPUUsage",
    "cpuUsage",
    "cpu_usage",
    "CPU",
    "cpu",
  ]);
  if (!cpuStats || !previous) return fallback();
  const cpuUsage = dockerChildRecord(cpuStats, ["cpu_usage", "cpuUsage", "CPUUsage"]);
  const previousUsage = dockerChildRecord(previous, ["cpu_usage", "cpuUsage", "CPUUsage"]);
  if (!cpuUsage || !previousUsage) return fallback();
  const cpuDelta =
    (dockerNumber(cpuUsage, ["total_usage", "totalUsage", "TotalUsage"]) ?? 0) -
    (dockerNumber(previousUsage, ["total_usage", "totalUsage", "TotalUsage"]) ?? 0);
  const systemDelta =
    (dockerNumber(cpuStats, ["system_cpu_usage", "systemCpuUsage", "SystemCPUUsage"]) ?? 0) -
    (dockerNumber(previous, ["system_cpu_usage", "systemCpuUsage", "SystemCPUUsage"]) ?? 0);
  const perCpu = dockerValue(cpuUsage, ["percpu_usage", "perCpuUsage", "PercpuUsage"]);
  const cpuCount =
    dockerNumber(cpuStats, ["online_cpus", "onlineCpus", "OnlineCPUs"]) ??
    (Array.isArray(perCpu) ? perCpu.length : 1);
  const calculated = cpuDelta > 0 && systemDelta > 0
    ? (cpuDelta / systemDelta) * Math.max(1, cpuCount) * 100
    : undefined;
  return calculated ?? fallback();
}

function dockerMemoryValues(source: LuckyRecord) {
  const rawUsage = dockerValue(source, [
    "MemoryUsage",
    "memoryUsage",
    "memory_usage",
    "MemUsage",
    "memUsage",
    "mem_usage",
    "Memory",
    "memory",
    "Mem",
    "mem",
  ]);
  let usage = parseDockerBytes(rawUsage);
  let limit = parseDockerBytes(
    dockerValue(source, [
      "MemoryLimit",
      "memoryLimit",
      "memory_limit",
      "MemLimit",
      "memLimit",
      "mem_limit",
    ]),
  );

  if (typeof rawUsage === "string" && rawUsage.includes("/")) {
    const [usedPart, limitPart] = rawUsage.split("/", 2);
    usage = parseDockerBytes(usedPart) ?? usage;
    limit = parseDockerBytes(limitPart) ?? limit;
  }

  const memoryStats = dockerChildRecord(source, [
    "memory_stats",
    "memoryStats",
    "MemoryStats",
  ]);
  if (usage === undefined && memoryStats) {
    const raw = dockerNumber(memoryStats, ["usage", "Usage"]);
    const detail = dockerChildRecord(memoryStats, ["stats", "Stats"]);
    const cache = detail
      ? dockerNumber(detail, ["total_inactive_file", "inactive_file", "cache", "Cache"]) ?? 0
      : 0;
    if (raw !== undefined) usage = cache > 0 && cache < raw ? raw - cache : raw;
  }
  if (limit === undefined && memoryStats) {
    limit = dockerNumber(memoryStats, ["limit", "Limit"]);
  }

  const directPercent = dockerNumber(source, [
    "MemoryPercent",
    "memoryPercent",
    "memory_percent",
    "MemPercent",
    "memPercent",
    "MemPerc",
    "memPerc",
  ]);
  const percent =
    directPercent !== undefined
      ? directPercent
      : usage !== undefined && limit && limit > 0
        ? (usage / limit) * 100
        : undefined;
  return {
    usage: usage === undefined ? undefined : Math.max(0, usage),
    limit,
    percent: percent === undefined ? undefined : Math.max(0, percent),
  };
}

function dockerBytePair(value: unknown) {
  if (typeof value === "string" && value.includes("/")) {
    const [left, right] = value.split("/", 2);
    return [parseDockerBytes(left), parseDockerBytes(right)] as const;
  }
  if (Array.isArray(value) && value.length >= 2) {
    return [parseDockerBytes(value[0]), parseDockerBytes(value[1])] as const;
  }
  return [undefined, undefined] as const;
}

function dockerIoValues(source: LuckyRecord) {
  const [combinedRx, combinedTx] = dockerBytePair(dockerDirectValue(source, [
    "NetIO",
    "netIO",
    "net_io",
    "NetworkIO",
    "networkIO",
    "network_io",
  ]));
  let networkRx = parseDockerBytes(dockerDirectValue(source, [
    "NetworkRx",
    "NetworkRX",
    "networkRx",
    "network_rx",
    "network_rx_bytes",
    "NetworkInput",
    "networkInput",
    "network_input",
    "NetInput",
    "netInput",
    "net_input",
    "RxBytes",
    "rxBytes",
    "rx_bytes",
  ])) ?? combinedRx;
  let networkTx = parseDockerBytes(dockerDirectValue(source, [
    "NetworkTx",
    "NetworkTX",
    "networkTx",
    "network_tx",
    "network_tx_bytes",
    "NetworkOutput",
    "networkOutput",
    "network_output",
    "NetOutput",
    "netOutput",
    "net_output",
    "TxBytes",
    "txBytes",
    "tx_bytes",
  ])) ?? combinedTx;

  const networks = dockerChildRecord(source, ["networks", "Networks", "network", "Network"]);
  if ((networkRx === undefined || networkTx === undefined) && networks) {
    const directRxKey = Object.keys(networks).find((key) => ["rx_bytes", "rxbytes"].includes(key.toLowerCase()));
    const directTxKey = Object.keys(networks).find((key) => ["tx_bytes", "txbytes"].includes(key.toLowerCase()));
    const directRx = directRxKey ? parseDockerBytes(networks[directRxKey]) : undefined;
    const directTx = directTxKey ? parseDockerBytes(networks[directTxKey]) : undefined;
    let rx = directRx ?? 0;
    let tx = directTx ?? 0;
    let foundRx = directRx !== undefined;
    let foundTx = directTx !== undefined;
    for (const value of Object.values(networks)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as LuckyRecord;
      const nextRx = dockerNumber(entry, ["rx_bytes", "rxBytes", "RxBytes"]);
      const nextTx = dockerNumber(entry, ["tx_bytes", "txBytes", "TxBytes"]);
      if (nextRx !== undefined) {
        rx += nextRx;
        foundRx = true;
      }
      if (nextTx !== undefined) {
        tx += nextTx;
        foundTx = true;
      }
    }
    if (networkRx === undefined && foundRx) networkRx = rx;
    if (networkTx === undefined && foundTx) networkTx = tx;
  }

  const [combinedRead, combinedWrite] = dockerBytePair(dockerDirectValue(source, [
    "BlockIO",
    "blockIO",
    "blockIo",
    "block_io",
    "BlkIO",
    "blkIO",
    "DiskIO",
    "diskIO",
    "disk_io",
  ]));
  let blockRead = parseDockerBytes(dockerDirectValue(source, [
    "BlockRead",
    "blockRead",
    "block_read",
    "block_read_bytes",
    "DiskRead",
    "diskRead",
    "disk_read",
    "BlockInput",
    "blockInput",
    "block_input",
    "IORead",
    "ioRead",
    "io_read",
    "ReadBytes",
    "readBytes",
    "read_bytes",
  ])) ?? combinedRead;
  let blockWrite = parseDockerBytes(dockerDirectValue(source, [
    "BlockWrite",
    "blockWrite",
    "block_write",
    "block_write_bytes",
    "DiskWrite",
    "diskWrite",
    "disk_write",
    "BlockOutput",
    "blockOutput",
    "block_output",
    "IOWrite",
    "ioWrite",
    "io_write",
    "WriteBytes",
    "writeBytes",
    "write_bytes",
  ])) ?? combinedWrite;

  const blockStats = dockerChildRecord(source, ["blkio_stats", "blkioStats", "BlkioStats"]);
  const recursiveServiceBytes = blockStats
    ? dockerValue(blockStats, [
        "io_service_bytes_recursive",
        "ioServiceBytesRecursive",
        "IoServiceBytesRecursive",
      ])
    : undefined;
  const serviceBytes = Array.isArray(recursiveServiceBytes) && recursiveServiceBytes.length
    ? recursiveServiceBytes
    : blockStats
      ? dockerValue(blockStats, ["io_service_bytes", "ioServiceBytes", "IoServiceBytes"])
      : undefined;
  if ((blockRead === undefined || blockWrite === undefined) && Array.isArray(serviceBytes)) {
    let read = 0;
    let write = 0;
    let foundRead = false;
    let foundWrite = false;
    for (const value of serviceBytes) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const entry = value as LuckyRecord;
      const operation = pick(entry, ["op", "Op", "operation", "Operation"]).toLowerCase();
      const amount = dockerNumber(entry, ["value", "Value"]);
      if (amount === undefined) continue;
      if (operation === "read") {
        read += amount;
        foundRead = true;
      }
      if (operation === "write") {
        write += amount;
        foundWrite = true;
      }
    }
    if (blockRead === undefined && foundRead) blockRead = read;
    if (blockWrite === undefined && foundWrite) blockWrite = write;
  }

  return { networkRx, networkTx, blockRead, blockWrite };
}

function hasDockerStatShape(record: LuckyRecord) {
  const keys = Object.keys(record).map((key) => key.toLowerCase().replace(/[^a-z]/g, ""));
  return keys.some(
    (key) =>
      key === "cpu" ||
      key === "memory" ||
      key === "mem" ||
      key.includes("cpupercent") ||
      key.includes("cpuperc") ||
      key.includes("cpuusage") ||
      key.includes("cpustats") ||
      key.includes("memoryusage") ||
      key.includes("memusage") ||
      key.includes("memorypercent") ||
      key.includes("memperc") ||
      key.includes("memorystats") ||
      key === "networks" ||
      key === "network" ||
      key.includes("networkio") ||
      key.includes("netio") ||
      key.includes("networkrx") ||
      key.includes("networktx") ||
      key === "rxbytes" ||
      key === "txbytes" ||
      key.includes("blockio") ||
      key.includes("blockread") ||
      key.includes("blockwrite") ||
      key.includes("diskread") ||
      key.includes("diskwrite") ||
      key === "readbytes" ||
      key === "writebytes" ||
      key.includes("blkiostats"),
  );
}

type DockerStatCandidate = { record: LuckyRecord; hint: string };

function collectDockerStats(source: unknown) {
  const rows: DockerStatCandidate[] = [];
  const visited = new Set<object>();
  const wrapperKeys = new Set(["data", "result", "stats", "list", "containers"]);

  function visit(value: unknown, hint = "", depth = 0) {
    if (!value || typeof value !== "object" || depth > 7 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, hint, depth + 1));
      return;
    }
    const record = value as LuckyRecord;
    if (hasDockerStatShape(record)) {
      rows.push({ record, hint });
      return;
    }
    const ownName = pick(record, ["Name", "name", "ContainerName", "containerName"]);
    for (const [key, child] of Object.entries(record)) {
      const nextHint = ownName || (wrapperKeys.has(key.toLowerCase()) ? hint : key);
      visit(child, nextHint, depth + 1);
    }
  }

  visit(source);
  return rows;
}

type DockerContainerState = "running" | "paused" | "exited" | "created" | "other";

function dockerContainerState(item: LuckyRecord): DockerContainerState {
  const state = [
    pick(item, ["State", "state"]),
    pick(item, ["Status", "status"]),
  ].join(" ").toLowerCase();
  if (/paused/.test(state)) return "paused";
  if (/created/.test(state)) return "created";
  if (/exited|stopped|dead|removing/.test(state)) return "exited";
  if (/running|active|\bup\b|restarting/.test(state)) return "running";
  return "other";
}

function cleanDockerContainerName(value: string) {
  return value.split(",")[0]?.trim().replace(/^\/+/, "") ?? "";
}

type DockerStatRow = {
  key: string;
  name: string;
  cpu: number;
  hasCpu: boolean;
  memory: number;
  hasMemory: boolean;
  memoryPercent: number;
  hasMemoryPercent: boolean;
  networkRx: number;
  hasNetworkRx: boolean;
  networkTx: number;
  hasNetworkTx: boolean;
  blockRead: number;
  hasBlockRead: boolean;
  blockWrite: number;
  hasBlockWrite: boolean;
};

function dockerStatRows(source: unknown, containers: LuckyRecord[]) {
  const containerInfo = containers.map((container, index) => ({
    container,
    id: pick(container, ["Id", "ID", "id", "Container", "ContainerID", "ContainerId", "containerId"], String(index)),
    name: cleanDockerContainerName(
      pick(container, ["Names", "Name", "name", "ContainerName", "containerName"]),
    ),
  }));
  const byKey = new Map<string, DockerStatRow>();

  for (const [index, candidate] of collectDockerStats(source).entries()) {
    const rawId = pick(candidate.record, [
      "Id",
      "ID",
      "id",
      "Container",
      "ContainerID",
      "ContainerId",
      "containerId",
      "container_id",
    ]);
    const rawName = cleanDockerContainerName(
      pick(candidate.record, ["Name", "name", "ContainerName", "containerName"]),
    );
    const match = containerInfo.find(
      (item) =>
        (rawId && (item.id.startsWith(rawId) || rawId.startsWith(item.id))) ||
        (candidate.hint &&
          (item.id.startsWith(candidate.hint) || candidate.hint.startsWith(item.id))) ||
        (rawName && item.name === rawName) ||
        (candidate.hint && item.name === cleanDockerContainerName(candidate.hint)),
    );
    if (match && ["exited", "created"].includes(dockerContainerState(match.container))) continue;

    const cpu = dockerCpuPercent(candidate.record);
    const memory = dockerMemoryValues(candidate.record);
    const io = dockerIoValues(candidate.record);
    if (
      cpu === undefined &&
      memory.usage === undefined &&
      io.networkRx === undefined &&
      io.networkTx === undefined &&
      io.blockRead === undefined &&
      io.blockWrite === undefined
    ) continue;
    const name =
      match?.name ||
      rawName ||
      cleanDockerContainerName(candidate.hint) ||
      `容器 ${index + 1}`;
    const key = match?.id || rawId || candidate.hint || `${name}-${index}`;
    const next: DockerStatRow = {
      key,
      name,
      cpu: cpu ?? 0,
      hasCpu: cpu !== undefined,
      memory: memory.usage ?? 0,
      hasMemory: memory.usage !== undefined,
      memoryPercent: memory.percent ?? 0,
      hasMemoryPercent: memory.percent !== undefined,
      networkRx: io.networkRx ?? 0,
      hasNetworkRx: io.networkRx !== undefined,
      networkTx: io.networkTx ?? 0,
      hasNetworkTx: io.networkTx !== undefined,
      blockRead: io.blockRead ?? 0,
      hasBlockRead: io.blockRead !== undefined,
      blockWrite: io.blockWrite ?? 0,
      hasBlockWrite: io.blockWrite !== undefined,
    };
    const current = byKey.get(key);
    byKey.set(key, current ? {
      ...current,
      name: current.name || next.name,
      cpu: next.hasCpu ? next.cpu : current.cpu,
      hasCpu: current.hasCpu || next.hasCpu,
      memory: next.hasMemory ? next.memory : current.memory,
      hasMemory: current.hasMemory || next.hasMemory,
      memoryPercent: next.hasMemoryPercent ? next.memoryPercent : current.memoryPercent,
      hasMemoryPercent: current.hasMemoryPercent || next.hasMemoryPercent,
      networkRx: next.hasNetworkRx ? next.networkRx : current.networkRx,
      hasNetworkRx: current.hasNetworkRx || next.hasNetworkRx,
      networkTx: next.hasNetworkTx ? next.networkTx : current.networkTx,
      hasNetworkTx: current.hasNetworkTx || next.hasNetworkTx,
      blockRead: next.hasBlockRead ? next.blockRead : current.blockRead,
      hasBlockRead: current.hasBlockRead || next.hasBlockRead,
      blockWrite: next.hasBlockWrite ? next.blockWrite : current.blockWrite,
      hasBlockWrite: current.hasBlockWrite || next.hasBlockWrite,
    } : next);
  }
  return [...byKey.values()];
}

function formatPercent(value: number | undefined, digits = 1) {
  return value === undefined || !Number.isFinite(value) ? "--" : `${value.toFixed(digits)}%`;
}

function DockerGauge({ label, value, color, digits = 1 }: { label: string; value?: number; color: string; digits?: number }) {
  const colors = useAppTheme();
  const size = 94;
  const radius = 34;
  const circumference = Math.PI * 2 * radius;
  const arc = circumference * 0.75;
  const progress = value === undefined ? 0 : Math.min(100, Math.max(0, value));
  return <View
    accessibilityRole="progressbar"
    accessibilityLabel={`${label}使用率`}
    accessibilityValue={value === undefined
      ? { text: "暂无数据" }
      : { min: 0, max: 100, now: progress, text: formatPercent(value, digits) }}
    style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
  >
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colors.muted}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${arc} ${circumference}`}
        transform={`rotate(135 ${size / 2} ${size / 2})`}
      />
      {value !== undefined && progress > 0 ? <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={`${arc * (progress / 100)} ${circumference}`}
        transform={`rotate(135 ${size / 2} ${size / 2})`}
      /> : null}
    </Svg>
    <View pointerEvents="none" style={{ position: "absolute", alignItems: "center" }}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={{ maxWidth: 70, color: colors.text, fontSize: 18, fontWeight: "800" }}>
        {formatPercent(value, digits)}
      </Text>
    </View>
  </View>;
}

function DockerResourceCard({
  title,
  color,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  gaugeValue,
  digits,
}: {
  title: string;
  color: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  gaugeValue?: number;
  digits?: number;
}) {
  const colors = useAppTheme();
  return <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 330, minWidth: 260 }}>
    <Panel>
      <View style={{ minHeight: 116, flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 13 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>{title}</Text>
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ flex: 1, color: colors.subtext, fontSize: 11 }}>{primaryLabel}</Text>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>{primaryValue}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ flex: 1, color: colors.subtext, fontSize: 11 }}>{secondaryLabel}</Text>
              <Text numberOfLines={1} style={{ color, fontSize: 15, fontWeight: "800" }}>{secondaryValue}</Text>
            </View>
          </View>
        </View>
        <DockerGauge label={title} value={gaugeValue} color={color} digits={digits} />
      </View>
    </Panel>
  </View>;
}

function DockerLiveResourceCards({ info, active }: { info: LuckyRecord; active: boolean }) {
  const colors = useAppTheme();
  const live = useLuckyStatus(active);
  const hasLiveData = active && live.connected && Boolean(live.data);
  const cpuCount = dockerNumber(info, ["NCPU", "Ncpu", "CPUCount", "cpuCount", "NumCPU"]);
  const totalMemory = (hasLiveData ? live.data?.totalMem : 0) || parseDockerBytes(
    dockerValue(info, ["MemTotal", "memTotal", "TotalMemory", "totalMemory"]),
  );
  const cpuUsage = hasLiveData && live.data && Number.isFinite(live.data.usedCpu)
    ? live.data.usedCpu
    : undefined;
  const memoryUsage = hasLiveData ? live.data?.usedMem : undefined;
  const memoryPercent = memoryUsage !== undefined && totalMemory
    ? (memoryUsage / totalMemory) * 100
    : undefined;
  const connectionValue = live.error ? "连接中断" : "连接中";

  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
    <DockerResourceCard
      title="CPU"
      color={colors.primary}
      primaryLabel="逻辑核心"
      primaryValue={cpuCount === undefined ? "--" : String(Math.round(cpuCount))}
      secondaryLabel="使用率 (%)"
      secondaryValue={cpuUsage === undefined ? connectionValue : formatPercent(cpuUsage, 2)}
      gaugeValue={cpuUsage}
      digits={2}
    />
    <DockerResourceCard
      title="内存"
      color={colors.success}
      primaryLabel="总可用内存"
      primaryValue={totalMemory ? bytes(totalMemory) : "--"}
      secondaryLabel="使用率 (%)"
      secondaryValue={memoryPercent === undefined ? connectionValue : formatPercent(memoryPercent, 1)}
      gaugeValue={memoryPercent}
    />
  </View>;
}

function DockerSummaryItem({
  icon: Icon,
  color,
  background,
  valueColor,
  value,
  suffix,
  label,
  badge,
  onPress,
}: {
  icon: typeof Container;
  color: string;
  background: string;
  valueColor?: string;
  value: string;
  suffix?: string;
  label: string;
  badge?: string;
  onPress: () => void;
}) {
  const colors = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`查看${label}`}
    onPress={onPress}
    style={({ pressed }) => ({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 120,
      minWidth: 118,
      minHeight: 64,
      padding: 8,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: pressed ? colors.mutedCard : colors.card,
      opacity: pressed ? 0.72 : 1,
    })}
  >
    <View style={{ width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: background }}>
      <Icon color={color} size={19} strokeWidth={2.2} />
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text numberOfLines={1} style={{ color: valueColor ?? colors.text, fontSize: 17, fontWeight: "800" }}>{value}</Text>
        {suffix ? <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 12, fontWeight: "700" }}>{suffix}</Text> : null}
      </View>
      <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10 }}>{label}</Text>
      {badge ? <View style={{ alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.mutedCard }}><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 9, fontWeight: "700" }}>{badge}</Text></View> : null}
    </View>
  </Pressable>;
}

function DockerStateChip({ label, value, color }: { label: string; value: string; color: string }) {
  const colors = useAppTheme();
  return <View style={{ minHeight: 32, paddingHorizontal: 11, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", gap: 6 }}>
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    <Text style={{ color: colors.subtext, fontSize: 11 }}>{label}</Text>
    <Text style={{ color: colors.text, fontSize: 11, fontWeight: "800" }}>{value}</Text>
  </View>;
}

function DockerRankingCard({
  title,
  color,
  rows,
  mode,
  emptyMessage,
  onSelectContainer,
}: {
  title: string;
  color: string;
  rows: DockerStatRow[];
  mode: "cpu" | "memory";
  emptyMessage: string;
  onSelectContainer: (name: string) => void;
}) {
  const colors = useAppTheme();
  const memoryMax = Math.max(1, ...rows.map((row) => row.memory));
  return <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 360, minWidth: 260 }}>
    <Panel>
      <View style={{ minHeight: 28, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 6, height: 20, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" }}>{title}</Text>
      </View>
      {rows.length ? <View style={{ gap: 0 }}>
        <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ width: 18, color: colors.subtext, fontSize: 9, textAlign: "center" }}>#</Text>
          <Text style={{ flex: 1, color: colors.subtext, fontSize: 9 }}>容器名称</Text>
          <Text style={{ minWidth: 62, color: colors.subtext, fontSize: 9, textAlign: "right" }}>{mode === "cpu" ? "使用率 (%)" : "内存占用"}</Text>
        </View>
        {rows.map((row, index) => {
        const metric = mode === "cpu" ? row.cpu : row.memory;
        const bar = mode === "cpu"
          ? Math.min(100, Math.max(0, row.cpu))
          : row.hasMemoryPercent
            ? Math.min(100, Math.max(0, row.memoryPercent))
            : (row.memory / memoryMax) * 100;
        const barColor = mode === "cpu"
          ? row.cpu >= 80
            ? colors.danger
            : row.cpu >= 50
              ? colors.warning
              : colors.primary
          : row.memoryPercent >= 80
            ? colors.danger
            : row.memoryPercent >= 60
              ? colors.warning
              : colors.success;
        return <Pressable
          key={row.key}
          accessibilityRole="button"
          accessibilityLabel={`查看容器 ${row.name}`}
          onPress={() => onSelectContainer(row.name)}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderTopColor: colors.rowBorder,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ width: 18, color: index === 0 ? colors.danger : index === 1 ? colors.warning : colors.subtext, fontSize: 11, fontWeight: "800", textAlign: "center" }}>{index + 1}</Text>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.primary, fontSize: 11, fontWeight: "700" }}>{row.name}</Text>
          <View style={{ flexBasis: 90, flexShrink: 1, minWidth: 48, maxWidth: 110, height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
            <View style={{ width: `${Math.max(0, Math.min(100, bar))}%` as `${number}%`, height: 6, borderRadius: 3, backgroundColor: barColor }} />
          </View>
          <Text numberOfLines={1} style={{ minWidth: 62, color: colors.subtext, fontSize: 10, fontWeight: "700", textAlign: "right" }}>
            {mode === "cpu" ? formatPercent(metric, 1) : metric > 0 ? bytes(metric) : "0 B"}
          </Text>
        </Pressable>;
        })}
      </View> : <View style={{ minHeight: 92, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.subtext, fontSize: 12 }}>{emptyMessage}</Text></View>}
    </Panel>
  </View>;
}

function DockerOverviewDashboard({
  data,
  active,
  stats,
  statsLoading,
  statsError,
  onSelectView,
  onSelectContainer,
}: {
  data?: Awaited<ReturnType<typeof getDockerOverview>>;
  active: boolean;
  stats?: LuckyRecord;
  statsLoading: boolean;
  statsError?: string;
  onSelectView: (view: DockerView) => void;
  onSelectContainer: (name: string) => void;
}) {
  const colors = useAppTheme();
  const containers = data?.containers ?? emptyDockerContainers;
  const statRows = useMemo(
    () => dockerStatRows(stats, containers),
    [stats, containers],
  );
  const cpuRows = useMemo(
    () => statRows.filter((row) => row.hasCpu).sort((left, right) => right.cpu - left.cpu).slice(0, 5),
    [statRows],
  );
  const memoryRows = useMemo(
    () => statRows.filter((row) => row.hasMemory).sort((left, right) => right.memory - left.memory).slice(0, 5),
    [statRows],
  );
  const states = useMemo(() => {
    const counts: Record<DockerContainerState, number> = {
      running: 0,
      paused: 0,
      exited: 0,
      created: 0,
      other: 0,
    };
    containers.forEach((container) => {
      counts[dockerContainerState(container)] += 1;
    });
    return counts;
  }, [containers]);
  const imageAccent = colors.mode === "dark" ? "#ff6482" : "#d63384";
  const imageBackground = colors.mode === "dark" ? "#4a1830" : "#fce7f3";
  const count = (value: number | undefined) => value === undefined ? "--" : String(value);
  const statusValue = (value: number) => data?.containersAvailable ? String(value) : "--";
  const rankingEmpty = statsError
    ? "容器统计暂不可用"
    : statsLoading
      ? "正在读取容器统计"
      : "暂无容器统计数据";

  return <>
    <SectionHeader icon={Gauge} title="Docker 总览" />
    <DockerLiveResourceCards info={data?.info ?? emptyDockerInfo} active={active} />

    <View style={{ padding: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <DockerSummaryItem icon={Workflow} color={colors.subtext} background={colors.mutedCard} value={count(data?.composeCount)} label="Compose" onPress={() => onSelectView("compose")} />
        <DockerSummaryItem icon={Container} color={colors.primary} background={colors.primarySoft} valueColor={colors.success} value={statusValue(states.running)} suffix={data?.containerCount === undefined ? undefined : ` / ${data.containerCount}`} label="容器" onPress={() => onSelectView("containers")} />
        <DockerSummaryItem icon={Image} color={imageAccent} background={imageBackground} value={count(data?.imageCount)} label="镜像列表" badge={data?.imageSize === undefined ? undefined : data.imageSize > 0 ? bytes(data.imageSize) : "0 B"} onPress={() => onSelectView("images")} />
        <DockerSummaryItem icon={Database} color={colors.success} background={colors.successBg} value={count(data?.volumeCount)} label="数据卷" onPress={() => onSelectView("volumes")} />
        <DockerSummaryItem icon={Network} color={colors.cyan} background={colors.cyanBg} value={count(data?.networkCount)} label="网络" onPress={() => onSelectView("networks")} />
      </View>
    </View>

    <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.mutedCard, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Text style={{ marginRight: 4, color: colors.text, fontSize: 12, fontWeight: "800" }}>容器状态</Text>
      <DockerStateChip label="运行中" value={statusValue(states.running)} color={colors.success} />
      <DockerStateChip label="已暂停" value={statusValue(states.paused)} color={colors.warning} />
      <DockerStateChip label="已退出" value={statusValue(states.exited)} color={colors.danger} />
      <DockerStateChip label="已创建" value={statusValue(states.created)} color={colors.primary} />
      {states.other > 0 ? <DockerStateChip label="其它" value={String(states.other)} color={colors.subtext} /> : null}
    </View>

    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      <DockerRankingCard title="CPU 使用率前 5" color={colors.primary} rows={cpuRows} mode="cpu" emptyMessage={rankingEmpty} onSelectContainer={onSelectContainer} />
      <DockerRankingCard title="内存使用率前 5" color={colors.success} rows={memoryRows} mode="memory" emptyMessage={rankingEmpty} onSelectContainer={onSelectContainer} />
    </View>
  </>;
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
    project_name: pick(item, ["Name", "name", "ProjectName", "project_name"]),
    project_path: pick(item, [
      "Path",
      "path",
      "ProjectPath",
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
  onPress,
}: {
  icon: typeof Pencil;
  label: string;
  color: string;
  onPress: () => void;
}) {
  const colors = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: colors.mutedCard,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon color={color} size={16} />
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
  const [view, setView] = useState<DockerView>("containers");
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState !== "background" && AppState.currentState !== "inactive",
  );
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [editor, setEditor] = useState<Editor>();
  const [containerMenu, setContainerMenu] = useState<{ key: string; name: string; running: boolean; paused: boolean }>();
  const [output, setOutput] = useState<unknown>("");
  const [localError, setLocalError] = useState("");
  const overviewActive = view === "overview" && isScreenFocused && appIsActive;
  const containerStatsActive =
    (view === "overview" || view === "containers") && isScreenFocused && appIsActive;
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
    staleTime: 8_000,
    refetchInterval: containerStatsActive ? 10_000 : false,
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
      if (type.startsWith("compose-"))
        return runDockerComposeAction(
          type.replace("compose-", "") as "up",
          value ?? {},
        );
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
    onSuccess: async () => {
      setEditor(undefined);
      setLocalError("");
      await queryClient.invalidateQueries({ queryKey: ["docker"] });
    },
    onError: (error) => setLocalError(error.message),
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
      {active.error ? (
        <ErrorState
          message={active.error.message}
          retry={() => active.refetch()}
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
                  <Pressable onPress={() => setContainerMenu({ key, name, running, paused })} style={({ pressed }) => ({ minHeight: 72, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, opacity: pressed ? 0.62 : 1 })}>
                    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 140, flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <ContainerArtwork item={item} icons={iconLibrary.data ?? []} running={running} size={52} />
                      <View style={{ width: 4, height: 42, borderRadius: 2, backgroundColor: running ? colors.success : colors.disabled }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>{displayName}</Text>
                        <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, marginTop: 4 }}>{containerStatus(item, running, paused)}</Text>
                      </View>
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
                      onPress={() =>
                        mutation.mutate({ type: "compose-up", value: payload })
                      }
                    />
                    <IconButton
                      icon={CircleStop}
                      label="停止"
                      color={colors.danger}
                      onPress={() =>
                        danger("确认停止", `停止 Compose 项目 ${name}？`, () =>
                          mutation.mutate({
                            type: "compose-down",
                            value: payload,
                          }),
                        )
                      }
                    />
                    <IconButton
                      icon={RotateCw}
                      label="重启"
                      color={colors.primary}
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
                      onPress={async () => {
                        setOutput(await getDockerComposeLogs(name, { tail: 200 }));
                        setView("logs");
                      }}
                    />
                    <IconButton
                      icon={Save}
                      label="备份"
                      color={colors.warning}
                      onPress={() =>
                        danger("确认备份", `备份 Compose 项目 ${name}？`, () =>
                          backupDockerCompose(
                            payload.project_path,
                            payload.project_name,
                          ),
                        )
                      }
                    />
                    <IconButton
                      icon={Pencil}
                      label="编辑配置"
                      color={colors.primary}
                      onPress={async () => {
                        const result = await readDockerComposeConfig(
                          payload.project_path,
                        );
                        setEditor({
                          type: "compose-config",
                          title: "编辑 Compose 配置",
                          key: payload.project_path,
                          value: {
                            project_path: payload.project_path,
                            content: String(
                              result.content ?? result.data ?? "",
                            ),
                          },
                        });
                      }}
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
                  style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
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
              await updateDockerComposeConfig(
                String(value.project_path ?? editor.key ?? ""),
                String(value.content ?? ""),
              );
              setEditor(undefined);
              await queryClient.invalidateQueries({ queryKey: ["docker"] });
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
