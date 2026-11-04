# 部署与运行说明

整理日期：2026-11-03（2026-11-04 补充浏览器层复现命令）；对应插件版本 `@community/apps-ticket-triage` 0.1.0。

## 基线版本（复现请用这两个 SHA）

| 仓库 | 分支 / commit | 获取方式 |
| --- | --- | --- |
| `xpert-ai/xpert` | `main` @ `3ddc380ca20373f9113a77411090de3c3da75e37` | `git clone --depth 1 https://github.com/xpert-ai/xpert` |
| `xpert-ai/xpert-plugins` | `main` @ `dfad5423205811b3251628ee9bf59a79a4bcbd87` | `git clone --depth 1 https://github.com/xpert-ai/xpert-plugins` |

上表是开发与测试实际使用的版本；本 PR 的分支基于 `dfad542`。换版本后需要重新跑一遍下面第 5 节
与 [03-validation.md](03-validation.md) 里记录的内容（尤其工具参数校验那一节，它与模型适配层有关）。

## 前置条件

| 项 | 要求 |
| --- | --- |
| Node.js | 20.x（插件仓库与 harness 用 20；宿主仓库 pnpm 要求 Node ≥ 22 时另见下） |
| 包管理器 | `corepack`（仓库 `packageManager` 声明优先） |
| Xpert 平台 | 从源码或 Docker 起的本地/测试实例，`http://localhost:3000` |
| 数据库 | PostgreSQL 15 + pgvector（平台的 `DB_*` 配置） |
| 缓存 | Redis（平台的 `REDIS_*` 配置） |
| 模型 | 平台内已配置一个可用的模型提供方与凭证 |
| 账号 | 一个能安装 tenant 级插件的账号 |

## 构建插件

```bash
cd community/apps/ticket-triage
corepack pnpm install
corepack pnpm run build
```

产物：

```
dist/index.js                     插件入口（meta / templates / register）
dist/remote/ticket-triage.html    自包含工作台视图（UI 已内联，无外部资源）
dist/ticket-triage-assistant.yaml 助手模板 DSL
dist/lib/**                       服务、中间件、视图提供者
```

`corepack pnpm run verify:dist` 会检查上面四项是否齐全、HTML 是否只有一个内联 module、DSL 是否包含中间件连接。

## 部署到运行中的平台

```bash
# 在 Xpert 宿主仓库根目录执行
corepack pnpm plugin:deploy:local \
  --plugin-dir /绝对路径/xpert-plugins/community/apps/ticket-triage \
  --api-url http://localhost:3000 \
  --token "$XPERT_TOKEN" \
  --org-id "$XPERT_ORG_ID"
```

要点：

* 必须提供认证（`--token`、本机凭据，或 `--username` / `--password`）；没有认证时只有 `--dry-run` 能走完。
* 命令先跑 `build` + `verify:dist` + `test`，再调用平台的 refresh 接口；插件从未安装过时自动回退为源码安装（`source: code` + `workspacePath`）。
* `xpert.plugin.level=tenant` 必须配 `--scope tenant`（本插件声明为 tenant 级，用 organization scope 会被拒）。
* 若输出 `restartRequired`，重启 API 后插件才真正生效。
* `--skip-build` / `--skip-test` 只在已经构建过、只想重新部署时使用。
* `--plugin-dir` 给的是**宿主进程能读到的路径**。本轮 API 与插件源码在同一台机器上，所以直接给本地目录成立；按题面 [112]，若宿主在另一台机器，必须把构建产物放到宿主可访问的位置，不能直接用个人电脑路径（我们这轮没有走远程宿主）。

## 环境变量

平台侧（宿主仓库）：

```bash
# 数据库与缓存（示例值，按实际环境替换）
export DB_TYPE=postgres
export DB_HOST=<db-host>            # 数据库主机；本机私网地址已隐去
export DB_PORT=5432
export DB_NAME=ocap
export DB_USER=postgres
export DB_PASS=<password>
export REDIS_HOST=<redis-host>      # 缓存主机；本机私网地址已隐去
export REDIS_PORT=6379
export REDIS_PASSWORD=<password>
export API_BASE_URL=http://localhost:3000
export CLIENT_BASE_URL=http://localhost:4200
```

插件侧只用到部署变量，不含任何密钥：

