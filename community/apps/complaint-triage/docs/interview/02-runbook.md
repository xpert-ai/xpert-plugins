# 环境、构建、安装与使用

## 版本与前提

| 项 | 版本 |
| --- | --- |
| 平台 | 开源 `xpert-ai/xpert` main，commit `2b57565`（未修改），以 source 模式运行：Docker 提供 Postgres（pgvector pg15）与 Redis Stack，API 与 Cloud UI 从源码启动 |
| 插件仓库 | `xpert-ai/xpert-plugins` main，commit `9d10893` 之上的功能分支 |
| Node.js | 20.x（与官方 API 生产镜像一致；实际测试为 20.20.2）。单测另在 Node 24 上跑过 |
| 包管理器 | 平台 `pnpm@10.24.0`，本插件 `pnpm@8.15.8`，都通过 Corepack 调用，不要混用 |
| SDK | `@xpert-ai/plugin-sdk` / `@xpert-ai/contracts` 3.18.6 |

还需要：一个完成初始化的平台（有组织和具备插件安装权限的管理员账号）、一个可用的对话模型。本次使用 DeepSeek `deepseek-v4-flash`，Key 在平台 **设置 → 模型提供商** 里填写，并在同一页把它选为主提供商的**默认模型**。插件自身**没有任何配置项和环境变量**。

平台 API 进程需要能读到插件目录，并把它的上级目录加入允许列表：

```sh
# 平台根目录 .env
PLUGIN_WORKSPACE_ROOTS=<插件仓库的绝对路径>
```

## 构建与测试

在插件仓库根目录执行。本包与 `apps/dockyard` 一样是自带 lockfile 的独立包：

```sh
corepack pnpm@8.15.8 --dir community/apps/complaint-triage install --ignore-workspace --frozen-lockfile
corepack pnpm@8.15.8 --dir community/apps/complaint-triage test
```

`test` = 类型检查（服务端 + 远程界面）→ 构建 → 25 个单元测试 → `verify:dist`（重新打包并与 `dist` 逐字节比对，产物过期即失败）。构建产物：`dist/index.js`（入口）、`dist/remote/app.js|app.css`（工作台界面）、`dist/complaint-triage-assistant.yaml`（助手模板）。

生命周期检查（先按 `plugin-dev-harness/README.md` 安装并构建该工具）：

```sh
node plugin-dev-harness/dist/index.js --workspace ./community/apps/complaint-triage --plugin @community/apps-complaint-triage
```

## 安装到平台

在**平台根目录**执行。登录凭证通过当前进程环境变量传入（示例见 [deploy.env.example](deploy.env.example)），不要写进文件或命令行：

```sh
corepack pnpm plugin:deploy:local \
  --plugin-dir <插件仓库>/community/apps/complaint-triage \
  --scope tenant --api-url http://localhost:3000 --no-keychain \
  --manifest-file <临时目录>/plugin-deployment.json
```

本插件注册了数据表，属于系统级插件（`level: tenant`），所以用 **tenant** 范围安装，不带组织 ID。命令会重新构建、跑测试、校验 `verify:dist`，再安装并回读描述符。

回执里 `restartRequired: true` 时**必须重启 API**，之后插件才真正加载（重启前描述符显示 `loadStatus: failed` 是正常的）。“安装成功”不等于“助手可用”，还要完成下面几步。

## 安装后的六步核对

| 步骤 | 操作 | 通过标准 |
| --- | --- | --- |
| 1 安装插件 | 上面的 `plugin:deploy:local` | 回执 `validation` 三项 passed，`action: installed` |
| 2 重启并确认加载 | 重启 API，等待 `/api/health/ready` 返回 200 | 插件列表里状态为已加载；数据库出现 `plugin_complaint_triage_ticket`、`plugin_complaint_triage_analysis_attempt` 两张表 |
| 3 查看助手模板 | 新建数字专家时的模板列表 | 出现“客诉分诊助手” |
| 4 从模板创建助手 | 选择该模板创建 | 画布上有一个 Agent 节点连着“客诉分诊台”中间件 |
| 5 绑定工具与工作台 | 模板已绑定中间件；为 Agent 选择模型（或使用默认模型）后**发布** | 助手对话页出现“客诉分诊台”工作台入口；中间件提供三个工具 |
| 6 真实模型调用 | 见下节 | AI 建议出现在工作台，人工确认后保存，刷新仍在 |

第 3–5 步有两条路，结果相同：

- **应用的一键初始化（本次实测走的这条）**：先在左上角的范围切换器里从“租户”切到目标**组织**（管理员登录后默认在租户范围，此时无法创建助手），再打开 应用市场 → 客诉分诊台 →“应用到当前组织”。平台会创建专用工作空间、基于模板安装并发布助手，然后直接打开助手对话页和工作台。
- **手动**：工作空间里新建数字专家 → 起始方式选模板“客诉分诊助手” → 选择工作空间和模型 → 创建 → 发布。

之后插件升级了模板时，不要重新创建助手：在助手画布里点开助手头像的管理面板 →“从模版更新”→ 发布，更新的是同一个助手。

各步的实际结果与截图见 [验证记录](03-validation.md) 和 [README](../../README.md)。

## 使用步骤

1. 打开“客诉分诊助手”的对话页，进入 **客诉分诊台** 工作台（左侧是工作台，右侧是对话）。
2. 点 **新建工单**，粘贴客诉原文（10–4000 字；可点“填入示例”），选择渠道，创建。
3. 点 **AI 分析**。工单变为“分析中”，右侧对话自动发出“请分析客诉工单 TCK-…”，助手依次调用 `complaint_get_ticket`、`complaint_save_analysis`。
4. 工单变为“待确认”：核对分类、严重度及其依据、关键事实。点某条“证据 s3”可在原文里高亮对应句子；标着“无原文证据”的事实需要人工核实。
5. 在“人工确认”里按需修改，点 **确认并保存**。工单变为“已确认”，之后不可再分析或被 AI 改写。
6. 刷新页面或重新进入：工单、AI 建议、确认结果和处理记录都在。

**验证失败重试**：新建工单时展开“演示选项”，勾选“首次分析注入故障”。第一次分析会在保存时失败，横幅显示原因；点 **重试** 后第二次成功。全程只有一张工单、一份分析，处理记录里能看到两次尝试。

也可以不点按钮，直接在对话里说“请分析客诉工单 TCK-…”，走的是同一条路径、同一次尝试。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 助手对话页没有工作台入口 | 助手没有绑定“客诉分诊台”中间件，或修改后没有发布 |
| 一直“分析中”，180 秒后变为超时 | 模型调用失败或对话被中断（工作台看不到助手的运行错误）。检查模型提供商的 Key / 默认模型，然后点重试 |
| “分析请求没能发送给助手” | 右侧对话尚未就绪；等对话加载完成后重试 |
| 部署命令报 `Tenant scope requires --tenant-id` | 没有提供登录凭证（租户由登录结果推断）；设置 `XPERT_USERNAME` / `XPERT_PASSWORD` |
| 修改界面后平台里没变化 | 重新执行 `plugin:deploy:local`；若仍是旧的，重启 API 后再部署一次 |
