# Connector Runtime

Xpert 原生 Connector 的共享认证库，位于插件仓库。它只消费 `@xpert-ai/plugin-sdk/connector` 的类型；账号、授权范围、回调 state/cookie、凭据加密、撤销和执行时权限检查继续由 Xpert 宿主管理。

## 接入方式

| 场景 | 入口 | 厂商需要提供的内容 |
| --- | --- | --- |
| 标准 OAuth 授权码/刷新 | `createStandardOAuth2Driver` | 端点、客户端认证方式、PKCE、scopes/resource、经过权限检查的应用凭据 resolver；可选账号资料查询 |
| OAuth 使用自定义响应或已有凭据格式 | `createOAuth2Driver` | 相同描述，加上 token 请求/凭据 codec 和旧 pending metadata codec |
| API Key/PAT | `createCredentialDriver({ kind: 'api_key', ... })` | 输入/存量凭据解析、真实校验、scopes、账号资料映射 |
| 邮箱协议 | `createCredentialDriver({ kind: 'mail_protocol', ... })` | 同上；IMAP/SMTP 的服务器预设、TLS、登录校验交给已有协议服务 |
| 扫码、设备授权 | `createPollingDriver` | 严格的 pending parser、截止时间、厂商轮询适配器 |
| 旧版多阶段授权 | `pollBeforeDeadline` | 保留原结果类型和阶段转换；按需显式允许旧会话没有截止时间 |
| 非标准 OAuth 协议适配器 | `oauthTokenRequest`、`createPkce`、`authorizationUrl` | 特殊字段、发现/注册规则、签名、账号资料和错误解析 |

例如，新增一个提供标准 OAuth 的厂家，无需重写 connect / exchange / refresh：

```ts
const driver = createStandardOAuth2Driver({
  kind: 'oauth2',
  authMethodId: 'oauth2',
  authorizationEndpoint: 'https://vendor.example/oauth/authorize',
  tokenEndpoint: 'https://vendor.example/oauth/token',
  encoding: 'form',
  clientAuthentication: 'client_secret_basic',
  pkce: true,
  scopes: ['read']
}, {
  // 通过宿主的 IntegrationPermissionService 获取当前调用者有权使用的应用。
  // 根据 phase 从 input.values / input.metadata / input.credential.data 中
  // 读取 integrationId，校验 provider，并返回 { integrationId, clientId, clientSecret }。
  resolveApp: authorizedClientResolver
})
```

将驱动委托给现有 `ConnectorStrategyKey(provider)` 注册类即可；插件的展示定义、provider、authMethodId 和业务工具独立保留。这里的描述是受信任的 TypeScript 配置，不是允许最终用户提交代码或任意网络地址的新 API。

对于已有公开 MCP 服务的标准 Agent Plugin，优先继续使用 `agent-plugins/` 的 `mcp.json` 和宿主通用 MCP OAuth Connector；不必再创建原生 Connector。MCP OAuth 和普通 REST OAuth 有不同的 client/resource/scopes，凭据不会相互冒充。

原生 Connector 插件统一位于 `xpertai/connectors/`；公共认证库保留在 `xpertai/packages/connector-runtime/`。

## 全量迁移清单

当前仓库注册的 15 个原生 Connector 全部接入共享认证层。`migrations.json` 是可测试的清单；测试会扫描真实 `ConnectorStrategyKey` 注册，发现遗漏或新增未登记的 Connector 时失败。

