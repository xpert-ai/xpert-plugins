# 02 · 运行说明（面试官阅读版）

> **30 秒版**：这是一个 Xpert 业务应用插件，装进本地 Xpert 后从助手模板建一个助手就能用。复现需要两仓指定 SHA 的代码、一个 PostgreSQL + Redis、一个平台内配好的模型，以及一个能安装 tenant 级插件的账号。本文给的是**从零到跑通一次分诊**的最短路径，踩过的坑集中在文末。
>
> **看这一份能判断**：交付物是否可复现（不是"我这儿能跑"）、部署链路是否理解正确（插件怎么进平台、什么时候要重启）。
> **一键顺序**：第 2 节的 5 步。

---

## 1. 基线版本与前置条件

| 仓库 | 版本 | 获取 |
| --- | --- | --- |
| `xpert-ai/xpert` | `main` @ `3ddc380ca20373f9113a77411090de3c3da75e37` | `git clone --depth 1` |
| `xpert-ai/xpert-plugins` | `main` @ `dfad5423205811b3251628ee9bf59a79a4bcbd87` | `git clone --depth 1` |

本 PR 分支基于 `dfad542`。换了版本要重跑第 5 节与 [03-validation.md](03-validation.md) 里"工具参数校验"那一节（它与模型适配层有关）。

| 前置 | 要求 |
| --- | --- |
| Node.js | 20.x（harness 与插件仓库用 20；宿主仓库按自己的 `packageManager` 走，pnpm 11 需 Node ≥ 22） |
| 包管理器 | `corepack`（仓库 `packageManager` 优先） |
| 平台 | 本地/测试 Xpert，`http://localhost:3000`；数据库 PostgreSQL 15 + pgvector；缓存 Redis |
| 模型 | 平台内已配置可用的模型提供方与凭证（插件不读也不存模型 key） |
| 账号 | 一个能安装 **tenant 级**插件的账号（系统级安装要 SUPER_ADMIN JWT + `x-scope-level: tenant`） |

## 2. 最短路径（5 步）

```bash
# ① 构建插件（产物自包含，UI 内联进单个 HTML）
cd community/apps/ticket-triage && corepack pnpm install && corepack pnpm run build

# ② 部署进运行中的 API（在宿主仓库根执行；tenant 级必须 --scope tenant）
corepack pnpm plugin:deploy:local \
  --plugin-dir /绝对路径/xpert-plugins/community/apps/ticket-triage \
  --api-url http://localhost:3000 --token "$XPERT_TOKEN" --org-id "$XPERT_ORG_ID" --scope tenant

# ③ 若输出 restartRequired：重启 API
# ④ 从模板建助手（也可在 UI 里点）
POST /api/xpert-template/<encoded-id>/install   body: {"workspaceId":"<ws-uuid>","publish":true}
# ⑤ 打开工作台视图 → 载入演示工单 → 对助手说"给最早的一张待处理工单做分诊" → 看板点确认
```

产物与内容：

```
dist/index.js                      插件入口（meta / templates / register）
dist/remote/ticket-triage.html     自包含工作台视图（UI 已内联，无外部资源）
dist/ticket-triage-assistant.yaml  助手模板 DSL（含中间件节点与连接）
dist/lib/**                        服务、中间件、视图提供者
```

`corepack pnpm run verify:dist` 校验四项齐全、HTML 只有一个内联 module、DSL 含中间件连接。

## 3. 环境变量（只有占位符，仓库不含真实密钥）

宿主侧：

```bash
export DB_TYPE=postgres
export DB_HOST=<db-host>            # 本机私网地址已隐去
export DB_PORT=5432
export DB_NAME=ocap
export DB_USER=postgres
export DB_PASS=<password>
export REDIS_HOST=<redis-host>
export REDIS_PORT=6379
export REDIS_PASSWORD=<password>
export API_BASE_URL=http://localhost:3000
export CLIENT_BASE_URL=http://localhost:4200
```

插件侧只有部署变量（`deploy.env.example`）：

```bash
XPERT_API_URL=http://localhost:3000
XPERT_TOKEN=          # 具备 tenant 插件安装权限的账号 JWT
XPERT_ORG_ID=         # 安装所属组织
```

## 4. 平台首次启动的顺序

1. 起数据库与 Redis。
2. 宿主仓库：`corepack pnpm install` → `corepack pnpm schema:sync`。
3. 起 API：`corepack pnpm start:api`（或直接用已构建产物 `node dist/apps/api/main.js`）。
4. 起 Cloud UI：`corepack pnpm start:cloud` → `http://localhost:4200`。
5. 初始化数据：`corepack pnpm seed:module Default`（**只传位置参数**；写成 `--name Default` 会被拼成 `--name "--name" "Default"`）。seed 会重置库，之后必须重启 API。
6. 登录 → 安装模型提供方 → 配凭证。
7. 按第 2 节部署本插件（必要时重启 API）。
8. 从模板「客服工单分诊」建助手 → 打开工作台视图。

