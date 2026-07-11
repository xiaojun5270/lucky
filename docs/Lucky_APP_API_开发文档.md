# Lucky APP API 开发文档

> 生成时间：2026-07-11 18:29 GMT+8  
> 来源：本机 Docker 容器 `lucky`（镜像 `gdy666/lucky:v2`，版本标签 `2.27.2`）、运行端口 `http://127.0.0.1:16601`、前端静态包反向提取。

## 1. 接入总览

- **Base URL**：`http://<NAS或服务器IP>:16601`（当前容器使用 host 网络，监听 `16601`；另发现 `16678/16679` 监听端口，APP 主 API 以 `16601` 为准）。
- **认证方式**：先调用 `/api/login` 获取登录态/Token；后续请求按 Web 前端逻辑携带 `Lucky-Admin-Token` 请求头。
- **通用返回**：`ret == 0` 表示成功；`ret != 0` 表示失败；`msg` 为提示。未登录样例：

```json
{"msg":"login invalid","ret":-1}
```

- **APP 封装建议**：统一封装 HTTP Client、Token 注入、`ret=-1` 跳登录、超时、重试、错误 Toast、危险动作二次确认。
- **重要说明**：未使用/导出管理员账号密码；已登录后的完整成功响应字段需在 APP 联调环境用真实 Token 再抓一次样例。本文件的字段清单由 Lucky 前端调用与页面数据结构推断，适合先做 APP 数据模型与接口层开发。

## 2. 通用字段模型

- **通用响应包**：ret:number（0 成功，非 0 失败）；msg:string（失败/提示信息）；其余字段按接口返回。未登录样例：{"msg":"login invalid","ret":-1}。
- **认证**：登录成功后前端会保存/携带 Lucky-Admin-Token；APP 应统一封装 token、401/ret=-1 重新登录、超时重试。
- **列表接口常见字段**：list/xxxList: array；count/total:number；item 对象通常含 Key/key/id、Name/name、Enable/enable、Description/desc、Order/order、GroupKey/group。
- **日志接口**：logs/lastlogs 通常返回 ret,msg,logs/list 或 text；参数常见 pre/offset/level/module。
- **配置接口**：configure/config/setting/baseconfigure 通常 GET 取配置，PUT 保存完整配置对象。
- **动作接口**：enable/manualSync/wakeup/shutdown/restart/start/stop/dojobs/test 等多为 POST/GET/PUT 动作型接口，返回 ret,msg，可能附带 status/result/log。

### 2.1 请求头

```http
Accept: application/json
Content-Type: application/json
Lucky-Admin-Token: <login_token>
```

### 2.2 登录请求示例

```http
POST /api/login
Content-Type: application/json

{
  "Account": "<用户名>",
  "Password": "<密码>",
  "TwoFACode": "<可选：2FA验证码>"
}
```

## 3. 模块返回字段速查

