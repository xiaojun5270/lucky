import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  Activity,
  Box,
  Braces,
  CircleStop,
  Container,
  Database,
  FileText,
  Folder,
  Gauge,
  HardDrive,
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
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  Page,
  Panel,
  SearchField,
  SectionHeader,
} from "@/src/components/lucky-ui";
import { StructuredDataView, StructuredForm } from "@/src/components/structured-form";
import { queryClient } from "@/src/lib/query-client";
import { useAppTheme } from "@/src/lib/theme";
import type { LuckyRecord } from "@/src/types/lucky";
import {
  addDockerRegistryMirror,
  callDockerApi,
  backupDockerCompose,
  backupDockerVolume,
  buildDockerImage,
  clearDockerTasks,
  createDockerContainer,
  createDockerNetwork,
  createDockerVolume,
  discoverDockerCompose,
  editDockerContainer,
  getDockerConfig,
  getDockerComposeLogs,
  getDockerContainer,
  getDockerContainerLogs,
  getDockerContainerProcesses,
  getDockerDiskUsage,
  getDockerImage,
  getDockerInfo,
  getDockerLogs,
  getDockerMonitorStatus,
  getDockerRegistryMirrors,
  getDockerTask,
  getDockerVersion,
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
function isRunning(item: LuckyRecord) {
  return /running|active|up/i.test(
    pick(item, ["State", "state", "Status", "status"]),
  );
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
    <Modal transparent animationType="slide" onRequestClose={close}>
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.42)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            minHeight: "60%",
            maxHeight: "88%",
            backgroundColor: colors.card,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            padding: 18,
            gap: 13,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Wrench color={colors.primary} size={20} />
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
            <Pressable onPress={close}>
              <Text style={{ color: colors.subtext, fontWeight: "700" }}>
                取消
              </Text>
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
              borderRadius: 8,
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
      </SafeAreaView>
    </Modal>
  );
}

