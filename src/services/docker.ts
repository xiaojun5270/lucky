import { luckyFetch } from "@/src/lib/lucky-fetch";
import type { LuckyListItem, LuckyRecord } from "@/src/types/lucky";

type DockerMethod = "GET" | "POST" | "PUT" | "DELETE";
type DockerSignalInput = AbortSignal | { signal?: AbortSignal };

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

function findArray(payload: LuckyRecord, keys: string[]) {
  const wrappers = new Set(["data", "result", "response", "payload"]);
  for (const wantedKey of keys) {
    const wanted = wantedKey.toLowerCase();
    const queue: unknown[] = [payload];
    const visited = new Set<object>();
    while (queue.length) {
      const source = queue.shift();
      if (Array.isArray(source)) return source;
      if (!isRecord(source) || visited.has(source)) continue;
      visited.add(source);
      for (const [key, value] of Object.entries(source)) {
        if (key.toLowerCase() === wanted && Array.isArray(value)) return value;
      }
      for (const [key, value] of Object.entries(source)) {
        if (isRecord(value)) queue.push(value);
        else if (Array.isArray(value) && wrappers.has(key.toLowerCase())) queue.push(value);
      }
    }
  }
  return undefined;
}

function list(payload: LuckyRecord, keys: string[]): LuckyListItem[] {
  return (findArray(payload, keys) ?? []).filter(isRecord) as LuckyListItem[];
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
  signal?: AbortSignal,
  responseType: "auto" | "json" | "text" | "blob" = "auto",
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
      signal,
      responseType,
    },
  );
}

function resolveDockerSignal(input?: DockerSignalInput) {
  return isAbortSignal(input) ? input : input?.signal;
}

export async function listDockerContainers(input?: DockerSignalInput) {
  const signal = resolveDockerSignal(input);
  const raw = await callDockerApi("containers", "GET", undefined, {
    all: true,
    includeStats: false,
    includeNetworkMode: true,
  }, undefined, signal);
  return { items: list(raw, ["containers", "list"]), raw };
}
export const getDockerContainer = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}`);
export const createDockerContainer = (data: LuckyRecord) =>
  callDockerApi("containers", "POST", data);
export const editDockerContainer = (id: string, data: LuckyRecord) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/edit`, "POST", data, undefined, 300000);
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
    action === "stop" || action === "restart" ? { timeout: 10 } : undefined,
  );
export const getDockerContainerLogs = (id: string, tail = 200) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/logs`, "GET", undefined, {
    tail,
    timestamps: true,
  });
export const getDockerContainerStats = (id: string, input?: DockerSignalInput) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/stats-cached`, "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerContainerLiveStats = (id: string, input?: DockerSignalInput) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/stats`, "GET", undefined, undefined, 10000, resolveDockerSignal(input));
export const getDockerContainerProcesses = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/processes`);
export const getAllDockerContainerStats = (input?: DockerSignalInput) =>
  callDockerApi("containers/stats-cached", "GET", undefined, undefined, 15000, resolveDockerSignal(input));

export type DockerContainerFileOperation =
  | "list"
  | "read"
  | "write"
  | "delete"
  | "mkdir"
  | "touch"
  | "rename"
  | "copy"
  | "chmod"
  | "search"
  | "compress"
  | "compress-async"
  | "decompress"
  | "decompress-async"
  | "preview-archive";

const dockerContainerFileMethods: Record<DockerContainerFileOperation, DockerMethod> = {
  list: "GET",
  read: "GET",
  write: "POST",
  delete: "DELETE",
  mkdir: "POST",
  touch: "POST",
  rename: "POST",
  copy: "POST",
  chmod: "POST",
  search: "POST",
  compress: "POST",
  "compress-async": "POST",
  decompress: "POST",
  "decompress-async": "POST",
  "preview-archive": "GET",
};

export function runDockerContainerFileOperation(
  id: string,
  operation: string,
  data: LuckyRecord,
) {
  if (!Object.prototype.hasOwnProperty.call(dockerContainerFileMethods, operation)) {
    throw new Error(`不支持的容器文件操作：${operation || "空"}`);
  }
  const typedOperation = operation as DockerContainerFileOperation;
  const method = dockerContainerFileMethods[typedOperation];
  const path = typedOperation === "delete"
    ? `containers/${encodeURIComponent(id)}/files`
    : `containers/${encodeURIComponent(id)}/files/${typedOperation}`;
  const readOnly = method === "GET";
  const longRunning = typedOperation.includes("compress") || typedOperation.includes("decompress");
  return callDockerApi(
    path,
    method,
    readOnly ? undefined : data,
    readOnly ? data : undefined,
    longRunning ? 600000 : undefined,
  );
}

export const uploadDockerContainerFile = (id: string, data: FormData) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/files/upload`, "POST", data, undefined, 600000);
export const downloadDockerContainerFile = (id: string, path: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/files/download`, "GET", undefined, { path }, 600000, undefined, "blob");
export const exportDockerContainer = (id: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/export`, "POST", undefined, undefined, 600000, undefined, "blob");