- **基础/静态资源 `base`**：`status`、`info`、`modules`、`netinterfaces`、`baseconfigure`、`version`、`LoginPageConfig`
- **Cloudflared `cloudflared`**：`list`、`Key`、`Name`、`TunnelID`、`Token`、`Config`、`Enable`、`logs`
- **Coraza/WAF `coraza`**：`list`、`instances`、`OWASP core ruleset`、`Key`、`Name`、`Enable`、`Rules`、`logs`
- **计划任务 `cron`**：`cronList`、`groupList`、`Key`、`Name`、`Expression`、`Command`、`Enable`、`GroupKey`、`LastRun`、`NextRun`、`LastLogs`
- **DDNS `ddns`**：`taskList/list`、`TaskKey`、`TaskName`、`Enable`、`Records[]`、`Domain`、`SubDomain`、`DNSProvider`、`IPv4/IPv6`、`Webhook`、`LastRun/LastResult`、`Expanded`
- **DLNA 服务 `dlnaservice`**：`configure`、`status`、`Enable`、`MediaDirs`、`FriendlyName`、`logs`
- **Docker 管理 `docker`**：`containers`、`images`、`volumes`、`networks`、`compose projects`、`id`、`name`、`image`、`status`、`ports`、`mounts`、`stats(cpu/mem/net/io)`、`logs`、`tasks`
- **FRP `frp`**：`list`、`Key`、`Name`、`Role(client/server)`、`ServerAddr`、`BindPort`、`ProxyList`、`Enable`、`logs`
- **FTP 服务 `ftpserver`**：`configure`、`status`、`Enable`、`Listen`、`Users`、`RootPath`、`TLS`、`logs`
- **图标库 `iconlib`**：`sources`、`icons`、`keyword`、`icon url/base64/svg`、`logs`
- **IP 数据库 `ipdb`**：`items`、`dbfile`、`query`、`IP`、`Country/Region/City`、`ISP`、`ASN`、`logs`
- **IP 过滤（接口拼写为 ipfliter） `ipfliter`**：`list/listlite`、`rule/subrule`、`IP/CIDR`、`Action`、`Enable`、`AutoRecordIPConf`
- **端口转发 `portforward`**：`PortForwardList/list`、`Key`、`Name`、`Enable`、`ListenPort`、`TargetHost`、`TargetPort`、`Protocol`、`RuleList`、`GroupKey`
- **Rclone `rclone`**：`remoteList`、`remote name/type`、`config`、`mount`、`third auth url/user/check`、`logs`
- **SSL/TLS 证书 `ssl`**：`list`、`Key`、`Name`、`Type(file/path/acme/sync)`、`Domains`、`CertFile/KeyFile`、`ACMEing`、`ExpireTime`、`SyncClients`、`Status`
- **存储管理 `storagemanagement`**：`list/liteList`、`Key`、`Name`、`Type`、`MountPath`、`Enable`、`aliyunpan auth status`、`logs`
- **第三方认证 `thirdPartyAuthManager`**：`list`、`config`、`Key`、`Name`、`Provider`、`ClientID`、`RedirectURI`、`Enable`、`logs`
- **WebDAV `webdav`**：`configure`、`status`、`Enable`、`Listen`、`Users`、`RootPath`、`TLS`、`logs`
- **反向代理/Web 服务 `webservice`**：`rules/ruleList`、`DefaultProxy`、`ProxyList`、`Domains`、`Listen`、`BackendURL/ProxyURL`、`TLS/Cert`、`Headers`、`AccessLog`、`GroupKey`、`Enable`
- **WebTerminal `webterminal`**：`connections`、`sessions`、`shells`、`key`、`name`、`host`、`port`、`username`、`authType`、`sftp path`、`security 2FA`、`shortcuts`
- **网络唤醒 `wol`**：`devices`、`Key`、`Name`、`MAC`、`IP`、`Broadcast`、`Port`、`Online`、`ShutdownCommand`、`WakeupResult`

## 4. 全量接口清单


### 基础/静态资源 `base`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/LoginPageConfig` | 返回：`ret`,`msg`；成功时包含 status, info, modules, netinterfaces, baseconfigure, version, LoginPageConfig | `lucky_index.js` |
| `GET` | `/frontendcontroll` | 返回：`ret`,`msg`；成功时包含 status, info, modules, netinterfaces, baseconfigure, version, LoginPageConfig | `lucky_index.js` |
| `GET` | `/officialwebsiteaddresslist` | 返回：`ret`,`msg`；成功时包含 status, info, modules, netinterfaces, baseconfigure, version, LoginPageConfig | `lucky_index.js` |
| `GET` | `/version` | 返回：`ret`,`msg`；成功时包含 status, info, modules, netinterfaces, baseconfigure, version, LoginPageConfig | `lucky_index.js` |

### 基础配置 `baseconfigure`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/baseconfigure` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### Cloudflared `cloudflared`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT/DELETE*` | `/api/cloudflared/` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, TunnelID, Token, Config, Enable, logs | `lucky_cloudflared-B-SRIJzs.js` |
| `GET/POST/PUT` | `/api/cloudflared/list` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, TunnelID, Token, Config, Enable, logs | `lucky_cloudflared-B-SRIJzs.js` |
| `GET` | `/api/cloudflared/list/` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, TunnelID, Token, Config, Enable, logs | `lucky_cloudflared-B-SRIJzs.js` |
| `GET` | `/api/cloudflared/logs` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, TunnelID, Token, Config, Enable, logs | `lucky_cloudflared-B-SRIJzs.js` |
| `PUT` | `/api/cloudflared/orderadjustment` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, TunnelID, Token, Config, Enable, logs | `lucky_cloudflared-B-SRIJzs.js` |

