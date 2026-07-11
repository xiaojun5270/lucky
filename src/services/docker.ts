import { luckyFetch } from "@/src/lib/lucky-fetch";
import type { LuckyListItem, LuckyRecord } from "@/src/types/lucky";

type DockerMethod = "GET" | "POST" | "PUT" | "DELETE";

function isRecord(value: unknown): value is LuckyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function encodeQuery(params?: LuckyRecord) {
  if (!params) return "";
  const text = Object.entries(params)
    .filter(
      (entry) => entry[1] !== undefined && entry[1] !== null && entry[1] !== "",
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value))}`,
    )
    .join("&");
  return text ? `?${text}` : "";
}

function list(payload: LuckyRecord, keys: string[]): LuckyListItem[] {
  for (const source of [payload, payload.data, payload.result]) {
    if (Array.isArray(source))
      return source.filter(isRecord) as LuckyListItem[];
    if (!isRecord(source)) continue;
    for (const key of keys)
      if (Array.isArray(source[key]))
        return (source[key] as unknown[]).filter(isRecord) as LuckyListItem[];
  }
  return [];
}

export function callDockerApi(
  path: string,
  method: DockerMethod = "GET",
  data?: unknown,
  params?: LuckyRecord,
  timeoutMs?: number,
) {
  return luckyFetch(
    `/api/docker/${path.replace(/^\//, "")}${encodeQuery(params)}`,
    {
      method,
      body:
        data === undefined
          ? undefined
          : data instanceof FormData
            ? data
            : JSON.stringify(data),
      timeoutMs,
    },
  );
}

export async function listDockerContainers() {
  const raw = await callDockerApi("containers", "GET", undefined, {
    all: true,
    includeStats: false,
    includeNetworkMode: true,
  });
  return { items: list(raw, ["containers", "list"]), raw };
}
export const getDockerContainer = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}`);
export const createDockerContainer = (data: LuckyRecord) =>
  callDockerApi("containers", "POST", data);
export const editDockerContainer = (id: string, data: LuckyRecord) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/edit`, "POST", data);
export const removeDockerContainer = (
  id: string,
  force = false,
  removeVolumes = false,
) =>
  callDockerApi(`containers/${encodeURIComponent(id)}`, "DELETE", undefined, {
    force,
    remove_volumes: removeVolumes,
  });
export const renameDockerContainer = (id: string, name: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/rename`, "POST", {
    name,
  });
export const runDockerContainerAction = (
  id: string,
  action: "start" | "stop" | "restart" | "pause" | "unpause",
) =>
  callDockerApi(
    `containers/${encodeURIComponent(id)}/${action}`,
    "POST",
    action === "stop" || action === "restart" ? { timeout: 10 } : {},
  );
export const getDockerContainerLogs = (id: string, tail = 200) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/logs`, "GET", undefined, {
    tail,
    timestamps: true,
  });
export const getDockerContainerStats = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/stats-cached`);
export const getDockerContainerProcesses = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/processes`);

export async function listDockerImages() {
  const raw = await callDockerApi("images", "GET", undefined, { all: false });
  return { items: list(raw, ["images", "list"]), raw };
}
export const getDockerImage = (id: string) =>
  callDockerApi(`images/${encodeURIComponent(id)}`);
export const pullDockerImage = (data: LuckyRecord) =>
  callDockerApi("images/pull-async", "POST", data);
export const removeDockerImage = (reference: string, force = false) =>
  reference.includes("/") || reference.includes(":")
    ? callDockerApi("images/remove", "DELETE", undefined, {
        tag: reference,
        force,
        noprune: false,
      })
    : callDockerApi(
        `images/${encodeURIComponent(reference)}`,
        "DELETE",
        undefined,
        { force, noprune: false },
      );
export const tagDockerImage = (
  id: string,
  repository: string,
  tag = "latest",
) =>
  callDockerApi(`images/${encodeURIComponent(id)}/tag`, "POST", {
    repository,
    tag,
  });
export const searchDockerImages = (term: string) =>
  callDockerApi("images/search", "POST", { term, limit: 25 });