| Connector | 合并到共享层 | 保留的厂商差异 |
| --- | --- | --- |
| 高德地图 | API Key 驱动 | 私钥格式、签名及 WebService 校验 |
| 腾讯地图 | API Key 驱动 | Key 格式与 WebService 校验 |
| 携程问道 | API Key 驱动 | Token 格式和旅行 API 校验 |
| 网易邮箱 | 邮箱凭据驱动 | 163/126/yeah 预设及 IMAP/SMTP 服务 |
| GitHub | PAT 驱动、OAuth 请求和 PKCE | GitHub App 查找、旧 OAuth pending 格式、用户资料与 token codec |
| Notion | 完整 OAuth 流程、JSON/Basic 请求 | 集成权限、workspace/bot/owner 字段及旧 pending codec |
| 百度网盘 | 完整 OAuth 流程、query 请求 | 租户应用解析、逗号分隔 scopes、二维码参数、受限响应读取 |
| 钉钉 | OAuth JSON 请求 | camelCase 协议、用户/企业身份、应用 token、加密应用凭据解析 |
| QQ 邮箱 | 邮箱凭据驱动、OAuth 请求和 PKCE | 集成引用存储、MCP 发现/DCR 白名单、邮箱 scopes 和别名 |
| Canva | OAuth 请求和 PKCE | 中国 MCP/全球 Connect 两种协议、DCR、端点白名单和撤销 |
| 金山文档 | 轮询驱动 | SkillHub 登录码、bearer 凭据 |
| WPS 知识库 | 轮询驱动 | 服务端生成登录码、kwiki 凭据与账号资料 |
| 企业微信 | 轮询驱动 | 机器人二维码、代理/TLS、签名和 retired flow 拒绝 |
| 知识星球 | 轮询驱动 | CLI opaque handle、账号资料、断开连接 |
| 飞书 | 旧协议轮询控制、授权 URL | 应用注册 → 用户设备授权、slow_down、旧宿主凭据契约 |

迁移保留 provider、authMethodId、安装范围、凭据字段和现有授权关系，不需要数据库数据迁移或批量重新授权。厂商特殊逻辑与业务工具仍留在各插件中，不以“全部配置化”替代必要的适配。知识星球与飞书增加了轮询到期拦截；飞书缺少截止时间的历史会话采用显式兼容策略。

## 协议约束

- 新建标准 OAuth 流程默认绑定回调地址和 client ID 指纹；PKCE 使用随机 verifier + S256。
- 请求编码显式区分 form / json / query。query 只用于明确要求它的厂家（现有百度协议）。
- 客户端认证显式区分 none / Basic / body，不通过字段或名称猜测。
- Token 请求只接受 HTTPS，不跟随重定向；默认 30 秒超时，可传入厂商自己的信号。已有端点白名单继续生效。
- 刷新响应没有新 refresh token 时，标准驱动保留旧 refresh token；运行时投影不返回它。
- 普通 API Key/邮箱连接必须真实校验通过后才返回 active；未验证输入不被直接激活。
- 库不保存任何账号、令牌或跨请求授权状态。个人/共享范围和所有权判断仍由宿主处理；应用 resolver 不能直接信任传入的 integrationId。

## 检查与发布

在仓库根目录执行：

```sh
node plugin-dev-harness/verify-connectors.mjs
```

脚本按工作区声明的 pnpm 运行 Nx 构建、测试、类型检查，然后对 15 个插件执行 dist-first 生命周期验证，并检查 16 个 tarball 的入口和依赖。它不访问真实第三方账号，不部署生产环境，不发布 npm。运行日志与回执保存在临时目录，可通过 `--output-dir` 指定。

发布顺序：先发布 `@xpert-ai/connector-runtime`，再发布引用它的 Connector。`workspace:^` 在 pnpm 打包时转换为共享库的版本范围。不要在共享库尚未发布时把依赖它的插件单独推到外部环境。Nx 的依赖构建和 TS project references 已接入。

撤回时可回滚各 Connector 到上一发布版本；凭据格式没有变化。完整第三方验收仍需对应厂商的有效应用与用户授权；单元测试、模拟协议测试及生命周期检查不代表真实用户账号已全部连接。

### 本次验收结果

2026-09-21，本地源码及实际 tarball 验证通过：

- 16 个项目的 Nx build / typecheck（共享库 + 15 个 Connector）。
- 479 个现有/更新后的 Connector 测试 + 12 个公共驱动与迁移清单测试，共 491 个通过。
- 15 个插件的 dist-first 注册、启动和销毁生命周期通过。
- 16 个 tarball 的 JS/类型入口存在；Connector 对公共库的依赖均已转换为 `^0.1.0`，没有残留 `workspace:` 依赖。
- pnpm frozen-lockfile 安装与 diff whitespace 检查通过。

这批验收使用协议模拟和本地生命周期容器；没有代表用户授权真实厂商账号，没有发布 npm 或修改线上安装。