### Coraza/WAF `coraza`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/coraza/OWASPCoreRuleset` | 返回：`ret`,`msg`；成功时包含 list, instances, OWASP core ruleset, Key, Name, Enable, Rules, logs | `lucky_coraza-SeSYFu48.js` |
| `GET` | `/api/coraza/instancelist` | 返回：`ret`,`msg`；成功时包含 list, instances, OWASP core ruleset, Key, Name, Enable, Rules, logs | `lucky_coraza-SeSYFu48.js` |
| `PUT` | `/api/coraza/instanceorderadjustment` | 返回：`ret`,`msg`；成功时包含 list, instances, OWASP core ruleset, Key, Name, Enable, Rules, logs | `lucky_coraza-SeSYFu48.js` |
| `GET/POST/PUT` | `/api/coraza/list` | 返回：`ret`,`msg`；成功时包含 list, instances, OWASP core ruleset, Key, Name, Enable, Rules, logs | `lucky_coraza-SeSYFu48.js` |
| `GET` | `/api/coraza/list/` | 返回：`ret`,`msg`；成功时包含 list, instances, OWASP core ruleset, Key, Name, Enable, Rules, logs | `lucky_coraza-SeSYFu48.js` |
| `GET` | `/api/coraza/logs` | 返回：`ret`,`msg`；成功时包含 list, instances, OWASP core ruleset, Key, Name, Enable, Rules, logs | `lucky_coraza-SeSYFu48.js` |

### 计划任务 `cron`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/cron/dojobs` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `GET` | `/api/cron/enable` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `GET` | `/api/cron/expressioncheck` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `DELETE/GET/POST/PUT` | `/api/cron/groups` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `PUT` | `/api/cron/groups/collapsed` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `GET` | `/api/cron/groups/collapsed/states` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `PUT` | `/api/cron/groups/orderadjustment` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `GET` | `/api/cron/groups/taskcount` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `GET` | `/api/cron/lastlogs` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `DELETE/GET/POST/PUT` | `/api/cron/list` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `GET` | `/api/cron/logs` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |
| `PUT` | `/api/cron/taskgrouporderupdate` | 返回：`ret`,`msg`；成功时包含 cronList, groupList, Key, Name, Expression, Command, Enable, GroupKey, LastRun, NextRun, LastLogs | `lucky_panel-CHJL_oLj.js` |

### DDNS `ddns`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `DELETE/POST/PUT` | `/api/ddns` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET/PUT/DELETE*` | `/api/ddns/` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET/PUT` | `/api/ddns/configure` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET` | `/api/ddns/enable` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET` | `/api/ddns/expanded` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET` | `/api/ddns/getipfromcmdtest` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET` | `/api/ddns/ipsectionexpanded` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET` | `/api/ddns/lastlogs` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET` | `/api/ddns/logs` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET/PUT/DELETE*` | `/api/ddns/manualSync/` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET` | `/api/ddns/odhcpdclients` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET/PUT/DELETE*` | `/api/ddns/recordOrderadjustment/` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `GET/PUT/DELETE*` | `/api/ddns/task/` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `PUT` | `/api/ddns/taskorderadjustment` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |
| `POST` | `/api/ddns/webhooktest` | 返回：`ret`,`msg`；成功时包含 taskList/list, TaskKey, TaskName, Enable, Records[], Domain, SubDomain, DNSProvider, IPv4/IPv6, Webhook, LastRun/LastResult, Expanded | `lucky_ddns-CSjxdSl-.js` |

### ddnstasklist `ddnstasklist`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/ddnstasklist` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_ddns-CSjxdSl-.js` |

### DLNA 服务 `dlnaservice`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/dlnaservice/configure` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, MediaDirs, FriendlyName, logs | `lucky_panel-CqbDbvUx.js` |
| `GET` | `/api/dlnaservice/lastlogs` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, MediaDirs, FriendlyName, logs | `lucky_panel-CqbDbvUx.js` |
| `GET` | `/api/dlnaservice/logs` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, MediaDirs, FriendlyName, logs | `lucky_panel-CqbDbvUx.js` |
| `GET` | `/api/dlnaservice/status` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, MediaDirs, FriendlyName, logs | `lucky_panel-CqbDbvUx.js` |

