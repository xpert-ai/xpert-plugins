# 验证记录

日期：2026 年 11 月 4 日，上海时间。

## 基线

- 平台：`3ddc380ca20373f9113a77411090de3c3da75e37`
- 插件：`dfad5423205811b3251628ee9bf59a79a4bcbd87`
- Skills：`5b00adc981300951d83025fab4426d7a46e177cc`
- 功能分支：`feature/resume-match`，最终应用提交 SHA 以提交说明为准，基线是开始开发时的上游 main。

三个基线已经与检查时上游 main 对照一致。平台构建重生成了 execution-observability 的远程 JS/CSS；实际平台测试版本应同时说明这些生成文件差异，不能只写 main SHA。

## 已执行

| 层次 | 命令或动作 | 结果与边界 |
| --- | --- | --- |
| 单元 | 插件目录 `corepack pnpm test` | 22 项通过；repository spy 与输入 schema，未连接真实数据库 |
| 类型 | 插件目录 `corepack pnpm typecheck` | 服务端和 Remote View 检查通过 |
| 构建 | 插件目录 `corepack pnpm build` | 构建和资源新鲜度检查通过 |
| 生命周期 | 仓库根 `node plugin-dev-harness/dist/index.js --workspace ./community/apps/resume-match --plugin @xpert-ai/plugin-resume-match` | 加载、启动、bootstrap、销毁和停止通过；启用默认 mocks |
| 元信息 | 仓库元信息检查器，使用 community 的 TypeScript 依赖 | 通过；版本、级别和命名空间从插件自身 package.json 读取 |
| 数据库集成 | 插件目录 `corepack pnpm test:integration` | 独立真实 PostgreSQL 测试数据库通过：并发重试、旧结果拒绝、重复请求、三层 scope 隔离和重连恢复；AI 输出明确为 fixture |
| 基础设施 | 独立 Compose 项目中的 PostgreSQL 与 Redis | 已启动，独立数据卷；API 启动前 public 表计数为 0 |
| 平台环境 | 官方环境检查脚本，source 模式并检查 NsJail | API、Cloud、沙箱 RPC、进程来源、插件路径白名单通过；管理员与模型连接均通过本地 UI 配置；未获取或导出用户密码、API Key |
| 界面预览 | 已有 preview fixture 与截图脚本 | 此次未作为平台验收执行；结果来自模拟数据 |
| 平台业务 | 安装、Assistant 发布、真实模型、确认与恢复、失败重试 | 已完成，详见下方实际操作记录与截图 |

生命周期首次执行暴露 CommonJS 输出与 ESM 包声明冲突；修复包声明后重新构建并通过。平台首次依赖安装在系统 Node 24 的 isolated-vm 原生构建失败；改用任务专用、官方校验和验证过的 Node 22.23.4 并以 CI 模式完成 bootstrap，避免 Less 安装脚本拉起额外的浏览器安装。不能把环境构建日志当作产品运行证据。

数据库集成脚本要求 `RESUME_MATCH_TEST_DATABASE_URL` 通过受保护的进程环境注入，并拒绝在数据库名不以 `resume_match_test_` 开头时同步 schema。必须使用空测试库，脚本结束只删除本次创建的测试记录，不清理其他记录或 schema。平台数据库与此测试库分开。

## 实际平台操作

运行环境：任务专用 Node 22.23.4 / macOS arm64，源码模式 API 3000、Cloud 4200，PostgreSQL 与 Redis 独立 Compose 项目。UI 配置的模型为 Tongyi / 百炼、北京地域、qwen3.6-plus；仅记录 UI 绑定和真实业务结果，没有读取 API Key。

1. 默认租户的本地工作区安装此插件。Assistant 模板初始化到业务组织工作空间，绑定用户配置的模型，安装并发布 v1。[证据](screenshots/assistant-installed.jpg)
2. 虚构后端岗位与虚构候选人甲创建记录 `9e69dbe5`，AI 调用工具后将草稿保存到工作台，综合分 77，分维度 85/75/70/50。[输入](screenshots/input.jpg)、[模型结果](screenshots/model-result.jpg)
3. 页面“修改人工结论”曾被后端状态校验拒绝，真实验证发现后修复：允许当前 revision 的人工修改，仍拒绝过时及并发丢失版本的写入。增加两项单测并通过。
4. 人工改写明确指出岗位未要求的学历与高并发不构成筛选条件，77 分仅演示流程。保存后刷新整个宿主页，恢复同一编号、已确认状态和改写文本。[恢复证据](screenshots/restored.jpg)
5. 创建只有占位文字的第二条虚构材料，真实模型调用失败工具，页面显示材料不足原因；点击同一记录重新分析，进入第 2 轮，材料仍不足所以再次明确失败。不是供应商网络故障，也没有把第二次失败写成成功。[重试证据](screenshots/retry.jpg)
6. 独立真实 PostgreSQL 测试验证模拟超时、两次同时重试仅一次成功、同一记录仅一行、旧 attempt 结果拒绝、重复请求幂等、人工版本修改保护、user/organization/tenant 三层隔离及断开重连恢复。模型内容为显式 fixture。

## 限制与剩余工作

- 供应商在第一个业务工具调用前就断网/拒绝时，业务记录可能仍显示等待。等待页提供原记录重新分析；未宣称自动识别全部供应商故障。此次未执行供应商断网、限流后的平台端到端恢复。
- 未使用第二个真实平台账号验收 UI 权限隔离；数据范围边界由真实数据库集成测试覆盖。
- 评分权重固定，未经真实招聘数据校准。真实模型首轮曾提出岗位未要求的学历、高并发条件，人工已纠正；后续任务提示补充禁止新增筛选条件的约束，但不能声称彻底消除了模型偏差。
- 已确认结论可以显式修订，保留 AI 原文和最新人工结论，不提供完整人工编辑历史。
- 既有 Remote View 为中文设计，完整多语言及共享组件主题规范仍需进一步整理；不宣称已完成全量 UI 规范审计。
- Fork 已建立，最终 diff、提交、PR 链接由交付说明记录；不合并 PR，不发布 npm。

## AI 协作记录

使用 Codex 协助阅读要求、查实际源码、检查本机和编写测试。真实取舍包括：沿用已有插件；拒绝用预览恢复代替数据库验收；通过生命周期测试定位包格式错误；把并发重试改为修订保护的条件更新。

模型名称以实际客户端显示为准，不根据工具名称猜测。应用真实调用使用用户在 UI 绑定的通义千问 / 百炼模型，成功草稿与材料不足失败均已在工作台验证。Codex 协作模型名称以实际客户端显示为准。