function containerText(item: LuckyRecord, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) return value.map(String).join(", ");
  }
  return "";
}

type DockerContainerInput = LuckyListItem[] | { items?: LuckyListItem[]; signal?: AbortSignal } | AbortSignal;

function isAbortSignal(value: unknown): value is AbortSignal {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as AbortSignal).aborted === "boolean"
    && typeof (value as AbortSignal).addEventListener === "function";
}

function resolveDockerContainerInput(input: DockerContainerInput | undefined) {
  if (Array.isArray(input)) return { items: input, signal: undefined as AbortSignal | undefined };
  if (isAbortSignal(input)) return { items: undefined, signal: input };
  return { items: input?.items, signal: input?.signal };
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Request cancelled");
  error.name = "AbortError";
  throw error;
}

export async function refreshDockerContainerStats(
  onProgress?: (payload: LuckyRecord) => void,
  containerInput?: DockerContainerInput,
  signal?: AbortSignal,
) {
  const resolved = resolveDockerContainerInput(containerInput);
  const requestSignal = signal ?? resolved.signal;
  throwIfAborted(requestSignal);
  const items = resolved.items ?? (await listDockerContainers(requestSignal)).items;
  throwIfAborted(requestSignal);
  const targets = items.map((item) => {
    const id = containerText(item, ["Id", "ID", "id", "ContainerID", "ContainerId"]);
    const name = containerText(item, ["Names", "Name", "name", "ContainerName"]).replace(/^\/+/, "");
    const runningValue = item.Running ?? item.running;
    const normalizedRunning = typeof runningValue === "string"
      ? runningValue.trim().toLowerCase()
      : runningValue;
    const state = [item.State, item.state, item.Status, item.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return {
      id,
      name,
      running: normalizedRunning === true || normalizedRunning === 1
        || normalizedRunning === "true" || normalizedRunning === "1"
        || /running|active|\bup\b|paused|restarting/.test(state),
    };
  }).filter((item) => item.id && item.running);

  const stats: LuckyRecord[] = [];
  for (let index = 0; index < targets.length; index += 6) {
    throwIfAborted(requestSignal);
    const batch = targets.slice(index, index + 6);
    const results = await Promise.all(batch.map(async (target) => {
      try {
        const result = await getDockerContainerLiveStats(target.id, requestSignal);
        return { Id: target.id, Name: target.name, stats: result } as LuckyRecord;
      } catch (error) {
        if (requestSignal?.aborted) throw error;
        return undefined;
      }
    }));
    stats.push(...results.filter((item): item is LuckyRecord => Boolean(item)));
    onProgress?.({ ret: 0, stats: [...stats], sampled: stats.length, total: targets.length });
  }
  const payload = { ret: 0, stats, sampled: stats.length, total: targets.length } as LuckyRecord;
  if (!targets.length) onProgress?.(payload);
  return payload;
}
export const commitDockerContainer = (id: string, data: LuckyRecord) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/commit`, "POST", data, undefined, 300000);
export const copyDockerContainer = (id: string, name: string) =>
  callDockerApi(`containers/${encodeURIComponent(id)}/copy`, "POST", { name }, undefined, 300000);
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
export const getDockerLabels = (input?: DockerSignalInput) =>
  callDockerApi("labels", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerLabelContainers = (label: string) =>
  callDockerApi(`labels/${encodeURIComponent(label)}/containers`);
export const getDockerContainerGroups = (input?: DockerSignalInput) =>
  callDockerApi("container-groups", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
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
export const getDockerContainerGroupCollapsedStates = (input?: DockerSignalInput) =>
  callDockerApi("container-groups/collapsed/states", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerContainerOrderMapping = (input?: DockerSignalInput) =>
  callDockerApi("containers/order-mapping", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const updateDockerContainerOrderMapping = (containerGroupMap: unknown, orderList: unknown) =>
  callDockerApi("containers/order-mapping", "PUT", { containerGroupMap, orderList });
export const setDockerContainerGroup = (containerName: string, groupKey: string) =>
  callDockerApi("containers/set-group", "POST", { containerName, groupKey });
export const switchDockerContainerVersion = (containerIds: unknown, targetImageRef: string) =>
  callDockerApi("containers/switch-version", "POST", { container_ids: containerIds, target_image_ref: targetImageRef }, undefined, 300000);

export async function listDockerImages(input?: DockerSignalInput) {
  const raw = await callDockerApi("images", "GET", undefined, { all: false }, undefined, resolveDockerSignal(input));
  return { items: list(raw, ["images", "list"]), raw };
}
export const getDockerImage = (id: string) =>
  callDockerApi(`images/${encodeURIComponent(id)}`);
export const pullDockerImage = (data: LuckyRecord) =>
  callDockerApi("images/pull-async", "POST", data);
export const removeDockerImage = (reference: string, force = false) => {
  const isImageId = /^(?:sha256:)?[a-f\d]{12,}$/i.test(reference);
  return !isImageId && (reference.includes("/") || reference.includes(":"))
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
};
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
  callDockerApi("images/push", "POST", { image, tag }, undefined, 600000);
export const buildDockerImageFromGit = (data: LuckyRecord) =>
  callDockerApi("images/build-from-git", "POST", data, undefined, 600000);
export const buildDockerImageFromZip = (data: LuckyRecord | FormData) =>
  callDockerApi("images/build-from-zip", "POST", data, undefined, 600000);
export const importDockerImage = (data: LuckyRecord) =>
  callDockerApi("images/import", "POST", data, undefined, 300000);
export const loadDockerImage = (data: LuckyRecord | FormData) =>
  callDockerApi("images/load", "POST", data, undefined, 300000);
export const getDockerImageTags = (id: string) =>
  callDockerApi(`images/${encodeURIComponent(id)}/tags`);
export const getDockerImageFilesystem = (id: string, path = "/") =>
  callDockerApi(`images/${encodeURIComponent(id)}/filesystem`, "GET", undefined, { path });
export const checkDockerImageUpgrade = (imageRef: string, signal?: AbortSignal) =>
  callDockerApi("images/upgrade-check", "POST", { image_ref: imageRef }, undefined, 45000, signal);

type DockerBatchProgress<T> = {
  succeeded: T[];
  failed: { item: T; error: string }[];
  completedCount: number;
  totalCount: number;
};

async function runDockerBatch<T>(
  items: T[],
  task: (item: T) => Promise<unknown>,
  options: {
    concurrency?: number;
    onProgress?: (progress: DockerBatchProgress<T>) => void;
    isCancelled?: () => boolean;
  } = {},
) {
  const { concurrency = 4, onProgress, isCancelled } = options;
  const succeeded: T[] = [];
  const failed: { item: T; error: string }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      if (isCancelled?.()) return;
      const item = items[cursor++];
      try {
        await task(item);
        succeeded.push(item);
      } catch (error) {
        failed.push({ item, error: error instanceof Error ? error.message : "请求失败" });
      } finally {
        onProgress?.({
          succeeded: [...succeeded],
          failed: [...failed],
          completedCount: succeeded.length + failed.length,
          totalCount: items.length,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { succeeded, failed, cancelled: cursor < items.length };
}

export async function removeDockerImages(references: string[], onProgress?: (progress: LuckyRecord) => void) {
  const items = [...new Set(references.map((item) => item.trim()).filter(Boolean))];
  const result = await runDockerBatch(items, (reference) => removeDockerImage(reference, false), {
    onProgress: (progress) => onProgress?.({
      completedCount: progress.completedCount,
      totalCount: progress.totalCount,
      removedCount: progress.succeeded.length,
      failedCount: progress.failed.length,
    }),
  });
  return {
    ret: 0,
    removed: result.succeeded,
    failed: result.failed,
    removedCount: result.succeeded.length,
    failedCount: result.failed.length,
    completedCount: result.succeeded.length + result.failed.length,
    totalCount: items.length,
  } as LuckyRecord;
}

export async function checkDockerImagesUpgrade(
  imageRefs: string[],
  onProgress?: (progress: LuckyRecord) => void,
  signal?: AbortSignal,
) {
  const items = [...new Set(imageRefs.map((item) => item.trim()).filter(Boolean))];
  const results: LuckyRecord[] = [];
  const result = await runDockerBatch(items, async (imageRef) => {
    const response = await checkDockerImageUpgrade(imageRef, signal);
    results.push({ imageRef, result: response });
  }, {
    concurrency: 4,
    isCancelled: () => Boolean(signal?.aborted),
    onProgress: (progress) => onProgress?.({
      ret: 0,
      checked: [...results],
      failed: progress.failed,
      checkedCount: progress.succeeded.length,
      failedCount: progress.failed.length,
      completedCount: progress.completedCount,
      totalCount: progress.totalCount,
      inProgress: progress.completedCount < progress.totalCount,
    }),
  });
  if (!result.succeeded.length && result.failed.length) {
    throw new Error(result.failed[0].error);
  }
  return {
    ret: 0,
    checked: results,
    failed: result.failed,
    checkedCount: result.succeeded.length,
    failedCount: result.failed.length,
    completedCount: result.succeeded.length + result.failed.length,
    totalCount: items.length,
    inProgress: false,
  } as LuckyRecord;
}

export const getDockerImageUpgradeStatus = (imageRef = "", signal?: AbortSignal) =>
  callDockerApi("images/upgrade-status", "GET", undefined, imageRef ? { image_ref: imageRef } : undefined, undefined, signal);
export const dismissDockerImageUpgrade = (imageRef: string, imageId = "") =>
  callDockerApi("images/upgrade-dismiss", "POST", { image_ref: imageRef, image_id: imageId });
export const clearDockerImageUpgradeStatus = () => callDockerApi("images/upgrade-status", "DELETE");
export const removeDockerSavedDigest = (imageId: string) =>
  callDockerApi("images/remove-saved-digest", "POST", { image_id: imageId });
export const backupDockerImageTag = (imageRef: string) =>
  callDockerApi("images/backup-tag", "POST", { image_ref: imageRef });
export const getDockerImageContainers = (imageRef: string, signal?: AbortSignal) =>
  callDockerApi("images/containers", "GET", undefined, { image_ref: imageRef }, undefined, signal);

const dockerImageIdKeys = [
  "ImageID",
  "ImageId",
  "imageID",
  "imageId",
  "image_id",
  "Digest",
  "digest",
] as const;
const dockerImageReferenceKeys = [
  "Image",
  "image",
  "ImageName",
  "imageName",
  "image_ref",
  "imageRef",
  "RepoTag",
  "repoTag",
  "RepoTags",
  "repoTags",
  "RepoDigest",
  "repoDigest",
  "RepoDigests",
  "repoDigests",
  "Tags",
  "tags",
  "Name",
  "name",
] as const;
const dockerImageRecordIdKeys = ["Id", "ID", "id", ...dockerImageIdKeys] as const;
const dockerContainerImageReferenceKeys = dockerImageReferenceKeys.filter((key) =>
  !["Name", "name"].includes(key),
);

function stringValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => stringValues(item));
  return [];
}

/** Reads image fields from the Docker list shape and Lucky's nested variants. */
function collectDockerImageValues(item: LuckyRecord, keys: readonly string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const values: unknown[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value: item, depth: 0 }];
  const visited = new Set<object>();
  while (queue.length) {
    const current = queue.shift()!;
    if (!current.value || typeof current.value !== "object") continue;
    if (visited.has(current.value)) continue;
    visited.add(current.value);
    if (Array.isArray(current.value)) {
      if (current.depth < 3) {
        for (const value of current.value) queue.push({ value, depth: current.depth + 1 });
      }
      continue;
    }
    const record = current.value as LuckyRecord;
    for (const [key, value] of Object.entries(record)) {
      if (wanted.has(key.toLowerCase())) values.push(value);
      if (current.depth < 2 && value && typeof value === "object") {
        queue.push({ value, depth: current.depth + 1 });
      }
    }
  }
  return values.flatMap(stringValues);
}

function imageIdAliases(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, "");
  return /^[a-f\d]{12,64}$/i.test(normalized)
    ? new Set([`id:${normalized}`, `id:sha256:${normalized}`])
    : new Set<string>();
}

function canonicalDockerImageReference(value: string) {
  let reference = value.trim().replace(/^\/+/, "").toLowerCase();
  if (!reference) return "";
  const parts = reference.split("/");
  const first = parts[0];
  const hasRegistry = parts.length > 1
    && (first.includes(".") || first.includes(":") || first === "localhost");
  if (!hasRegistry) {
    reference = parts.length === 1
      ? `docker.io/library/${reference}`
      : `docker.io/${reference}`;
  }
  return reference;
}

function dockerImageAliases(value: string) {
  const raw = value.trim().replace(/^\/+/, "").toLowerCase();
  const aliases = new Set<string>();
  if (!raw) return aliases;

  for (const alias of imageIdAliases(raw)) aliases.add(alias);
  const digestMatch = raw.match(/(?:^|@)(sha256:[a-f\d]{12,64})$/i);
  if (digestMatch) {
    for (const alias of imageIdAliases(digestMatch[1])) aliases.add(alias);
  }

  const reference = canonicalDockerImageReference(raw);
  if (!reference) return aliases;
  aliases.add(`ref:${raw}`);
  aliases.add(`ref:${reference}`);
  const last = reference.slice(reference.lastIndexOf("/") + 1);
  if (!last.includes(":") && !last.includes("@")) aliases.add(`ref:${reference}:latest`);
  return aliases;
}

function dockerImageAliasesIntersect(left: Set<string>, right: Set<string>) {
  for (const alias of left) if (right.has(alias)) return true;
  const leftIds = [...left]
    .filter((alias) => alias.startsWith("id:"))
    .map((alias) => alias.slice(3).replace(/^sha256:/, ""));
  const rightIds = [...right]
    .filter((alias) => alias.startsWith("id:"))
    .map((alias) => alias.slice(3).replace(/^sha256:/, ""));
  return leftIds.some((leftId) => rightIds.some((rightId) =>
    leftId.length >= 12
      && rightId.length >= 12
      && (leftId.startsWith(rightId) || rightId.startsWith(leftId))));
}

function collectDockerImageAliases(item: LuckyRecord, imageRecord = false) {
  const idValues = collectDockerImageValues(item, imageRecord ? dockerImageRecordIdKeys : dockerImageIdKeys);
  const referenceValues = collectDockerImageValues(
    item,
    imageRecord ? dockerImageReferenceKeys : dockerContainerImageReferenceKeys,
  );
  const aliases = new Set<string>();
  const idAliases = new Set<string>();
  for (const value of idValues) {
    for (const alias of dockerImageAliases(value)) {
      aliases.add(alias);
      if (alias.startsWith("id:")) idAliases.add(alias);
    }
  }
  for (const value of referenceValues) {
    for (const alias of dockerImageAliases(value)) aliases.add(alias);
  }
  return {
    aliases,
    hasIdentity: aliases.size > 0,
    hasImageId: idAliases.size > 0,
  };
}

function unusedImageScanResult(
  unused: string[],
  used: string[],
  failed: Array<{ item: string; error: string }>,
  totalCount: number,
) {
  return {
    ret: 0,
    unused,
    used,
    failed,
    unusedCount: unused.length,
    usedCount: used.length,
    failedCount: failed.length,
    completedCount: unused.length + used.length + failed.length,
    totalCount,
  } as LuckyRecord;
}

export async function scanUnusedDockerImages(
  imageIds: string[],
  onProgress?: (progress: LuckyRecord) => void,
  signal?: AbortSignal,
) {
  const items = [...new Set(imageIds.map((item) => item.trim()).filter(Boolean))];
  const unused: string[] = [];
  const used: string[] = [];
  const failed: Array<{ item: string; error: string }> = [];
  const report = () => onProgress?.(unusedImageScanResult(unused, used, failed, items.length));
  const failAll = (error: string) => {
    for (const item of items) failed.push({ item, error });
    report();
    return unusedImageScanResult(unused, used, failed, items.length);
  };

  if (!items.length) {
    report();
    return unusedImageScanResult(unused, used, failed, 0);
  }

  let containerResult: Awaited<ReturnType<typeof listDockerContainers>>;
  try {
    throwIfAborted(signal);
    containerResult = await listDockerContainers(signal);
    throwIfAborted(signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return failAll(error instanceof Error && error.message ? error.message : "Unable to read Docker containers");
  }

  const containerArray = findArray(containerResult.raw, ["containers", "list"]);
  if (!containerArray) return failAll("Unable to determine image usage safely");
  const containerRows = containerArray.filter(isRecord) as LuckyListItem[];
  const hasUnknownContainerRows = containerRows.length !== containerArray.length;
  const usageRows = containerRows.map((item) => collectDockerImageAliases(item));
  const hasUnidentifiedContainer = usageRows.some((row) => !row.hasIdentity);
  const hasReferenceOnlyContainer = usageRows.some((row) => row.hasIdentity && !row.hasImageId);
  const hasImageIdCandidate = items.some((item) =>
    [...dockerImageAliases(item)].some((alias) => alias.startsWith("id:")));

  type ImageIndex = Array<{ aliases: Set<string> }>;
  let imageIndex: ImageIndex | undefined;
  let imageIndexError = "Unable to map image IDs to container references";
  if (hasReferenceOnlyContainer && hasImageIdCandidate) {
    try {
      const imageResult = await listDockerImages(signal);
      const imageArray = findArray(imageResult.raw, ["images", "list"]);
      if (imageArray && imageArray.every(isRecord)) {
        imageIndex = (imageArray as LuckyListItem[]).map((item) => ({
          aliases: collectDockerImageAliases(item, true).aliases,
        }));
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      imageIndexError = error instanceof Error && error.message ? error.message : imageIndexError;
    }
  }

  for (const imageId of items) {
    throwIfAborted(signal);
    const aliases = dockerImageAliases(imageId);
    const matchingImage = imageIndex?.find((image) => dockerImageAliasesIntersect(aliases, image.aliases));
    if (matchingImage) {
      for (const alias of matchingImage.aliases) aliases.add(alias);
    }
    const isUsed = usageRows.some((row) => dockerImageAliasesIntersect(aliases, row.aliases));
    if (isUsed) {
      used.push(imageId);
    } else if (hasUnknownContainerRows || hasUnidentifiedContainer) {
      failed.push({ item: imageId, error: "Unable to determine image usage safely" });
    } else if (hasReferenceOnlyContainer && hasImageIdCandidate && (
      !imageIndex || !matchingImage
    )) {
      failed.push({ item: imageId, error: imageIndexError });
    } else {
      unused.push(imageId);
    }
    report();
  }
  return unusedImageScanResult(unused, used, failed, items.length);
}

export const pullDockerImageWithBackup = (imageRef: string, backupTag = true, architecture = "") =>
  callDockerApi("images/pull-with-backup", "POST", { image_ref: imageRef, backup_tag: backupTag, architecture }, undefined, 600000);
export const upgradeDockerImageContainers = (imageRef: string, upgradeCompose = true, upgradeStandalone = true, containerIds: unknown = null) =>
  callDockerApi("images/upgrade-containers", "POST", { image_ref: imageRef, upgrade_compose: upgradeCompose, upgrade_standalone: upgradeStandalone, container_ids: containerIds }, undefined, 300000);

export async function listDockerComposeProjects(input?: DockerSignalInput) {
  const raw = await callDockerApi("compose/projects", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
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
export const readDockerComposeFile = (workingDirectory: string, filename: string) =>
  callDockerApi("compose/read-file", "POST", { working_dir: workingDirectory, filename });
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
  }, undefined, 600000);
export const listDockerComposeBackups = (projectName: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups`);
export const uploadDockerComposeBackup = (projectName: string, data: FormData) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups/upload`, "POST", data, undefined, 600000);
export const downloadDockerComposeBackup = (projectName: string, backup: string) =>
  callDockerApi(
    `compose/${encodeURIComponent(projectName)}/backups/download.tar.gz`,
    "GET",
    undefined,
    { backup },
    600000,
    undefined,
    "blob",
  );
export const removeDockerComposeBackup = (projectName: string, backup: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups`, "DELETE", { backup });
export const clearDockerComposeBackups = (projectName: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups/all`, "DELETE");
export const restoreDockerComposeBackup = (projectName: string, backup: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backups/restore`, "POST", { backup }, undefined, 600000);
export const restoreDockerCompose = (data: FormData) =>
  callDockerApi("compose/restore", "POST", data, undefined, 600000);