### Docker 管理 `docker`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `DELETE` | `/api/docker/compose/${e}/backup/cancel` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET` | `/api/docker/compose/${e}/backups` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE` | `/api/docker/compose/${e}/backups/all` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/compose/${e}/backups/download.tar.gz` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/${e}/backups/restore` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/${e}/backups/upload` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/${e}/logs` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/compose/${e}/ps` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/backup` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/compose/backup/status` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/config` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/compose/containers-for-cron` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/discover` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/dockerfile` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/down` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/down-async` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/compose/projects` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/read-file` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/restart` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/restore` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/start` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/stop` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/stop-async` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/up` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/up-async` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/update-config` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/compose/update-dockerfile` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET/POST` | `/api/docker/config` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET/POST/PUT` | `/api/docker/container-groups` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `PUT` | `/api/docker/container-groups/collapsed` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/container-groups/collapsed/states` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/container-groups/count` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `PUT` | `/api/docker/container-groups/order` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET/POST` | `/api/docker/containers` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET` | `/api/docker/containers/${e}` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/commit` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/compose-config` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/copy` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/edit` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/export` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE` | `/api/docker/containers/${e}/files` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/chmod` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/compress` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/compress-async` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/copy` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/decompress` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/decompress-async` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/files/download` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/files/list` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/mkdir` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/files/preview-archive` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/files/read` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/rename` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/search` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/touch` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/upload` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/files/write` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/POST` | `/api/docker/containers/${e}/label` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/logs` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/pause` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/processes` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/rename` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/restart` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/start` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/stats` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/stats-cached` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/stop` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/unpause` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/${e}/upgrade` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/${e}/upgrade-check` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET/PUT` | `/api/docker/containers/order-mapping` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/set-group` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/containers/stats-cached` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/containers/switch-version` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/disk-usage` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/images` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET` | `/api/docker/images/${e}` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/images/${e}/filesystem` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/images/${e}/history` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/${e}/tag` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/images/${e}/tags` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/backup-tag` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/build` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/build-from-git` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/build-from-zip` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/images/containers` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/import` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/load` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/pull` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/pull-async` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/pull-with-backup` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/push` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE` | `/api/docker/images/remove` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/remove-saved-digest` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/search` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/upgrade-check` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/upgrade-containers` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/images/upgrade-dismiss` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET` | `/api/docker/images/upgrade-status` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/info` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/labels` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/labels/${e}/containers` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/logs` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/monitor/status` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET/POST` | `/api/docker/networks` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE` | `/api/docker/networks/${e}` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/prune` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET/POST` | `/api/docker/registry/mirrors` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/self-container` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET` | `/api/docker/tasks` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET` | `/api/docker/tasks/${e}` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/version` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET/POST` | `/api/docker/volumes` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE` | `/api/docker/volumes/${e}` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/volumes/${e}/backup` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE` | `/api/docker/volumes/${e}/backup/cancel` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `DELETE/GET` | `/api/docker/volumes/${e}/backups` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/volumes/${e}/backups/restore` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/volumes/${e}/backups/upload` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/volumes/backup/status` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `GET` | `/api/docker/volumes/export` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |
| `POST` | `/api/docker/volumes/import` | 返回：`ret`,`msg`；成功时包含 containers, images, volumes, networks, compose projects, id, name, image, status, ports, mounts, stats(cpu/mem/net/io), logs, tasks | `lucky_docker-jAUx4aGG.js` |

### FRP `frp`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT/DELETE*` | `/api/frp/` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Role(client/server), ServerAddr, BindPort, ProxyList, Enable, logs | `lucky_panel-DYX1CPcY.js` |
| `GET/POST/PUT` | `/api/frp/list` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Role(client/server), ServerAddr, BindPort, ProxyList, Enable, logs | `lucky_panel-DYX1CPcY.js` |
| `GET` | `/api/frp/list/` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Role(client/server), ServerAddr, BindPort, ProxyList, Enable, logs | `lucky_panel-DYX1CPcY.js` |
| `GET` | `/api/frp/logs` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Role(client/server), ServerAddr, BindPort, ProxyList, Enable, logs | `lucky_panel-DYX1CPcY.js` |
| `PUT` | `/api/frp/orderadjustment` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Role(client/server), ServerAddr, BindPort, ProxyList, Enable, logs | `lucky_panel-DYX1CPcY.js` |

