---
title: 环境与安装
description: 在独立测试平台安装报价助手并复验文字、图片与权限边界
---

## 1. 准备隔离的 Xpert 平台

准备独立的 Xpert Community Edition、PostgreSQL 和 Redis。在 `Default Tenant` 下创建测试组织和私有工作区，并使用有管理权限的测试 `SUPER_ADMIN` 和合成数据。API 和 Web 必须使用回环 HTTP(S) 来源（`localhost`、`127.0.0.1` 或 `[::1]`）。Web 来源须满足浏览器安全上下文要求并加入 API 的 CORS 配置。

参考环境为宿主 Node.js `24.16.0`、Corepack `0.35.0`、API 容器 Node.js `20.20.2`，运行时 SDK 和 contracts 均为 `3.33.1`。分别在 Xpert 源码根目录（pnpm `10.24.0`）和插件仓库的 `community`（pnpm `8.15.8`）运行 `corepack pnpm`。[Xpert 自托管源码基线](https://github.com/xpert-ai/xpert/tree/ba8736c897474f7db9a261aa5f64d95860bb9f60)

## 2. 构建并加载系统插件

从插件仓库的 `community` 执行。Linux 容器部署需要在兼容的 Linux 环境安装依赖和构建，并保留 pnpm 工作区符号链接。

```sh
corepack pnpm --filter @xpert-ai/plugin-manufacturing-quotation... install --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build
corepack pnpm --filter @xpert-ai/plugin-manufacturing-quotation typecheck
corepack pnpm --filter @xpert-ai/plugin-manufacturing-quotation test
corepack pnpm --filter @xpert-ai/plugin-manufacturing-quotation build
corepack pnpm --filter @xpert-ai/plugin-manufacturing-quotation verify:dist
```

按下列配置填写 Git 忽略的 `community/.env`，其中租户为 `Default Tenant` 的 UUID，用户名为测试 `SUPER_ADMIN` 的登录邮箱。[community 环境变量示例](../../../env.example)

```dotenv
XPERT_API_URL=http://127.0.0.1:3000
XPERT_TENANT_ID=
XPERT_USERNAME=
XPERT_INSTALL_SCOPE=global
XPERT_PLUGIN_NAME=@xpert-ai/plugin-manufacturing-quotation
XPERT_PLUGIN_WORKSPACE_PATH=/opt/xpert-workspaces/xpert-plugins/community/apps/manufacturing-quotation
```

`XPERT_PLUGIN_WORKSPACE_PATH` 必须是 API 进程可读的绝对路径。Docker 部署时，给 `api` 与 `schema-sync` 挂载同一插件数据卷 `/srv/xpert/plugins`，并将插件仓库只读挂载到两个容器的 `/opt/xpert-workspaces/xpert-plugins`。为两个服务配置下列允许列表，并保留镜像原有的内置插件目录。已启动的 API 需要用同一 Compose 配置重建容器以应用这些设置。

```yaml
PLUGIN_WORKSPACE_ROOTS: /opt/xpert-workspaces/xpert-plugins,/srv/xpert/built-in-plugins,/srv/xpert/packages/plugins
```

从 `community` 运行以下 Bash 命令首次安装 `0.1.0`。隐藏输入测试管理员密码，登录 JWT 仅在内存中使用。

```bash
read -rsp 'Xpert test administrator password: ' XPERT_PASSWORD
printf '\n'
export XPERT_PASSWORD
node --env-file=.env --input-type=module <<'JS'
import assert from 'node:assert/strict'

const { XPERT_API_URL, XPERT_TENANT_ID, XPERT_USERNAME, XPERT_PASSWORD,
  XPERT_INSTALL_SCOPE, XPERT_PLUGIN_NAME, XPERT_PLUGIN_WORKSPACE_PATH } = process.env
const api = URL.parse(XPERT_API_URL)
assert.ok(api && ['http:', 'https:'].includes(api.protocol) &&
  ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname) && api.pathname === '/' &&
  !api.username && !api.password && !api.search && !api.hash, 'Use your isolated loopback Xpert API origin')
assert.ok(XPERT_INSTALL_SCOPE === 'global' && XPERT_PLUGIN_NAME === '@xpert-ai/plugin-manufacturing-quotation' &&
  XPERT_TENANT_ID && XPERT_USERNAME && XPERT_PASSWORD && XPERT_PLUGIN_WORKSPACE_PATH,
  'Set the Default Tenant install environment and the test administrator login')

const headers = { 'content-type': 'application/json', 'tenant-id': XPERT_TENANT_ID, 'x-scope-level': 'tenant' }
const post = (path, body, token) => fetch(new URL(path, api), {
  method: 'POST',
  headers: token ? { ...headers, authorization: `Bearer ${token}` } : headers,
  body: JSON.stringify(body),
  redirect: 'error',
  signal: AbortSignal.timeout(120_000),
})
const login = await post('/api/auth/login', { email: XPERT_USERNAME, password: XPERT_PASSWORD })
assert.ok(login.ok, `Test administrator login returned HTTP ${login.status}`)
const auth = await login.json()
assert.ok(typeof auth?.token === 'string' && auth.token && auth.user?.role?.name === 'SUPER_ADMIN',
  'A test SUPER_ADMIN login is required')
const response = await post('/api/plugin', {
  pluginName: XPERT_PLUGIN_NAME, version: '0.1.0', source: 'code',
  sourceConfig: { workspacePath: XPERT_PLUGIN_WORKSPACE_PATH },
}, auth.token)
assert.ok(response.ok, `System plugin staging returned HTTP ${response.status}`)
console.log('System plugin staged')
JS
unset XPERT_PASSWORD
```

更新时重新构建，再在租户插件管理中选择「从本地工作区重新加载插件」。安装或更新后同步隔离数据库的插件表，再重启 API。在 Xpert 的 Compose 目录沿用测试环境的项目名和配置运行。

```sh
docker compose run --rm schema-sync
docker compose up -d --no-deps --force-recreate api
```

源码部署时，将 `XPERT_PLUGIN_WORKSPACE_PATH` 设为宿主可读的插件绝对路径，将插件仓库加入 API 和结构同步进程的 `PLUGIN_WORKSPACE_ROOTS`，在 Xpert 根目录运行 `corepack pnpm schema:sync` 后重启 API。确认 `/api/health/ready` 返回 200，且 `Default Tenant` 的插件管理显示 `@xpert-ai/plugin-manufacturing-quotation@0.1.0` 已加载。

## 3. 配置 DeepSeek 并发布测试助手

1. 在 `Default Tenant` 安装 Xpert 原生 `@xpert-ai/plugin-deepseek`（参考版本 `0.1.5`），按平台要求重启。在测试组织的模型管理中配置 `deepseek` 连接与凭据，启用支持视觉输入和工具调用的 `deepseek-flash`。
2. 将其设为组织主模型以供图片转录。在「探索 → 助手模板」将「针对管件铸造企业的报价助手」安装到私有测试工作区，或更新已有测试助手草稿。助手的候选识别选择同一个模型连接。组织主模型和助手绑定均设为 `thinking=false`、`max_tokens=4096`、`maxRetries=0`。发布后回读模型和参数，确认包含「管件铸造企业询价核对」中间件。
3. 保留模板的助手名称。用尚未个人绑定该助手的测试账号，在左侧「助手」列表点击名称，默认进入报价工作台。子菜单「报价工作台」以最大化视图打开，对话页仍可提交开场问题。

未安装宿主补丁时，上述宿主基线会从嵌入式侧栏隐藏已个人绑定的默认助手。此时可通过平台原生工作台路由打开已发布助手：

```text
<平台 Web 地址>/chat/x/<助手 ID 或 slug>/c
```

将占位符替换为当前部署环境的 Web 地址和已发布助手的 ID 或 slug；助手 ID 可从已发布助手详情取得。打开前请登录、切换到助手所在组织，并确认当前账号有访问该助手的权限。

README 中的历史截图使用独立的 Xpert Web 补丁让已个人绑定的默认助手继续显示，该补丁不在插件 PR 中。

2026-11-13，已在上述基线的官方 API 和 Web 镜像上完成无宿主补丁复验。未绑定的临时助手可从原生侧栏进入工作台，已绑定助手可通过无参数直达地址打开、刷新并进入新建询价表单。完整报价用例使用原生直达路由并显式指定工作台视图和分栏布局。真实 DeepSeek 文字识别和合成 PNG OCR（保留转录原文）后的商品识别均通过，人工确认后分别报价 `15.51 CNY` 和 `14.64 CNY`，刷新及 API 回读一致，0 箱输入被拦截。原有 25 条询价详情保持一致，新增 2 条合成报价，临时助手已清理，原助手与个人绑定未变。

此次复验复用既有隔离数据库和模型配置，未重新验证全新数据库安装，也不代表 Cloud 托管环境或生产验收。

## 4. 运行真实平台验收

在 `community/apps/manufacturing-quotation` 将 [.env.example](../.env.example) 复制为私有的 `.env.acceptance`。填入回环 API/Web 地址和管理员邮箱。租户与组织 ID 取自选中测试组织后的请求头 `Tenant-Id`、`Organization-Id`，组织名称取自组织切换器。助手与工作区 ID 分别取自已发布助手详情、测试工作区详情。确认环境隔离后设 `MANUFACTURING_ACCEPTANCE_ISOLATED=1`。

浏览器用例需要 Chrome 和 `playwright-core@1.61.0`。将 `MANUFACTURING_PLAYWRIGHT_MODULE` 指向现有包目录，或在独立临时目录安装。使用自备 Chromium 时，在 `MANUFACTURING_BROWSER_PATH` 填写可执行文件路径。

```bash
manufacturing_browser_deps=$(mktemp -d)
npm install --prefix "$manufacturing_browser_deps" --no-save --ignore-scripts playwright-core@1.61.0
export MANUFACTURING_PLAYWRIGHT_MODULE="$manufacturing_browser_deps/node_modules/playwright-core"
```

在同一终端隐藏输入管理员密码，按顺序运行验收。`entry-browser.mjs` 通过侧栏查找助手。使用原生宿主时，确保 `MANUFACTURING_ASSISTANT_ID` 对应的测试助手尚未被该测试账号设为个人默认绑定。已绑定助手的直达入口可按第 3 节手动复验。

```bash
read -rsp 'Xpert test administrator password: ' XPERT_TEST_ADMIN_PASSWORD
printf '\n'
export XPERT_TEST_ADMIN_PASSWORD
node --env-file=.env.acceptance acceptance/entry-browser.mjs
node --env-file=.env.acceptance acceptance/browser.mjs
node --env-file=.env.acceptance acceptance/browser.mjs --image
node --env-file=.env.acceptance acceptance/browser.mjs --image --keep-ocr-text
node --env-file=.env.acceptance acceptance/mvp-boundaries.mjs --browser
node --env-file=.env.acceptance acceptance/model-failure.mjs
unset XPERT_TEST_ADMIN_PASSWORD
```

浏览器全流程的预期报价为文字 `15.51 CNY`、合成图片 `14.64 CNY`。多人验收创建三个临时 `VIEWER` 并向其中两人共享测试助手，包含 120 秒识别过期等待。脚本结束时撤回授权、软删除临时账号并回读共享状态。模型失败验收在测试工作区创建临时助手以复现失败和同单重试，最后删除临时助手入口。

结果和截图写入插件目录的 `acceptance/.local/`。合成询价会留在隔离数据库中，临时助手生成的技术主体也可能保留。运行中断或清理失败时，在测试环境核对残留的临时账号、授权与助手入口。[验证记录](verification.md)
