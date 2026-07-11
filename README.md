# Lucky 管理 APP

基于 Expo + React Native 的 Lucky 2.27.2 移动管理端，按照 `Lucky_APP_API_开发文档.md` 接入。

已实现：

- 服务器地址、管理员账号、密码和 2FA 登录
- `Lucky-Admin-Token` 注入、`ret` 错误处理、请求超时和安全会话存储
- 服务状态、基础信息和模块总览
- 反向代理、DDNS、Docker 容器和 SSL 证书列表
- DDNS/SSL 手动同步和 Docker 启停/重启二次确认
- Lucky 全局日志和安全退出
- 文档全部 45 个模块、328 条端点、448 个 HTTP 方法的接口注册表
- 模块搜索、端点浏览、动态路径参数、查询参数和 JSON 请求体调试
- JSON、文本、空响应和二进制下载响应解析
- DELETE、配置写入、Docker、证书、同步、重启和 WOL 等高风险操作二次确认

接口目录由 `docs/Lucky_API_Endpoints.json` 自动生成：

```bash
npm run generate:endpoints
npm run check:endpoints
```

完整验证（接口覆盖率、TypeScript、依赖漏洞）：

```bash
npm run verify
```

## 开发

```bash
npm ci
npm run start
```

Web 调试：

```bash
npm run web
```

Lucky 默认地址通常为 `http://<服务器 IP>:16601`。若从公网访问，应先配置 HTTPS 与访问控制。