### FTP 服务 `ftpserver`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/ftpserver/configure` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-Bpuke0IM.js` |
| `GET` | `/api/ftpserver/lastlogs` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-Bpuke0IM.js` |
| `GET` | `/api/ftpserver/logs` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-Bpuke0IM.js` |
| `GET` | `/api/ftpserver/status` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-Bpuke0IM.js` |

### 图标库 `iconlib`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/POST*` | `/api/iconlib/icon?` | 返回：`ret`,`msg`；成功时包含 sources, icons, keyword, icon url/base64/svg, logs | `lucky_index.js` |
| `GET` | `/api/iconlib/icons` | 返回：`ret`,`msg`；成功时包含 sources, icons, keyword, icon url/base64/svg, logs | `lucky_index.js` |
| `GET` | `/api/iconlib/logs` | 返回：`ret`,`msg`；成功时包含 sources, icons, keyword, icon url/base64/svg, logs | `lucky_index.js` |
| `GET` | `/api/iconlib/search` | 返回：`ret`,`msg`；成功时包含 sources, icons, keyword, icon url/base64/svg, logs | `lucky_index.js` |
| `GET/POST/PUT` | `/api/iconlib/sources` | 返回：`ret`,`msg`；成功时包含 sources, icons, keyword, icon url/base64/svg, logs | `lucky_index.js` |
| `GET/PUT/DELETE*` | `/api/iconlib/sources/` | 返回：`ret`,`msg`；成功时包含 sources, icons, keyword, icon url/base64/svg, logs | `lucky_index.js` |

### info `info`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/info` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### IP 数据库 `ipdb`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/ipdb/avalidDBFiles` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `GET/PUT` | `/api/ipdb/configure` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `DELETE` | `/api/ipdb/dbfile` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `PUT` | `/api/ipdb/instanceorderadjustment` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `DELETE/POST/PUT` | `/api/ipdb/item` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `GET/PUT/DELETE*` | `/api/ipdb/item/` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `GET` | `/api/ipdb/items` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `GET` | `/api/ipdb/logs` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |
| `GET` | `/api/ipdb/query` | 返回：`ret`,`msg`；成功时包含 items, dbfile, query, IP, Country/Region/City, ISP, ASN, logs | `lucky_panel-6oYYYezP.js` |

### IP 过滤（接口拼写为 ipfliter） `ipfliter`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/ipfliter/autorecordipconf` | 返回：`ret`,`msg`；成功时包含 list/listlite, rule/subrule, IP/CIDR, Action, Enable, AutoRecordIPConf | `lucky_ipfilter-DTNpbCPI.js` |
| `GET` | `/api/ipfliter/list` | 返回：`ret`,`msg`；成功时包含 list/listlite, rule/subrule, IP/CIDR, Action, Enable, AutoRecordIPConf | `lucky_ipfilter-DTNpbCPI.js` |
| `GET` | `/api/ipfliter/list/` | 返回：`ret`,`msg`；成功时包含 list/listlite, rule/subrule, IP/CIDR, Action, Enable, AutoRecordIPConf | `lucky_ipfilter-DTNpbCPI.js` |
| `GET` | `/api/ipfliter/list/subrulelist/` | 返回：`ret`,`msg`；成功时包含 list/listlite, rule/subrule, IP/CIDR, Action, Enable, AutoRecordIPConf | `lucky_ipfilter-DTNpbCPI.js` |
| `GET` | `/api/ipfliter/listlite` | 返回：`ret`,`msg`；成功时包含 list/listlite, rule/subrule, IP/CIDR, Action, Enable, AutoRecordIPConf | `lucky_ipfilter-DTNpbCPI.js` |
| `GET` | `/api/ipfliter/oneclickrecord` | 返回：`ret`,`msg`；成功时包含 list/listlite, rule/subrule, IP/CIDR, Action, Enable, AutoRecordIPConf | `lucky_ipfilter-DTNpbCPI.js` |