export default function DockerScreen() {
  const colors = useAppTheme();
  const [view, setView] = useState<DockerView>("containers");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<Editor>();
  const [output, setOutput] = useState<unknown>("");
  const [localError, setLocalError] = useState("");
  const containers = useQuery({
    queryKey: ["docker", "containers"],
    queryFn: listDockerContainers,
    enabled: view === "containers",
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
    queryFn: async () => {
      const [info, version, disk, monitor] = await Promise.all([
        getDockerInfo(),
        getDockerVersion(),
        getDockerDiskUsage(),
        getDockerMonitorStatus(),
      ]);
      return { info, version, disk, monitor };
    },
    enabled: view === "overview",
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
    const word = search.trim().toLowerCase();
    return (source ?? []).filter(
      (item) => !word || JSON.stringify(item).toLowerCase().includes(word),
    );
  }, [source, search]);
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

  return (
    <Page
      title="Docker"
      subtitle="容器、镜像与 Compose 管理"
      icon={Container}
      safeTop={false}
      refreshing={active.isFetching}
      onRefresh={() => active.refetch()}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
              const running = isRunning(item);
              const paused = /paused/i.test(
                pick(item, ["State", "state", "Status", "status"]),
              );
              const name = pick(
                item,
                ["Names", "Name", "name"],
                key.slice(0, 12),
              );
              return (
                <Panel key={key}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 8,
                        backgroundColor: running
                          ? colors.successBg
                          : colors.mutedCard,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Container
                        color={running ? colors.success : colors.disabled}
                        size={19}
                      />
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
                        {pick(item, ["Image", "ImageName"])} ·{" "}
                        {pick(item, ["Status", "State"], "未知")}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: running
                          ? colors.success
                          : colors.disabled,
                      }}
                    />
                  </View>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}
                  >
                    {paused ? (
                      <IconButton
                        icon={Play}
                        label="恢复"
                        color={colors.success}
                        onPress={() =>
                          mutation.mutate({ type: "container-unpause", key })
                        }
                      />
                    ) : !running ? (
                      <IconButton
                        icon={Play}
                        label="启动"
                        color={colors.success}
                        onPress={() =>
                          mutation.mutate({ type: "container-start", key })
                        }
                      />
                    ) : (
                      <>
                        <IconButton
                          icon={CircleStop}
                          label="停止"
                          color={colors.danger}
                          onPress={() =>
                            danger("确认停止", `停止容器 ${name}？`, () =>
                              mutation.mutate({ type: "container-stop", key }),
                            )
                          }
                        />
                        <IconButton
                          icon={Pause}
                          label="暂停"
                          color={colors.warning}
                          onPress={() =>
                            mutation.mutate({ type: "container-pause", key })
                          }
                        />
                      </>
                    )}
                    <IconButton
                      icon={RotateCw}
                      label="重启"
                      color={colors.primary}
                      onPress={() =>
                        danger("确认重启", `重启容器 ${name}？`, () =>
                          mutation.mutate({ type: "container-restart", key }),
                        )
                      }
                    />
                    <IconButton
                      icon={FileText}
                      label="日志"
                      color={colors.cyan}
                      onPress={() => containerLogs(key)}
                    />
                    <IconButton
                      icon={Folder}
                      label="文件"
                      color={colors.warning}
                      onPress={() =>
                        setEditor({
                          type: "container-files",
                          title: "容器文件操作",
                          key,
                          value: { operation: "list", path: "/" },
                        })
                      }
                    />
                    <IconButton
                      icon={Activity}
                      label="进程"
                      color={colors.cyan}
                      onPress={async () =>
                        setOutput(await getDockerContainerProcesses(key))
                      }
                    />
                    <IconButton
                      icon={Search}
                      label="详情"
                      color={colors.text}
                      onPress={() => inspect("container", key)}
                    />
                    <IconButton
                      icon={Pencil}
                      label="编辑"
                      color={colors.primary}
                      onPress={async () => {
                        const result = await getDockerContainer(key);
                        setEditor({
                          type: "container-edit",
                          title: "编辑容器",
                          key,
                          value: nested(result, ["container", "data"]),
                        });
                      }}
                    />
                    <IconButton
                      icon={Box}
                      label="重命名"
                      color={colors.primary}
                      onPress={() =>
                        setEditor({
                          type: "container-rename",
                          title: "重命名容器",
                          key,
                          value: { name },
                        })
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      label="删除"
                      color={colors.danger}
                      onPress={() =>
                        danger("确认删除", `强制删除容器 ${name}？`, () =>
                          mutation.mutate({ type: "container-remove", key }),
                        )
                      }
                    />
                  </View>
                </Panel>
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

      {view === "overview" && overview.data ? (
        <>
          <SectionHeader icon={Gauge} title="Docker 总览" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[
              ["运行状态", pick(overview.data.monitor, ["Status", "status", "State", "state"], "正常"), Activity],
              [
                "版本",
                pick(overview.data.version, ["Version", "version"]),
                Box,
              ],
              [
                "容器",
                pick(overview.data.info, ["Containers", "containers"]),
                Container,
              ],
              ["镜像", pick(overview.data.info, ["Images", "images"]), Image],
            ].map(([label, value, Icon]) => (
              <Panel key={String(label)}>
                <View style={{ width: 130, minHeight: 64 }}>
                  <Icon color={colors.primary} size={18} />
                  <Text
                    style={{
                      color: colors.subtext,
                      fontSize: 11,
                      marginTop: 7,
                    }}
                  >
                    {String(label)}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={{
                      color: colors.text,
                      fontWeight: "800",
                      marginTop: 3,
                    }}
                  >
                    {String(value || "--")}
                  </Text>
                </View>
              </Panel>
            ))}
          </View>
          <Panel>
            <SectionHeader icon={HardDrive} title="磁盘占用" />
            <StructuredDataView value={overview.data.disk} />
          </Panel>
        </>
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
          <Pressable
            onPress={() => router.push("/modules/docker" as never)}
            style={{
              height: 42,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <Braces color={colors.primary} size={17} />
            <Text style={{ color: colors.primary, fontWeight: "800" }}>
              全部 Docker 接口
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
    </Page>
  );
}