export const getDockerImageHistory = (id: string) =>
  callDockerApi(`images/${encodeURIComponent(id)}/history`);
export const buildDockerImage = (data: LuckyRecord) =>
  callDockerApi("images/build", "POST", data, undefined, 600000);

export async function listDockerComposeProjects() {
  const raw = await callDockerApi("compose/projects");
  return { items: list(raw, ["projects", "list", "composeProjects"]), raw };
}
export const runDockerComposeAction = (
  action: "up" | "down" | "start" | "stop" | "restart",
  data: LuckyRecord,
) =>
  callDockerApi(
    `compose/${action}`,
    "POST",
    data,
    undefined,
    action === "up" ? 300000 : 120000,
  );
export const getDockerComposeLogs = (name: string, data: LuckyRecord = {}) =>
  callDockerApi(`compose/${encodeURIComponent(name)}/logs`, "POST", data);
export const readDockerComposeConfig = (projectPath: string) =>
  callDockerApi("compose/config", "POST", { project_path: projectPath });
export const updateDockerComposeConfig = (
  projectPath: string,
  content: string,
) =>
  callDockerApi("compose/update-config", "POST", {
    project_path: projectPath,
    content,
  });
export const discoverDockerCompose = (scanPath: string) =>
  callDockerApi("compose/discover", "POST", { scan_path: scanPath });
export const backupDockerCompose = (projectPath: string, projectName: string) =>
  callDockerApi("compose/backup", "POST", {
    project_path: projectPath,
    project_name: projectName,
  });

export async function listDockerNetworks() {
  const raw = await callDockerApi("networks");
  return { items: list(raw, ["networks", "list"]), raw };
}
export const createDockerNetwork = (data: LuckyRecord) =>
  callDockerApi("networks", "POST", data);
export const removeDockerNetwork = (id: string) =>
  callDockerApi(`networks/${encodeURIComponent(id)}`, "DELETE");

export async function listDockerVolumes() {
  const raw = await callDockerApi("volumes");
  return { items: list(raw, ["volumes", "list"]), raw };
}
export const createDockerVolume = (data: LuckyRecord) =>
  callDockerApi("volumes", "POST", data);
export const removeDockerVolume = (name: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}`, "DELETE");
export const backupDockerVolume = (name: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}/backup`, "POST");
export const listDockerVolumeBackups = (name: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}/backups`);
export const restoreDockerVolumeBackup = (name: string, backup: string) =>
  callDockerApi(
    `volumes/${encodeURIComponent(name)}/backups/restore`,
    "POST",
    { backup },
    undefined,
    600000,
  );

export async function listDockerTasks() {
  const raw = await callDockerApi("tasks");
  return { items: list(raw, ["tasks", "list"]), raw };
}
export const getDockerTask = (id: string) =>
  callDockerApi(`tasks/${encodeURIComponent(id)}`);
export const removeDockerTask = (id: string) =>
  callDockerApi(`tasks/${encodeURIComponent(id)}`, "DELETE");
export const clearDockerTasks = () => callDockerApi("tasks", "DELETE");

export const getDockerInfo = () => callDockerApi("info");
export const getDockerVersion = () => callDockerApi("version");
export const getDockerDiskUsage = () => callDockerApi("disk-usage");
export const getDockerMonitorStatus = () => callDockerApi("monitor/status");
export const getDockerConfig = () => callDockerApi("config");
export const updateDockerConfig = (data: LuckyRecord) =>
  callDockerApi("config", "POST", data);
export const getDockerLogs = (pageSize = 200, page = 1) =>
  callDockerApi("logs", "GET", undefined, { pageSize, page });
export const pruneDocker = (data: LuckyRecord) =>
  callDockerApi("prune", "POST", data);
export const getDockerRegistryMirrors = () => callDockerApi("registry/mirrors");
export const addDockerRegistryMirror = (mirror: string) =>
  callDockerApi("registry/mirrors", "POST", { mirror });
export const removeDockerRegistryMirror = (mirror: string) =>
  callDockerApi("registry/mirrors", "DELETE", { mirror });
