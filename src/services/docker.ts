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

function findScalar(payload: unknown, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [payload];
  const visited = new Set<object>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase()) && ["string", "number", "boolean"].includes(typeof value))
        return value as string | number | boolean;
    }
    queue.push(...Object.values(current));
  }
  return undefined;
}

function findRecord(payload: LuckyRecord, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const queue: LuckyRecord[] = [payload];
  const visited = new Set<object>();
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const [key, value] of Object.entries(current)) {
      if (wanted.has(key.toLowerCase()) && isRecord(value)) return value;
    }
    for (const value of Object.values(current)) {
      if (isRecord(value)) queue.push(value);
    }
  }
  return payload;
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
export const getAllDockerContainerStats = () => callDockerApi("containers/stats-cached");
export const commitDockerContainer = (id: string, data: LuckyRecord) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/commit`, "POST", data);
export const copyDockerContainer = (id: string, name: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/copy`, "POST", { name });
export const checkDockerContainerUpgrade = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/upgrade-check`, "GET", undefined, undefined, 60000);
export const upgradeDockerContainer = (id: string, data: LuckyRecord) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/upgrade`, "POST", data, undefined, 300000);
export const getDockerContainerComposeConfig = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/compose-config`);
export const setDockerContainerLabel = (id: string, label: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/label`, "POST", { label });
export const removeDockerContainerLabel = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/label`, "DELETE");
export const getDockerLabels = () => callDockerApi("labels");
export const getDockerLabelContainers = (label: string) =>
  callDockerApi(`labels/${encodeURIComponent(label)}/containers`);
export const getDockerContainerGroups = () => callDockerApi("container-groups");
export const createDockerContainerGroup = (data: LuckyRecord) =>
  callDockerApi("container-groups", "POST", data);
export const updateDockerContainerGroup = (data: LuckyRecord) =>
  callDockerApi("container-groups", "PUT", data);
export const removeDockerContainerGroup = (key: string) =>
  callDockerApi("container-groups", "DELETE", undefined, { key });
export const getDockerContainerGroupCount = (groupKey: string) =>
  callDockerApi("container-groups/count", "GET", undefined, { groupKey });
export const reorderDockerContainerGroups = (data: unknown) =>
  callDockerApi("container-groups/order", "PUT", data);
export const setDockerContainerGroupCollapsed = (key: string, collapsed: boolean) =>
  callDockerApi("container-groups/collapsed", "PUT", { key, collapsed });
export const getDockerContainerGroupCollapsedStates = () =>
  callDockerApi("container-groups/collapsed/states");
export const getDockerContainerOrderMapping = () => callDockerApi("containers/order-mapping");
export const updateDockerContainerOrderMapping = (containerGroupMap: unknown, orderList: unknown) =>
  callDockerApi("containers/order-mapping", "PUT", { containerGroupMap, orderList });
export const setDockerContainerGroup = (containerName: string, groupKey: string) =>
  callDockerApi("containers/set-group", "POST", { containerName, groupKey });
export const switchDockerContainerVersion = (containerIds: unknown, targetImageRef: string) =>
  callDockerApi("containers/switch-version", "POST", { container_ids: containerIds, target_image_ref: targetImageRef }, undefined, 300000);

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
export const pullDockerImageSync = (image: string, tag = "latest") =>
  callDockerApi("images/pull", "POST", { image, tag }, undefined, 600000);
export const pushDockerImage = (image: string, tag = "latest") =>
  callDockerApi("images/push", "POST", { image, tag });
export const buildDockerImageFromGit = (data: LuckyRecord) =>
  callDockerApi("images/build-from-git", "POST", data);
export const buildDockerImageFromZip = (data: LuckyRecord) =>
  callDockerApi("images/build-from-zip", "POST", data);
export const importDockerImage = (data: LuckyRecord) => callDockerApi("images/import", "POST", data);
export const loadDockerImage = (data: LuckyRecord | FormData) =>
  callDockerApi("images/load", "POST", data, undefined, 300000);
export const getDockerImageTags = (id: string) =>
  callDockerApi(`images/${encodeURIComponent(id)}/tags`);
export const getDockerImageFilesystem = (id: string, path = "/") =>
  callDockerApi(`images/${encodeURIComponent(id)}/filesystem`, "GET", undefined, { path });
export const checkDockerImageUpgrade = (imageRef: string) =>
  callDockerApi("images/upgrade-check", "POST", { image_ref: imageRef }, undefined, 120000);
export const getDockerImageUpgradeStatus = (imageRef = "") =>
  callDockerApi("images/upgrade-status", "GET", undefined, imageRef ? { image_ref: imageRef } : undefined);
export const dismissDockerImageUpgrade = (imageRef: string, imageId = "") =>
  callDockerApi("images/upgrade-dismiss", "POST", { image_ref: imageRef, image_id: imageId });
export const clearDockerImageUpgradeStatus = () => callDockerApi("images/upgrade-status", "DELETE");
export const removeDockerSavedDigest = (imageId: string) =>
  callDockerApi("images/remove-saved-digest", "POST", { image_id: imageId });
export const backupDockerImageTag = (imageRef: string) =>
  callDockerApi("images/backup-tag", "POST", { image_ref: imageRef });
export const getDockerImageContainers = (imageRef: string) =>
  callDockerApi("images/containers", "GET", undefined, { image_ref: imageRef });
export const pullDockerImageWithBackup = (imageRef: string, backupTag = true, architecture = "") =>
  callDockerApi("images/pull-with-backup", "POST", { image_ref: imageRef, backup_tag: backupTag, architecture }, undefined, 600000);
export const upgradeDockerImageContainers = (imageRef: string, upgradeCompose = true, upgradeStandalone = true, containerIds: unknown = null) =>
  callDockerApi("images/upgrade-containers", "POST", { image_ref: imageRef, upgrade_compose: upgradeCompose, upgrade_standalone: upgradeStandalone, container_ids: containerIds }, undefined, 300000);

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
export const listDockerComposeBackups = (projectName: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups`);
export const removeDockerComposeBackup = (projectName: string, backup: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups`, "DELETE", { backup });
export const clearDockerComposeBackups = (projectName: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups/all`, "DELETE");
export const restoreDockerComposeBackup = (projectName: string, backup: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups/restore`, "POST", { backup }, undefined, 600000);
export const cancelDockerComposeBackup = (projectName: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backup/cancel`, "DELETE");
export const getDockerComposeBackupStatus = () => callDockerApi("compose/backup/status");
export const getDockerComposeContainers = (projectName: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/ps`);
export const getDockerComposeContainersForCron = () => callDockerApi("compose/containers-for-cron");
export const readDockerComposeDockerfile = (projectPath: string) =>
  callDockerApi("compose/dockerfile", "POST", { project_path: projectPath });
export const updateDockerComposeDockerfile = (projectPath: string, content: string) =>
  callDockerApi("compose/update-dockerfile", "POST", { project_path: projectPath, content });

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
export const removeDockerVolumeBackup = (name: string, backup: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}/backups`, "DELETE", { backup });
export const cancelDockerVolumeBackup = (name: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}/backup/cancel`, "DELETE");
export const getDockerVolumeBackupStatus = () => callDockerApi("volumes/backup/status");

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
export const getDockerSelfContainerInfo = () => callDockerApi("self-container");

export async function getDockerOverview() {
  const [infoRaw, versionRaw, diskRaw, monitorRaw, containers, images] = await Promise.all([
    getDockerInfo(),
    getDockerVersion(),
    getDockerDiskUsage(),
    getDockerMonitorStatus(),
    listDockerContainers().then((result) => result.items).catch(() => undefined),
    listDockerImages().then((result) => result.items).catch(() => undefined),
  ]);
  const fallbackContainers = findScalar(infoRaw, ["Containers", "containers"])
    ?? findScalar(diskRaw, ["Containers", "containers"]);
  const fallbackImages = findScalar(infoRaw, ["Images", "images"]);
  return {
    info: findRecord(infoRaw, ["info", "dockerInfo", "data", "result"]),
    version: findScalar(versionRaw, ["Version", "ServerVersion", "version", "ApiVersion"]),
    disk: findRecord(diskRaw, ["disk_usage", "diskUsage", "usage", "data", "result"]),
    monitor: findScalar(monitorRaw, ["Status", "State", "Running", "Enable", "status", "state"]),
    containerCount: containers?.length ?? Number(fallbackContainers ?? 0),
    imageCount: images?.length ?? Number(fallbackImages ?? 0),
  };
}

export async function getDockerMaintenanceStatus() {
  const requests = {
    selfContainer: getDockerSelfContainerInfo(),
    labels: getDockerLabels(),
    containerGroups: getDockerContainerGroups(),
    collapsedStates: getDockerContainerGroupCollapsedStates(),
    orderMapping: getDockerContainerOrderMapping(),
    cachedStats: getAllDockerContainerStats(),
    imageUpgrades: getDockerImageUpgradeStatus(),
    composeBackup: getDockerComposeBackupStatus(),
    volumeBackup: getDockerVolumeBackupStatus(),
    cronContainers: getDockerComposeContainersForCron(),
  };
  const entries = Object.entries(requests);
  const results = await Promise.allSettled(entries.map(([, request]) => request));
  return Object.fromEntries(results.map((result, index) => [
    entries[index][0],
    result.status === "fulfilled"
      ? result.value
      : { error: result.reason instanceof Error ? result.reason.message : "接口请求失败" },
  ])) as Record<string, LuckyRecord>;
}
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
