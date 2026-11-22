# 环境阻塞与排查记录

本文记录在 Windows 上把本插件安装进 Xpert 开源版时遇到的平台侧问题、根因定位过程和当前验证边界。
写下来有两个目的：说明哪些验收项**没有**完成以及为什么，以及给平台侧提供可复现的证据。

## 1. 环境

| 项 | 值 |
| --- | --- |
| 平台 | xpert-ai/xpert，main，commit `182f2f4a7d05d968016a9ec20a93833687c4394f` |
| 插件仓库 | 本仓库，基于上游 main `63a5c222` 的功能分支 |
| 操作系统 | Windows 10 (10.0.19045) |
| Node.js | v24.16.0 |
| 包管理器 | corepack pnpm 10.24.0 |
| 运行模式 | source-hybrid（PostgreSQL / Redis 由 Docker 管理，API 与 Cloud UI 从源码运行） |
| API 启动方式 | nodemon + ts-node（平台仓库 `nodemon.json`） |

## 2. 问题一：Node 在 Windows 上无法通过 execFile 调用 npm

### 现象

从本地工作区安装插件时，暂存阶段失败，且 **npm 的 stdout / stderr 都是空的**：

```
[plugin:install:local] Plugin install failed with HTTP 400:
Failed to install plugin @community/apps-resume-screening-assistant:
... | stageWorkspacePlugin failed earlier:
Failed to install runtime dependencies for staged workspace plugin at
C:\...\plugins\global\@community\apps-resume-screening-assistant@runtime__xxx\node_modules\@community\apps-resume-screening-assistant
```

报错信息在路径后**没有跟任何 npm 输出**，这一点是定位的突破口——
说明进程根本没启动起来，而不是启动后失败。

### 根因

Windows 上 npm 实际是 `npm.cmd`（批处理文件）。Node 从 v18.20 / v20.12 起，
为了修复 CVE-2024-27980，**禁止在不带 `shell: true` 的情况下 spawn `.cmd` / `.bat`**。

最小复现（Windows，Node v24.16.0）：

```js
const { execFile } = require('node:child_process')

execFile('npm', ['--version'], (err, stdout, stderr) => {
  console.log(err?.code)      // ENOENT
  console.log(JSON.stringify(stdout), JSON.stringify(stderr))  // ""  ""
})

execFile('npm.cmd', ['--version'], (err) => {
  console.log(err?.code)      // EINVAL
})

execFile('npm', ['--version'], { shell: true }, (err, stdout) => {
  console.log(stdout.trim())  // 11.13.0  ← 只有这种写法可用
})
```

三种写法的输出：`ENOENT` / `EINVAL` / 成功。前两种的 stdout 和 stderr 都是空字符串，
与平台报错中"路径后没有输出"的特征完全一致。

### 受影响的代码位置

平台里有三处 `execFile` 调用 npm，全部命中这个问题：

| 文件 | 用途 |
| --- | --- |
| `packages/server/src/plugin/organization-plugin.store.ts` | 暂存安装运行时依赖（`npm install`） |
| `packages/server/src/plugin/plugin-sdk-versioning.ts` | `npm view` 查询仓库包清单 |
| `packages/server/src/plugin/queries/handlers/resolve-latest-plugin-version.handler.ts` | `npm view` 查询最新版本 |

`plugin-marketplace.service.ts` 里的 `execFile('git', ...)` 和 `execFile('tar', ...)` 不受影响，
因为 `git.exe` / `tar.exe` 是真正的可执行文件，不需要 shell。

### 影响面

影响**所有**声明了运行时 `dependencies` 的插件。插件仓库里每个社区应用的
`dependencies` 至少包含 `tslib`，因此**在 Windows 上任何社区插件都无法安装**，
与本插件无关。

### 本地临时改动

为继续验证，本地对上述三处各加了一行：

```ts
shell: process.platform === 'win32'
```

## 3. 问题二：组织初始化（bootstrap）在 Windows 上失败

### 现象

组织创建后，平台日志出现：

```
[ServerAIBootstrapService] Failed preinstalling ClawXpert plugin
  '@xpert-ai/plugin-file-memory' for organization '...': 安装插件失败：spawn npm ENOENT
  （同样失败的还有 plugin-dangling-tool-call、plugin-view-image、
     plugin-loop-guard、plugin-web-tools、plugin-model-retry）

[ServerAIBootstrapService] Skipping default primary model injection for template
  'xpert-authoring-assistant' in organization '...' because no enabled primary LLM
  copilot is configured

[ServerAIBootstrapProcessor] Failed organization bootstrap for '...':
  BadRequestException: insert or update on table "copilot_model"
  violates foreign key constraint "FK_57a3eec66a6e138cd8843992768"
    at XpertService.createInWorkspaceScope (workspace-base.service.ts:288)
    at XpertService.create (xpert.service.ts:201)
    at XpertImportHandler.importAsNewXpert (import.handler.ts:157)
    at ServerAIBootstrapService.importDefaultTemplates (bootstrap.service.ts:657)
```