export const cancelDockerComposeBackup = (projectName: string) =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/backup/cancel`, "DELETE");
export const getDockerComposeBackupStatus = (input?: DockerSignalInput) =>
  callDockerApi("compose/backup/status", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerComposeContainers = (projectName: string, projectPath = "") =>
  callDockerApi(`compose/${encodeURIComponent(projectName)}/ps`, "GET", undefined, { path: projectPath || undefined });
export const getDockerComposeContainersForCron = () => callDockerApi("compose/containers-for-cron");
export const readDockerComposeDockerfile = (projectPath: string) =>
  callDockerApi("compose/dockerfile", "POST", { project_path: projectPath });
export const updateDockerComposeDockerfile = (projectPath: string, content: string) =>
  callDockerApi("compose/update-dockerfile", "POST", { project_path: projectPath, content });

export async function listDockerNetworks(input?: DockerSignalInput) {
  const raw = await callDockerApi("networks", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
  return { items: list(raw, ["networks", "list"]), raw };
}
export const createDockerNetwork = (data: LuckyRecord) =>
  callDockerApi("networks", "POST", data);
export const removeDockerNetwork = (id: string) =>
  callDockerApi(`networks/${encodeURIComponent(id)}`, "DELETE");

export async function listDockerVolumes(input?: DockerSignalInput) {
  const raw = await callDockerApi("volumes", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
  return { items: list(raw, ["volumes", "list"]), raw };
}
export const createDockerVolume = (data: LuckyRecord) =>
  callDockerApi("volumes", "POST", data);
export const removeDockerVolume = (name: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}`, "DELETE");
export const backupDockerVolume = (name: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}/backup`, "POST", undefined, undefined, 600000);
export const listDockerVolumeBackups = (name: string) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}/backups`);
export const uploadDockerVolumeBackup = (name: string, data: FormData) =>
  callDockerApi(`volumes/${encodeURIComponent(name)}/backups/upload`, "POST", data, undefined, 600000);