### ipregtest `ipregtest`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/ipregtest` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### 登录 `login`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `POST` | `/api/login` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### logout `logout`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `PUT` | `/api/logout` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### 日志 `logs`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/logs` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### lucky `lucky`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `PUT` | `/api/lucky/service` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### 模块 `modules`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/modules/list` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### netinterfaces `netinterfaces`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/netinterfaces` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### OAuth 登录 `oauth`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `POST` | `/api/oauth/login` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |
| `GET` | `/api/oauth/status` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |
| `POST` | `/api/oauth/tmpcode` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |
| `GET` | `/api/oauth/userinfo` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### 端口转发 `portforward`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `DELETE/POST/PUT` | `/api/portforward` | 返回：`ret`,`msg`；成功时包含 PortForwardList/list, Key, Name, Enable, ListenPort, TargetHost, TargetPort, Protocol, RuleList, GroupKey | `lucky_portforward-BrHj6HGH.js` |
| `GET/PUT/DELETE*` | `/api/portforward/` | 返回：`ret`,`msg`；成功时包含 PortForwardList/list, Key, Name, Enable, ListenPort, TargetHost, TargetPort, Protocol, RuleList, GroupKey | `lucky_portforward-BrHj6HGH.js` |
| `GET/PUT` | `/api/portforward/configure` | 返回：`ret`,`msg`；成功时包含 PortForwardList/list, Key, Name, Enable, ListenPort, TargetHost, TargetPort, Protocol, RuleList, GroupKey | `lucky_portforward-BrHj6HGH.js` |
| `GET` | `/api/portforward/enable` | 返回：`ret`,`msg`；成功时包含 PortForwardList/list, Key, Name, Enable, ListenPort, TargetHost, TargetPort, Protocol, RuleList, GroupKey | `lucky_portforward-BrHj6HGH.js` |
| `PUT` | `/api/portforward/ruleorderadjustment` | 返回：`ret`,`msg`；成功时包含 PortForwardList/list, Key, Name, Enable, ListenPort, TargetHost, TargetPort, Protocol, RuleList, GroupKey | `lucky_portforward-BrHj6HGH.js` |

### portforwards `portforwards`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/portforwards` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_portforward-BrHj6HGH.js` |

### portforwards_lite `portforwards_lite`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/portforwards_lite` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_portforward-BrHj6HGH.js` |

### Rclone `rclone`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/rclone/globalconfig` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `PUT` | `/api/rclone/itemorderadjustment` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/lastlogs` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/logs` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET/PUT/DELETE*` | `/api/rclone/remote/` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `DELETE/GET/POST/PUT` | `/api/rclone/remotelist` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/remotelist/option` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/remotelistlite` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_index.js,lucky_rclone-CIdK4S8P.js` |
| `GET/PUT/DELETE*` | `/api/rclone/third/115pan/authcheck/` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/third/115pan/authurl` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/third/115pan/authuserlist` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `DELETE` | `/api/rclone/third/115pan/user` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET/PUT/DELETE*` | `/api/rclone/third/alipan/authcheck/` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/third/alipan/authurl` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/third/alipan/authuserlist` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `DELETE` | `/api/rclone/third/alipan/user` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET/PUT/DELETE*` | `/api/rclone/third/baidupan/authcheck/` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/third/baidupan/authurl` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `GET` | `/api/rclone/third/baidupan/authuserlist` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |
| `DELETE` | `/api/rclone/third/baidupan/user` | 返回：`ret`,`msg`；成功时包含 remoteList, remote name/type, config, mount, third auth url/user/check, logs | `lucky_rclone-CIdK4S8P.js` |

### reboot_program `reboot_program`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/reboot_program` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### restoreconfigureconfirm `restoreconfigureconfirm`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/restoreconfigureconfirm` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### SSL/TLS 证书 `ssl`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `DELETE/GET/POST/PUT` | `/api/ssl` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `GET/PUT/DELETE*` | `/api/ssl/` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `PUT` | `/api/ssl/flush` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `GET` | `/api/ssl/lastlogs` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `GET` | `/api/ssl/logs` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `GET/PUT/DELETE*` | `/api/ssl/manualsync/` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `GET/PUT` | `/api/ssl/setting` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `PUT` | `/api/ssl/sslorderadjustment` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |
| `GET` | `/api/ssl/syncclients` | 返回：`ret`,`msg`；成功时包含 list, Key, Name, Type(file/path/acme/sync), Domains, CertFile/KeyFile, ACMEing, ExpireTime, SyncClients, Status | `lucky_panel-Aq4cJakT.js` |

### 状态 `status`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/status` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### 存储管理 `storagemanagement`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/storagemanagement/aliyunpan_auth` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_storagemanagement-CXb-qK4e.js` |
| `GET/PUT/DELETE*` | `/api/storagemanagement/aliyunpan_auth_check/` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_storagemanagement-CXb-qK4e.js` |
| `GET` | `/api/storagemanagement/enable` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_storagemanagement-CXb-qK4e.js` |
| `PUT` | `/api/storagemanagement/itemorderadjustment` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_storagemanagement-CXb-qK4e.js` |
| `GET` | `/api/storagemanagement/lastlogs` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_storagemanagement-CXb-qK4e.js` |
| `DELETE/GET/POST/PUT` | `/api/storagemanagement/list` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_storagemanagement-CXb-qK4e.js` |
| `GET` | `/api/storagemanagement/litelist` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_index.js,lucky_storagemanagement-CXb-qK4e.js` |
| `GET` | `/api/storagemanagement/logs` | 返回：`ret`,`msg`；成功时包含 list/liteList, Key, Name, Type, MountPath, Enable, aliyunpan auth status, logs | `lucky_storagemanagement-CXb-qK4e.js` |

