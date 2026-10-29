# 运行说明（可复现步骤）

> 本文所有命令均在本次验证中实际执行过，输出见 [`03-validation.md`](./03-validation.md)。
> 凭证一律通过环境变量提供，仓库与本文档中不含任何真实密钥。

## 0. 基线版本（§10 要求记录）

| 仓库 | 角色 | 分支 | 基线 SHA |
| --- | --- | --- | --- |
| `xpert-ai/xpert-plugins` | 插件宿主仓库（本插件所在） | `feat/contract-review` | `9d108933273f8c9a2241a38882781a2685b6716b`（= 当时的 `upstream/main`） |
| `xpert-ai/xpert` | 平台本体 | `main` | `182f2f4a7`（实际测试版本） |

插件版本：`@xpert-ai/plugin-contract-review@0.1.0`。

## 1. 环境要求

| 组件 | 版本 / 说明 |
| --- | --- |
| Node.js | **20 或 22**（本次验证：v22.23.1） |
| pnpm | 与平台 `package.json` 的 `packageManager` 字段一致 |
| PostgreSQL / Redis | 平台的必需依赖，可用仓库自带 docker compose 起 |
| 一个可用的模型 Provider | 本次验证使用 `minimax`（凭据由平台配置提供，不入库、不入仓） |

> ### ⚠️ 关键：API 必须用 Node 启动，不能用 Bun
>
> 本次验证最初用 `bun` 启动 API，出现一连串难以定位的故障：`/api/user/me` 返回
> `TypeError: null is not an object (evaluating 'options.where')`，`/api/xpert` 403，
> 创建 workspace 报 `User scope is required`，模板安装报 `Tenant context is required`。
>
> 根因：平台的 `RequestContext` 依赖 `cls-hooked`，而后者依赖 Node `async_hooks` 的内部行为，
> Bun 未完整实现。在 Bun 下 `request.user` 恒为 `null`，于是 `PermissionGuard`、
> `XpertWorkspaceAccessService` 以及所有按用户/租户作用域的查询全部失效。
>
> 日志里的判定依据是 `Authorization context missing: userId=unknown, tenantId=unknown, roleId=unknown`。
> **改用 `node dist/apps/api/main.js` 启动后全部恢复正常。**

## 2. 构建并启动平台

```bash
# 平台 API
cd /path/to/xpert
pnpm install
pnpm build
node dist/apps/api/main.js          # 监听 :3000

# Cloud UI（另开一个终端）
cd /path/to/xpert
pnpm start:cloud                    # 监听 :4200
```

准备一个可用的登录账号，并把凭据放进环境变量：

```bash
export XPERT_API_URL=http://localhost:3000
export XPERT_UI_URL=http://localhost:4200
export XPERT_USERNAME='<你的账号>'
export XPERT_PASSWORD='<你的密码>'
export XPERT_TENANT_ID='<tenant id>'
export XPERT_ORG_ID='<organization id>'
```

登录换取 token（后续所有请求都带 `Authorization: Bearer`，以及 `organization-id` / `tenant-id` 头）：

```bash
TOKEN=$(curl -s -X POST "$XPERT_API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$XPERT_USERNAME\",\"password\":\"$XPERT_PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
```

## 3. 构建插件

```bash
cd /path/to/xpert-plugins/community/apps/contract-review
pnpm install
pnpm build
```

`pnpm build` 会依次做：构建共享 UI 包 → 前端远程组件 typecheck → esbuild 打包远程组件
（产出 `app.js` / `app.css`）→ `tsc -p tsconfig.lib.json` → 拷贝静态资源。
产物入口为包根目录的 `index.cjs`。

## 4. 安装插件

平台在**运行时**把插件包加载进自己的 Nest 容器，安装走 `POST /api/plugin`。
本次验证所用请求体（`source: "code"` + `workspacePath` 指向插件目录）：

```bash
curl -s -X POST "$XPERT_API_URL/api/plugin" \
  -H "Authorization: Bearer $TOKEN" \
  -H "organization-id: $XPERT_ORG_ID" -H "tenant-id: $XPERT_TENANT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"pluginName":"@xpert-ai/plugin-contract-review",
       "source":"code",
       "sourceConfig":{"workspacePath":"/path/to/xpert-plugins/community/apps/contract-review"}}'
```