### 失败链条

```
问题一（execFile('npm') 在 Windows 失败）
  └─ 供应商插件预装全部失败
       └─ 组织没有可用的主 LLM copilot（copilot.copilotModelId 为空）
            └─ applyDefaultAssistantPrimaryModel 判定"无可用的主 LLM"，跳过模型注入
                 └─ 导入默认模板时 copilot_model.copilotId 指向不存在的 copilot
                      └─ 外键约束冲突，bootstrap 整体中止
```

### 数据库侧证据

```
copilot 表：
  2abc9859-...  organizationId=279ce7a3-...  role=primary  enabled=true
                name=(空)  copilotModelId=(空)   ← 主 copilot 未绑定模型
  a863733d-...  organizationId=(空)  role=primary
  a247c74d-...  organizationId=(空)  role=secondary

copilot_provider 表：2 行，providerName 均为空
copilot_model  表：0 行
```

`copilot_model` 的外键定义：

```sql
FOREIGN KEY ("copilotId") REFERENCES copilot(id) ON DELETE SET NULL
```

### 对使用者的实际影响

- 平台内**无法配置任何模型**：模型下拉框显示"没有匹配的模型"
- 因此无法基于助手模板创建可用的智能体
- 因此附录二中"完整业务流程""一次真实 AI 处理"两项在平台内**未能完成**

### 已尝试但无效的规避方式

- 重启平台：bootstrap 由「组织创建」事件触发，Bull 队列以
  `jobId: org-bootstrap:<orgId>` 去重，失败后重试次数用尽，重启不会重跑
- 新建组织：会触发新的 bootstrap，但链条中的问题一未修时同样失败

### 连带的界面症状

**助手模板无法初始化**。插件安装后，插件卡片上的「初始化」可以打开详情对话框
（能看到助手模板、应用、视图、中间件工具四类组件），但对话框内点「初始化」无法完成
创建助手。平台日志中没有对应的错误记录，失败发生在前端或请求未发出。

按平台代码，助手模板初始化要创建一个 Xpert，而 Xpert 需要绑定主 LLM copilot；
平台因上述链条没有可用模型，创建无法完成。这与本节的问题是同一个根因。

### 另一个界面问题

**本地安装的插件，点名字跳转市场详情会报错**。插件列表里点击插件名称会导航到市场详情路由
（`openPluginPage` → `pluginMarketplaceDetailCommands`），而本地工作区安装的插件不在市场中，
页面报 `Plugin "@community/apps-resume-screening-assistant" was not found`。
本地插件的详情入口实际在卡片上的「初始化」按钮（`openInstallOptions` → `openPluginDetails`），
但界面上没有任何提示说明这一点。

## 4. 当前验证边界

### 已验证

- 插件构建通过（`pnpm --filter @community/apps-resume-screening-assistant build`）
- 插件安装成功：`{"success": true, "name": "@community/apps-resume-screening-assistant", "currentVersion": "0.1.0", "restartRequired": true}`
- 平台重启后插件出现在已加载列表：`system:global @community/apps-resume-screening-assistant`
- 平台识别出全部四类组件：助手模板、业务应用、视图（Resume Screening Workbench）、中间件工具（Resume Screening Tools）
- 评分规则与结构化抽取在**独立脚本**中经真实模型验证（`scripts/analyze-resume.mjs`，DeepSeek）
- 本地预览中完整界面流程可运行，包含真实模型调用与 PDF 解析失败的处理

### 未验证

- 平台内基于助手模板创建智能体
- 工具与工作台绑定后的端到端流程
- 平台内的保存与恢复
- 平台内的失败重试场景

未验证项的共同阻塞点是平台侧的组织初始化失败，不是插件本身。

## 5. 附：本工作中对插件的修正

排查过程中发现插件自身的两处元信息缺失，已修复：

`package.json` 缺少 `xpert.plugin` 字段，导致平台在安装前的预检查阶段
读不到插件的 level（`readPluginLevelFromManifest` 读的是 manifest 而非代码），
默认按 `organization` 处理，随后加载插件时发现实际是 `system`，报作用域冲突。

```json
"xpert": {
  "plugin": {
    "level": "system",
    "artifactNamespace": "resume_screening"
  }
}
```

`src/index.ts` 中的 `meta.level` 与 `package.json` 中的声明必须一致，
`artifactNamespace` 需与实体表名前缀 `plugin_<artifactNamespace>_<tableKey>` 对应。