export const exportDockerVolume = (name: string) =>
  callDockerApi("volumes/export", "GET", undefined, { name }, 600000, undefined, "blob");
export const importDockerVolume = (data: FormData) =>
  callDockerApi("volumes/import", "POST", data, undefined, 600000);
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
export const getDockerVolumeBackupStatus = (input?: DockerSignalInput) =>
  callDockerApi("volumes/backup/status", "GET", undefined, undefined, undefined, resolveDockerSignal(input));

export async function listDockerTasks(input?: DockerSignalInput) {
  const raw = await callDockerApi("tasks", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
  return { items: list(raw, ["tasks", "list"]), raw };
}
export const getDockerTask = (id: string) =>
  callDockerApi(`tasks/${encodeURIComponent(id)}`);
export const removeDockerTask = (id: string) =>
  callDockerApi(`tasks/${encodeURIComponent(id)}`, "DELETE");
export const clearDockerTasks = () => callDockerApi("tasks", "DELETE");

export const getDockerInfo = (input?: DockerSignalInput) =>
  callDockerApi("info", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerVersion = (input?: DockerSignalInput) =>
  callDockerApi("version", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerDiskUsage = (input?: DockerSignalInput) =>
  callDockerApi("disk-usage", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerMonitorStatus = (input?: DockerSignalInput) =>
  callDockerApi("monitor/status", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const getDockerSelfContainerInfo = (input?: DockerSignalInput) =>
  callDockerApi("self-container", "GET", undefined, undefined, undefined, resolveDockerSignal(input));

async function optionalDockerRequest<T>(request: Promise<T>, signal?: AbortSignal) {
  try {
    return await request;
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}

export async function getDockerOverview(input?: DockerSignalInput) {
  const signal = resolveDockerSignal(input);
  const [infoRaw, containersResult, imagesResult, composeResult, networksResult, volumesResult] = await Promise.all([
    optionalDockerRequest(getDockerInfo(signal), signal),
    optionalDockerRequest(listDockerContainers(signal), signal),
    optionalDockerRequest(listDockerImages(signal), signal),
    optionalDockerRequest(listDockerComposeProjects(signal), signal),
    optionalDockerRequest(listDockerNetworks(signal), signal),
    optionalDockerRequest(listDockerVolumes(signal), signal),
  ]);
  throwIfAborted(signal);

  if (!infoRaw && !containersResult && !imagesResult && !composeResult && !networksResult && !volumesResult) {
    throw new Error("Docker 总览接口均不可用");
  }

  const info = findRecord(infoRaw ?? {}, ["info", "dockerInfo", "data", "result"]);
  const containers = containersResult?.items ?? [];
  const images = imagesResult?.items ?? [];
  const fallbackContainers = findScalar(info, ["Containers", "containers"]);
  const fallbackImages = findScalar(info, ["Images", "images"]);
  const fallbackContainerCount = Number(fallbackContainers);
  const fallbackImageCount = Number(fallbackImages);
  const imageSize = images.reduce((total, image) => {
    const size = findScalar(image, ["Size", "size", "VirtualSize", "virtualSize"]);
    return total + (Number(size) || 0);
  }, 0);

  return {
    info,
    containers,
    containersAvailable: Boolean(containersResult),
    containerCount: containersResult
      ? containers.length
      : fallbackContainers === undefined || !Number.isFinite(fallbackContainerCount)
        ? undefined
        : fallbackContainerCount,
    imageCount: imagesResult
      ? images.length
      : fallbackImages === undefined || !Number.isFinite(fallbackImageCount)
        ? undefined
        : fallbackImageCount,
    imageSize: imagesResult ? imageSize : undefined,
    composeCount: composeResult?.items.length,
    networkCount: networksResult?.items.length,
    volumeCount: volumesResult?.items.length,
  };
}

export async function getDockerMaintenanceStatus(input?: DockerSignalInput) {
  const signal = resolveDockerSignal(input);
  const requests = {
    labels: getDockerLabels(signal),
    containerGroups: getDockerContainerGroups(signal),
    collapsedStates: getDockerContainerGroupCollapsedStates(signal),
    orderMapping: getDockerContainerOrderMapping(signal),
    imageUpgrades: getDockerImageUpgradeStatus("", signal),
    composeBackup: getDockerComposeBackupStatus(signal),
    volumeBackup: getDockerVolumeBackupStatus(signal),
  };
  const entries = Object.entries(requests);
  const results = await Promise.allSettled(entries.map(([, request]) => request));
  throwIfAborted(signal);
  return Object.fromEntries(results.map((result, index) => [
    entries[index][0],
    result.status === "fulfilled"
      ? result.value
      : { error: result.reason instanceof Error ? result.reason.message : "接口请求失败" },
  ])) as Record<string, LuckyRecord>;
}
export const getDockerConfig = (input?: DockerSignalInput) =>
  callDockerApi("config", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const updateDockerConfig = (data: LuckyRecord) =>
  callDockerApi("config", "POST", data);
export const getDockerLogs = (pageSize = 200, page = 1, input?: DockerSignalInput) =>
  callDockerApi("logs", "GET", undefined, { pageSize, page }, undefined, resolveDockerSignal(input));
async function pruneUnusedDockerImages() {
  const { items } = await listDockerImages();
  const ids: string[] = [];
  let missingIdCount = 0;
  for (const image of items) {
    const id = [image.Id, image.ID, image.id]
      .find((value) => typeof value === "string" && value.trim()) as string | undefined;
    if (id) ids.push(id);
    else missingIdCount += 1;
  }

  // Resolve usage from one container snapshot. This is both faster than one
  // association request per image and conservative when Lucky omits identity
  // fields: uncertain images remain in the skipped set.
  const scan = await scanUnusedDockerImages(ids);
  const unused = Array.isArray(scan.unused) ? scan.unused.map(String) : [];
  const removal = await runDockerBatch(unused, (id) => removeDockerImage(id, true), {
    concurrency: 4,
  });
  const used = Array.isArray(scan.used) ? scan.used.map(String) : [];
  const uncertain = Array.isArray(scan.failed)
    ? scan.failed.flatMap((item) => isRecord(item) && typeof item.item === "string" ? [item.item] : [])
    : [];
  return {
    removed: removal.succeeded,
    skipped: [
      ...Array.from({ length: missingIdCount }, () => "未知镜像"),
      ...used,
      ...uncertain,
      ...removal.failed.map(({ item }) => item),
    ],
    removedCount: removal.succeeded.length,
    skippedCount: used.length + uncertain.length + removal.failed.length + missingIdCount,
  };
}

export async function pruneDocker(data: LuckyRecord) {
  try {
    return await callDockerApi("prune", "POST", data);
  } catch (error) {
    if (!(error instanceof Error) || !/invalid filter\s+['\"]?dangling/i.test(error.message) || data.images !== true)
      throw error;

    const remaining: LuckyRecord = { ...data, images: false };
    const hasOtherCleanup = ["containers", "networks", "volumes", "build_cache"]
      .some((key) => remaining[key] === true);
    const system = hasOtherCleanup
      ? await callDockerApi("prune", "POST", remaining)
      : {};
    const images = await pruneUnusedDockerImages();
    return { ret: 0, msg: "已使用兼容模式清理未使用镜像", system, images };
  }
}
export const getDockerRegistryMirrors = (input?: DockerSignalInput) =>
  callDockerApi("registry/mirrors", "GET", undefined, undefined, undefined, resolveDockerSignal(input));
export const addDockerRegistryMirror = (mirror: string) =>
  callDockerApi("registry/mirrors", "POST", { mirror });
export const removeDockerRegistryMirror = (mirror: string) =>
  callDockerApi("registry/mirrors", "DELETE", { mirror });