```bash
# deploy.env.example
XPERT_API_URL=http://localhost:3000
XPERT_TOKEN=            # 具备 tenant 插件安装权限的账号 JWT
XPERT_ORG_ID=           # 安装所属组织
```

模型凭证在平台内配置（模型提供方 → 新建），插件不读取也不保存模型 key。**仓库内不提交任何真实密钥**，示例文件只有占位符。

## 启动顺序

1. 起数据库与 Redis（本机 Docker 或虚拟机均可）。
2. 宿主仓库：`corepack pnpm install`，然后 `corepack pnpm schema:sync`（建表 + 校验）。
3. 起 API：`corepack pnpm start:api`（或直接用已构建产物 `node dist/apps/api/main.js`）。
4. 起 Cloud UI：`corepack pnpm start:cloud`，浏览器打开 `http://localhost:4200`。
5. 首次使用需初始化数据：`corepack pnpm seed:module Default`（建默认租户、组织、角色与管理员账号；**只传位置参数，写成 `--name Default` 会变成 `--name "--name" "Default"`**）。seed 会重置数据库，之后必须重启 API。
6. 登录 → 安装模型提供方 → 配置模型凭证。
7. 按上文部署本插件（必要时重启 API）。
8. 从模板「Support ticket triage / 客服工单分诊」创建助手，打开工作台视图。

## 验证插件的安装状态

```bash
curl --noproxy '*' -s "$XPERT_API_URL/api/plugin/by-names" \
  -H "Authorization: Bearer $XPERT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"names":["@community/apps-ticket-triage"]}'
```

返回里应能看到插件记录与 `enabled` 状态；看不到说明安装没落到当前租户/组织范围。

## 浏览器层复现（界面集成 / 平台业务流程）

```bash
# 1) 构建出工作台视图的 self-contained HTML
corepack pnpm run build            # -> dist/remote/ticket-triage.html

# 2) 平台 UI 侧：截图脚本用系统 Chrome 驱动，不需要 playwright install
export PLAYWRIGHT="file://<platform-repo>/node_modules/playwright-core/index.mjs"
export XPERT_UI_URL=http://127.0.0.1:4300 \
       XPERT_WORKSPACE_ID=<workspace-uuid> XPERT_XPERT_ID=<assistant-uuid> \
       XPERT_EMAIL=you@example.com XPERT_PASSWORD=...
node tests/browser/capture-chat.mjs

# 3) 工作台视图侧：配了 app platform 的环境直接访问 /chat/...；
#    没配的环境用自带的最小宿主（只转发协议，不造假数据）
XPERT_API_URL=http://127.0.0.1:3000 XPERT_EMAIL=... XPERT_PASSWORD=... \
XPERT_TENANT_ID=<tenant-uuid> XPERT_ORG_ID=<org-uuid> XPERT_XPERT_ID=<assistant-uuid> \
node tests/browser/serve-host.mjs        # -> http://127.0.0.1:4310

HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage persisted
HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage empty
HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage failed
HOST_URL=http://127.0.0.1:4310 node tests/browser/capture-board.mjs --stage retry
```

`empty` 与 `failed` 两个状态需要一个数据库前置动作，SQL 写在
[tests/browser/README.md](../../tests/browser/README.md)。

## 已知环境坑（本机实测）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `plugin-dev-harness` 报 `Cannot access 'STATE_VARIABLE_HUMAN'` | Node 22 与 harness 不兼容 | 用 Node 20 运行 harness |
| `pnpm install` 在 `ffmpeg-ffprobe-static` 处失败 | 该包 postinstall 需要网络/二进制下载 | `corepack pnpm install --ignore-scripts` |
| `plugin-dev-harness` 目录里没有 `node_modules` | 上层 `pnpm-workspace.yaml` 把它 hoist 到仓库根 | `cd plugin-dev-harness && corepack pnpm install --ignore-workspace` |
| 宿主仓库 `tailwindcss` 构建报 `EINVAL` / `ENOENT` | Windows 不能直接 exec `.cmd`/无扩展名 shim | 远程组件构建脚本改为 `cmd.exe /c <bin>.CMD`（仅本机补丁，未进 PR） |
| 平台日志大量 `package.json not found at plugins/global/...` | `PLUGINS` 环境变量列出的 provider 插件未安装 | 从界面安装所需 provider，或清空该变量 |