### STUN 内网穿透 `stun`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT/DELETE*` | `/api/stun/` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |
| `GET/PUT` | `/api/stun/configure` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |
| `PUT` | `/api/stun/ruleorderadjustment` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |

### stunrule `stunrule`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `DELETE/POST/PUT` | `/api/stunrule` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |
| `GET` | `/api/stunrule/enable` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |
| `POST` | `/api/stunrule/webhooktest` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |

### stunrulelist `stunrulelist`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/stunrulelist` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |

### stunrulelist_lite `stunrulelist_lite`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/stunrulelist_lite` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_stun-CpXo-EtM.js` |

### third `third`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/third/filebrowser/configure` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_panel-CEqq_vxt.js` |
| `GET` | `/api/third/filebrowser/lastlogs` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_panel-CEqq_vxt.js` |
| `GET` | `/api/third/filebrowser/logs` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_panel-CEqq_vxt.js` |
| `GET` | `/api/third/filebrowser/resetadmin` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_panel-CEqq_vxt.js` |

### 第三方认证 `thirdPartyAuthManager`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/thirdPartyAuthManager/config` | 返回：`ret`,`msg`；成功时包含 list, config, Key, Name, Provider, ClientID, RedirectURI, Enable, logs | `lucky_thirdPartyAuthManager-DZlqhJJJ.js` |
| `GET/POST/PUT` | `/api/thirdPartyAuthManager/list` | 返回：`ret`,`msg`；成功时包含 list, config, Key, Name, Provider, ClientID, RedirectURI, Enable, logs | `lucky_thirdPartyAuthManager-DZlqhJJJ.js` |
| `GET` | `/api/thirdPartyAuthManager/list/` | 返回：`ret`,`msg`；成功时包含 list, config, Key, Name, Provider, ClientID, RedirectURI, Enable, logs | `lucky_thirdPartyAuthManager-DZlqhJJJ.js` |
| `GET` | `/api/thirdPartyAuthManager/logs` | 返回：`ret`,`msg`；成功时包含 list, config, Key, Name, Provider, ClientID, RedirectURI, Enable, logs | `lucky_thirdPartyAuthManager-DZlqhJJJ.js` |
| `PUT` | `/api/thirdPartyAuthManager/orderadjustment` | 返回：`ret`,`msg`；成功时包含 list, config, Key, Name, Provider, ClientID, RedirectURI, Enable, logs | `lucky_thirdPartyAuthManager-DZlqhJJJ.js` |

### twofapassword `twofapassword`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/twofapassword` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### update `update`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET` | `/api/update/cancel` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |
| `PUT` | `/api/update/comfire` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### v2l `v2l`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `POST` | `/api/v2l` | 返回：`ret`,`msg`；成功时包含 ret, msg | `lucky_index.js` |

### WebDAV `webdav`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT` | `/api/webdav/configure` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-DJAXww5r.js` |
| `GET` | `/api/webdav/lastlogs` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-DJAXww5r.js` |
| `GET` | `/api/webdav/logs` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-DJAXww5r.js` |
| `GET` | `/api/webdav/status` | 返回：`ret`,`msg`；成功时包含 configure, status, Enable, Listen, Users, RootPath, TLS, logs | `lucky_panel-DJAXww5r.js` |

