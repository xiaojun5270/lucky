import {
  Container,
  Cpu,
  Database,
  Gauge,
  Image,
  MemoryStick,
  Network,
  Workflow,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { IconTile, Panel, SectionHeader } from "@/src/components/lucky-ui";
import { useLuckyStatus } from "@/src/hooks/use-lucky-status";
import { useAppTheme } from "@/src/lib/theme";
import { getDockerOverview } from "@/src/services/docker";
import type { LuckyRecord } from "@/src/types/lucky";

const emptyDockerInfo: LuckyRecord = {};
const emptyDockerContainers: LuckyRecord[] = [];

function pick(item: LuckyRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (Array.isArray(value) && value.length) {
      return value.map(String).join(", ");
    }
  }
  return fallback;
}

function bytes(value: unknown) {
  const size = Number(value) || 0;
  if (!size) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(size) / Math.log(1024)),
    units.length - 1,
  );
  return `${(size / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
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

export function dockerContainerState(item: LuckyRecord): DockerContainerState {
  const state = [
    pick(item, ["State", "state"]),
    pick(item, ["Status", "status"]),
  ].join(" ").toLowerCase();
  if (/paused/.test(state)) return "paused";
  if (/created/.test(state)) return "created";
  if (/exited|stopped|dead|removing/.test(state)) return "exited";
  const running = item.Running ?? item.running;
  const normalizedRunning = typeof running === "string" ? running.trim().toLowerCase() : running;
  if (
    normalizedRunning === true ||
    normalizedRunning === 1 ||
    normalizedRunning === "true" ||
    normalizedRunning === "1"
  ) return "running";
  if (
    normalizedRunning === false ||
    normalizedRunning === 0 ||
    normalizedRunning === "false" ||
    normalizedRunning === "0"
  ) return "exited";
  if (/running|active|\bup\b|restarting/.test(state)) return "running";
  return "other";
}

function cleanDockerContainerName(value: string) {
  return value.split(",")[0]?.trim().replace(/^\/+/, "") ?? "";
}

export type DockerStatRow = {
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

export function dockerStatRows(source: unknown, containers: LuckyRecord[]) {
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
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.65}
        numberOfLines={1}
        style={{ width: 60, color: colors.text, fontSize: 14, lineHeight: 18, fontWeight: "800", textAlign: "center", includeFontPadding: false }}
      >
        {formatPercent(value, digits)}
      </Text>
    </View>
  </View>;
}

function DockerResourceCard({
  icon: Icon,
  iconBackground,
  title,
  color,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  gaugeValue,
  digits,
}: {
  icon: typeof Cpu;
  iconBackground: string;
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
            <IconTile icon={Icon} color={color} background={iconBackground} size={32} iconSize={16} />
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

type DockerLiveStatus = ReturnType<typeof useLuckyStatus>;

function DockerLiveResourceCards({
  info,
  active,
  liveStatus,
}: {
  info: LuckyRecord;
  active: boolean;
  liveStatus?: DockerLiveStatus;
}) {
  const colors = useAppTheme();
  const internalLive = useLuckyStatus(active && !liveStatus);
  const live = liveStatus ?? internalLive;
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
      icon={Cpu}
      iconBackground={colors.primarySoft}
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
      icon={MemoryStick}
      iconBackground={colors.successBg}
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
  width,
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
  width?: number;
  onPress: () => void;
}) {
  const colors = useAppTheme();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`查看${label}`}
    onPress={onPress}
    style={({ pressed }) => ({
      width,
      flexGrow: width === undefined ? 1 : 0,
      flexShrink: width === undefined ? 1 : 0,
      flexBasis: width ?? 132,
      minWidth: width ?? 132,
      minHeight: 72,
      padding: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: pressed ? colors.mutedCard : colors.card,
      opacity: pressed ? 0.72 : 1,
      shadowColor: colors.shadow,
      shadowOpacity: colors.mode === "dark" ? 0 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
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
      <Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 11 }}>{label}</Text>
      {badge ? <View style={{ alignSelf: "flex-start", maxWidth: "100%", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, backgroundColor: colors.mutedCard }}><Text numberOfLines={1} style={{ color: colors.subtext, fontSize: 10, fontWeight: "700" }}>{badge}</Text></View> : null}
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
        <IconTile icon={mode === "cpu" ? Cpu : MemoryStick} color={color} background={mode === "cpu" ? colors.primarySoft : colors.successBg} size={32} iconSize={16} />
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
            minHeight: 48,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderTopColor: colors.rowBorder,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Text style={{ width: 18, color: index === 0 ? colors.danger : index === 1 ? colors.warning : colors.subtext, fontSize: 11, fontWeight: "800", textAlign: "center" }}>{index + 1}</Text>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.primary, fontSize: 12, fontWeight: "700" }}>{row.name}</Text>
          <View style={{ flexBasis: 70, flexShrink: 1, minWidth: 36, maxWidth: 90, height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
            <View style={{ width: `${Math.max(0, Math.min(100, bar))}%` as `${number}%`, height: 6, borderRadius: 3, backgroundColor: barColor }} />
          </View>
          <Text numberOfLines={1} style={{ minWidth: 62, color: colors.subtext, fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right" }}>
            {mode === "cpu" ? formatPercent(metric, 1) : metric > 0 ? bytes(metric) : "0 B"}
          </Text>
        </Pressable>;
        })}
      </View> : <View style={{ minHeight: 92, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.subtext, fontSize: 12 }}>{emptyMessage}</Text></View>}
    </Panel>
  </View>;
}

export type DockerOverviewTarget =
  | "containers"
  | "images"
  | "compose"
  | "networks"
  | "volumes";

export function DockerOverviewDashboard({
  data,
  active,
  liveStatus,
  stats,
  statsLoading,
  statsError,
  showHeader = true,
  showContainerInsights = true,
  onSelectView,
  onSelectContainer,
}: {
  data?: Awaited<ReturnType<typeof getDockerOverview>>;
  active: boolean;
  liveStatus?: DockerLiveStatus;
  stats?: unknown;
  statsLoading: boolean;
  statsError?: string;
  showHeader?: boolean;
  showContainerInsights?: boolean;
  onSelectView: (view: DockerOverviewTarget) => void;
  onSelectContainer: (name: string) => void;
}) {
  const colors = useAppTheme();
  const [summaryWidth, setSummaryWidth] = useState(0);
  const containers = data?.containers ?? emptyDockerContainers;
  const statRows = useMemo(
    () => showContainerInsights ? dockerStatRows(stats, containers) : [],
    [showContainerInsights, stats, containers],
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
  const summaryColumns = summaryWidth >= 700 ? 5 : summaryWidth >= 264 ? 2 : 1;
  const summaryItemWidth = summaryWidth
    ? Math.floor((summaryWidth - (summaryColumns - 1) * 8) / summaryColumns)
    : undefined;

  return <>
    {showHeader ? <SectionHeader icon={Gauge} title="Docker 总览" /> : null}
    <DockerLiveResourceCards
      info={data?.info ?? emptyDockerInfo}
      active={active}
      liveStatus={liveStatus}
    />

    <View>
      <View
        onLayout={(event) => {
          const nextWidth = Math.floor(event.nativeEvent.layout.width);
          if (nextWidth !== summaryWidth) setSummaryWidth(nextWidth);
        }}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        <DockerSummaryItem width={summaryItemWidth} icon={Workflow} color={colors.subtext} background={colors.mutedCard} value={count(data?.composeCount)} label="Compose" onPress={() => onSelectView("compose")} />
        <DockerSummaryItem width={summaryItemWidth} icon={Container} color={colors.primary} background={colors.primarySoft} valueColor={colors.success} value={statusValue(states.running)} suffix={data?.containerCount === undefined ? undefined : ` / ${data.containerCount}`} label="容器" onPress={() => onSelectView("containers")} />
        <DockerSummaryItem width={summaryItemWidth} icon={Image} color={imageAccent} background={imageBackground} value={count(data?.imageCount)} label="镜像列表" badge={data?.imageSize === undefined ? undefined : data.imageSize > 0 ? bytes(data.imageSize) : "0 B"} onPress={() => onSelectView("images")} />
        <DockerSummaryItem width={summaryItemWidth} icon={Database} color={colors.success} background={colors.successBg} value={count(data?.volumeCount)} label="数据卷" onPress={() => onSelectView("volumes")} />
        <DockerSummaryItem width={summaryItemWidth} icon={Network} color={colors.cyan} background={colors.cyanBg} value={count(data?.networkCount)} label="网络" onPress={() => onSelectView("networks")} />
      </View>
    </View>

    {showContainerInsights ? <>
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
    </> : null}
  </>;
}