成功的响应形如：

```json
{"success":true,"name":"@xpert-ai/plugin-contract-review","currentVersion":"0.1.0",
 "runtimeRequirements":[{"state":"loaded", "...":"..."}],"runtimeConvergence":{"generation":4}}
```

API 日志中应能看到：

```
register contract review plugin
ContractReviewPlugin dependencies initialized
```

同时在插件自己的 schema 下建出两张表：

- `plugin_contract_review_case`
- `plugin_contract_review_clause`

> ### ⚠️ 改了插件代码之后必须「重新构建 + 重新安装 + 重启 API」
>
> 本次验证踩到过：只改 `src/` 不重新 `pnpm build`，`dist/` 还是旧代码，安装上去的
> 运行时 revision 不会变；而即使重装出新 revision，平台的 `RuntimeRestartCoordinator`
> 在单副本本地开发场景下会记 `reason: "already-current"` 并**直接判定收敛完成、不真正重启进程**，
> 于是新代码并不会生效。
>
> 判定方法：看安装响应里的 `runtimeRevision` / `runtimeConvergence.generation` 是否变化，
> 以及 API 日志里是否出现 `reason":"already-current"`。要真正生效，需重启 API 进程。

## 5. 从模板创建助手

插件通过 `templates` 声明了一个助手模板（`contract-review-assistant`）。安装到目标 workspace：

```bash
curl -s -X POST "$XPERT_API_URL/api/xpert-template/<templateId>/install" \
  -H "Authorization: Bearer $TOKEN" \
  -H "organization-id: $XPERT_ORG_ID" -H "tenant-id: $XPERT_TENANT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"workspaceId":"<workspace id>","publish":true}'
```

模板的 `xpert.graph` 里已经声明好三件事，缺一不可：

1. 中间件节点（`{type:"middleware", provider:"ContractReviewMiddleware"}`）；
2. 该中间件到 Agent 的连接边；
3. `options.workbench.defaultViewKey = contract-review__contract_review_workbench`。

## 6. 启用对话应用

助手默认没有开对话应用，直接访问路由会 403。开启：

```bash
curl -s -X PUT "$XPERT_API_URL/api/xpert/<xpertId>/app" \
  -H "Authorization: Bearer $TOKEN" \
  -H "organization-id: $XPERT_ORG_ID" -H "tenant-id: $XPERT_TENANT_ID" \
  -H 'Content-Type: application/json' -d '{"enabled":true}'
```

## 7. 打开工作台

```
http://localhost:4200/x-chatkit/x/contract-review-assistant
```

> 注意路由是 `/x-chatkit/x/:name`。直接访问 `/x/:name` 会被重定向走。

进入后**需要点右上角的「打开视图」按钮**（`aria-label="打开视图"`）才会展开工作台面板；
面板内容是 `about:srcdoc` 的 iframe。

## 8. 插件配置

| 配置项 | 环境变量 | 默认 |
| --- | --- | --- |
| `enabled` | `CONTRACT_REVIEW_ENABLED` | `true` |
| `defaultPageSize` | `CONTRACT_REVIEW_DEFAULT_PAGE_SIZE` | `25` |
| `extractionTimeoutSeconds` | `CONTRACT_REVIEW_EXTRACTION_TIMEOUT_SECONDS` | `180` |

读写插件配置：

```bash
# 读
curl -s -X POST "$XPERT_API_URL/api/plugin/configuration" ... \
  -d '{"pluginName":"@xpert-ai/plugin-contract-review"}'

# 写
curl -s -X PUT "$XPERT_API_URL/api/plugin/configuration" ... \
  -d '{"pluginName":"@xpert-ai/plugin-contract-review",
       "config":{"enabled":true,"defaultPageSize":25,"extractionTimeoutSeconds":180}}'
```

**注意**：`extractionTimeoutSeconds` 与 `defaultPageSize` 都会在**每次请求时**读取，
改完立刻生效、无需重启；但视图 manifest 里声明的 `dataSource.querySchema.defaultPageSize`
是宿主在注册时缓存的一次性快照，改配置不会刷新它。

## 9. 验证

见 [`03-validation.md`](./03-validation.md)（含每一步的实际输出与数据库核对结果）。