### 反向代理/Web 服务 `webservice`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `GET/PUT/DELETE*` | `/api/webservice/` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `POST` | `/api/webservice/cgi` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET/PUT/DELETE*` | `/api/webservice/cgi/` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET` | `/api/webservice/cgi/list` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `DELETE/GET/POST/PUT` | `/api/webservice/groups` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `PUT` | `/api/webservice/groups/orderadjustment` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET` | `/api/webservice/groups/subrulecount` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET` | `/api/webservice/lastlogs` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `POST` | `/api/webservice/lightpanel/configtemplate` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET` | `/api/webservice/logs` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `PUT` | `/api/webservice/modulesettings` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET` | `/api/webservice/modulesettings/frontend` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET/PUT/DELETE*` | `/api/webservice/rule/` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `PUT` | `/api/webservice/ruleorderadjustment` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET/POST` | `/api/webservice/rules` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET` | `/api/webservice/rules_lite` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `GET` | `/api/webservice/tipinfo` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |
| `PUT` | `/api/webservice/tipread` | 返回：`ret`,`msg`；成功时包含 rules/ruleList, DefaultProxy, ProxyList, Domains, Listen, BackendURL/ProxyURL, TLS/Cert, Headers, AccessLog, GroupKey, Enable | `lucky_reverseproxy-C9rQD8QJ.js` |

### WebTerminal `webterminal`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `PUT` | `/api/webterminal/connectionorderadjustment` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET/POST/PUT` | `/api/webterminal/connections` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET` | `/api/webterminal/connections/` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `POST` | `/api/webterminal/connections/test` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET/PUT` | `/api/webterminal/globalshortcuts` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET` | `/api/webterminal/logs` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET/PUT` | `/api/webterminal/security` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `POST` | `/api/webterminal/security/agreement` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET` | `/api/webterminal/security/check2fa` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `POST` | `/api/webterminal/security/verify2fa` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET` | `/api/webterminal/sessions` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET` | `/api/webterminal/sessions/` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET/PUT/DELETE*` | `/api/webterminal/sftp/` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `GET` | `/api/webterminal/shells` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |
| `DELETE/GET/PUT` | `/api/webterminal/splitlayout` | 返回：`ret`,`msg`；成功时包含 connections, sessions, shells, key, name, host, port, username, authType, sftp path, security 2FA, shortcuts | `lucky_index.js` |

### 网络唤醒 `wol`

| 方法 | 路径 | 说明/返回字段 | 来源 |
|---|---|---|---|
| `DELETE/POST/PUT` | `/api/wol/device` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET` | `/api/wol/device/shutdown` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET` | `/api/wol/device/wakeup` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `PUT` | `/api/wol/deviceorderadjustment` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET` | `/api/wol/devices` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET` | `/api/wol/devices_lite` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET` | `/api/wol/lastlogs` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET` | `/api/wol/logs` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET/PUT` | `/api/wol/service/configure` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `GET` | `/api/wol/service/getipv4interface` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |
| `POST` | `/api/wol/webhooktest` | 返回：`ret`,`msg`；成功时包含 devices, Key, Name, MAC, IP, Broadcast, Port, Online, ShutdownCommand, WakeupResult | `lucky_wol-5frTMnyy.js` |

## 5. APP 页面与接口映射建议

- **登录页**：`/LoginPageConfig`、`/api/login`、`/api/twofapassword`、`/api/oauth/*`。
- **总览页**：`/api/status`、`/api/info`、`/api/modules/list`、各模块 `/lastlogs`。
- **反向代理**：`/api/webservice/rules`、`/api/webservice/rule/{key}`、`/api/webservice/groups`、`/api/webservice/logs`。
- **DDNS**：`/api/ddns`、`/api/ddnstasklist`、`/api/ddns/task/{key}`、`/api/ddns/manualSync/{key}`。
- **Docker**：`/api/docker/containers`、`/api/docker/images`、`/api/docker/compose/projects`、`/api/docker/tasks`、`/api/docker/logs`。
- **证书**：`/api/ssl`、`/api/ssl/setting`、`/api/ssl/manualsync/{key}`、`/api/ssl/logs`。

## 6. 高风险接口提醒

以下接口会修改服务、系统、Docker、证书或网络配置，APP 端必须二次确认：`reboot_program`、`update/comfire`、Docker `start/stop/restart/down/up/prune/remove/build/pull/push/import/export/load`、SSL `flush/manualsync`、DDNS `manualSync`、WOL `shutdown/wakeup`、各模块 `DELETE`、`PUT configure/config/setting`。

## 7. 联调待补充

1. 使用管理员账号登录后，抓取每个 GET 接口成功响应样例，补齐字段类型。
2. 确认移动端是否走内网 IP、域名反代或 HTTPS。
3. 若要发布公网 APP，建议 Lucky 前面加 HTTPS + 访问控制，不要裸露管理端口。