## 5. 验收：插件到底装进去了没有

```bash
curl --noproxy '*' -s "$XPERT_API_URL/api/plugin/by-names" \
  -H "Authorization: Bearer $XPERT_TOKEN" -H "Content-Type: application/json" \
  -d '{"names":["@community/apps-ticket-triage"]}'
```

能看到插件记录与 `meta`（version 0.1.0 / level tenant / types / capabilities）才算落到当前范围；模板是否出现：

```bash
GET /api/xpert-template        # tenant scope；带 organization-id 头会报 Tenant scope requests must not include Organization-Id.
```

返回体是 `{recommendedApps, categories}`，第一条应是 `@community/apps-ticket-triage:ticket-triage-assistant`（`source: plugin`）。

## 6. 部署要点（读 `deploy-local-plugin.mjs` 得出的，不是猜的）

- **必须认证**：`--token`、本机凭据或 `--username`/`--password`；没有认证时只有 `--dry-run` 能走完。
- 命令先跑 `build` + `verify:dist` + `test`，再调 refresh；从未安装过会自动回退 `source: code` + `workspacePath` 安装。
- `xpert.plugin.level=tenant` **必须**配 `--scope tenant`（用 organization 会被拒：`must use tenant scope; received organization`）。
- 输出 `restartRequired` 就重启 API，插件才真正生效。
- `--skip-build` / `--skip-test` 只在已构建过、只想重部署时用。
- `--plugin-dir` 是**宿主进程能读到的路径**。本轮 API 与源码同机，所以直接给本地目录成立；按题面 [112]，宿主在另一台机器时必须把产物放到宿主可访问位置，不能用个人电脑路径（本轮未走远程宿主）。

## 7. 已知环境坑（本机实测，全部给了解法）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| harness 报 `Cannot access 'STATE_VARIABLE_HUMAN'` | Node 22 与 harness 不兼容 | 用 Node 20 跑 harness |
| `pnpm install` 卡在 `ffmpeg-ffprobe-static` | postinstall 要下二进制 | `corepack pnpm install --ignore-scripts` |
| harness 目录没有 `node_modules` | 被上层 `pnpm-workspace.yaml` hoist | `cd plugin-dev-harness && corepack pnpm install --ignore-workspace` |
| 宿主仓库 tailwind 构建 `EINVAL`/`ENOENT` | Windows 不能无 shell spawn `.cmd`/无扩展名 shim | 构建脚本改 `cmd.exe /c <bin>.CMD`（本机补丁，未进 PR） |
| 日志刷 `package.json not found at plugins/global/...` | `PLUGINS` 变量列的 provider 未安装 | 从界面装 provider，或清空该变量 |
| 部署报 `Failed to install runtime dependencies` | 平台在 Windows 下用 `execFile('npm')`（应为 `npm.cmd`） | 见 [03-validation.md](03-validation.md) 附录的宿主补丁 |
| 模型报 `This provider has no credential schema.` | 宿主从 `file:///C:/...` 推断插件目录，前导 `/` 没剥 | 同上附录补丁第 4 条 |

## 附录 · 浏览器层复现（截图就是这么来的）

```bash
# 1) 构建视图产物
corepack pnpm run build        # -> dist/remote/ticket-triage.html

# 2) 平台 UI 侧截图（用系统 Chrome，不需要 playwright install）
export PLAYWRIGHT="file://<platform-repo>/node_modules/playwright-core/index.mjs"
export XPERT_UI_URL=http://127.0.0.1:4300 \
       XPERT_WORKSPACE_ID=<workspace-uuid> XPERT_XPERT_ID=<assistant-uuid> \
       XPERT_EMAIL=you@example.com XPERT_PASSWORD=...
node tests/browser/capture-chat.mjs

# 3) 工作台视图侧：配了 app platform 的环境直接开 /chat/...；
#    没配的环境用自带最小宿主（只转发协议，不造假数据）
XPERT_API_URL=http://127.0.0.1:3000 XPERT_EMAIL=... XPERT_PASSWORD=... \
XPERT_TENANT_ID=<tenant-uuid> XPERT_ORG_ID=<org-uuid> XPERT_XPERT_ID=<assistant-uuid> \
node tests/browser/serve-host.mjs        # -> http://127.0.0.1:4310

HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage persisted
HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage empty
HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage failed
HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage retry
```

`empty` / `failed` 需要一次数据库前置动作，SQL 在 [tests/browser/README.md](../../tests/browser/README.md)。平台自带外壳的地址形如
`/chat/x/community-apps-ticket-triage-studio-<orgId>/c?view=ticket_triage.board__ticket_triage.board-view`（`view` 参数由 `clawxpert-workbench-view-url-state.service.ts` 定义），前置条件见 [03-validation.md](03-validation.md) 已知边界第 1 条。
