# 交付核查

本应用聚焦测试与技术支持的缺陷工单信息补全：反馈录入、AI 整理、回答保存、人工核对与结果恢复。以下按原始面试说明核查本题范围，区分实现、实测证据和最终 GitHub 提交。

## 要求与证据

| 要求 | 实现及可审查证据 | 当前结论 |
| --- | --- | --- |
| 明确用户、业务痛点与取舍 | [产品规格](product-spec.md) 包含目标用户、原有沟通问题、流程、文字页面原型和不做的扩展 | 已提供 |
| 独立业务应用插件 | 本目录源码、依赖、注册、领域中间件、Workbench、实体与助手模板 | 已实现，实际宿主运行 |
| 可操作界面及完整流程 | [README](../README.md) 的真实运行图、[演示流程](demo.md)、[第三阶段](phase-three.md) | 用户已体验；真实平台操作已验收 |
| 一次真实 AI 处理 | 两轮模型脚本、真实页面重试、聊天工具启动与后台成功分别有记录 | 已通过；演示材料为虚构输入，模型调用真实 |
| 保存与恢复 | PostgreSQL 持久化、revision 检查、确认快照；API 重启、完整刷新与重新打开 | 已通过，详见[第一阶段](phase-one.md)与[第二阶段](phase-two.md) |
| 失败与重试 | 真实配置失败、输出校验与超时记录保留草稿；同记录重试成功；另有明确标记的模拟故障注入 | 已通过；真实与模拟证据分开 |
| 权限边界 | 同租户同组织下管理员与普通 APP_USER 双向测试；自己的分析与确认可用、他人的读取与写入被拒绝 | 已通过；不等同于跨租户矩阵 |
| 构建、类型与生命周期 | 单包构建、双端严格类型检查、15 项测试、dist 新鲜度、dist-first harness | 已通过；harness 基础设施为 mock |
| README 直接展示关键界面和异常 | README 中使用相对路径引用随代码提交的工作台、AI 结果和真实失败截图，配简短说明 | 已补齐 |
| 环境、安装、配置与变量示例 | [安装与复现](setup.md)、[env.example](../env.example)；插件激活、助手创建、发布与模型联调分别说明 | 已提供，实际版本已记录 |
| 复用来源与许可 | [复用说明](reuse.md)、[依赖清单](bundled-dependencies.md)、随包 LICENSE 与第三方许可原文 | 已提供 |
| AI 开发协作及候选人选择 | [协作记录](ai-collaboration.md)：无生产数据的边界选择、改名、真实失败诊断、回归验证与凭证处理 | 已提供，不要求完整对话导出 |
| 未验证部分 | README 与阶段记录列出跨租户、队列中断、长上下文、Cloud 兼容性等边界 | 已说明，不冒充全部通过 |
| Fork、功能分支及提交 | origin 为 YumiCornzheng/xpert-plugins，父仓库为 xpert-ai/xpert-plugins；功能分支为 feat/defect-intake-workbench | 已核对，提交目的分阶段记录 |
| 指向上游 main 的 PR 链接 | 目标 xpert-ai/xpert-plugins:main，来源为 Fork 的功能分支；PR 描述应链接上述材料 | 需在正式推送与创建 PR 后补交链接；本文件不冒充 PR 已提交 |

## 版本与命令

平台与插件起始 main 基线、业务代码测试提交及工具版本见 [安装与复现](setup.md)。最终交付补充只增加说明、截图、变量示例和打包许可材料，不改动已验收的业务逻辑。

```sh
# 插件仓库 community 目录
corepack pnpm --filter @community/apps-defect-intake... install --frozen-lockfile
corepack pnpm --filter @community/apps-defect-intake build
corepack pnpm --filter @community/apps-defect-intake test
corepack pnpm --filter @community/apps-defect-intake verify:dist

# 插件仓库根目录，先按该工具 README 准备其依赖及 dist
node plugin-dev-harness/dist/index.js \
  --workspace ./community --plugin @community/apps-defect-intake
```

真实平台脚本必须按 README 配置当前进程环境，分别为 `tests/live.mjs`、`tests/analysis-live.mjs` 和 `tests/access-live.mjs`。不要在日志、PR 描述或提交截图中粘贴密码、JWT、模型连接或实例标识。模型脚本消耗额度，已有成功回执时不必为整理文档重复调用。

## 打包与提交范围

分发包包含服务端 dist、正式远程 JS/CSS、入口、package metadata、README、docs、变量占位示例及许可材料。源码仓库保留测试和虚构案例；分发包不包含 node_modules、真实配置、密钥目录或私有运行回执。

本题不要求 npm 发布或合并 PR；没有新增 changeset 发布计划。最终 diff 应限于本应用目录与 community 锁文件中对应依赖，不混入宿主启动生成文件或本机运维脚本。源码、暂存区及本地提交历史的已知凭证扫描和打包内容检查分别进行，不能互相替代。

## 演示与后续

最终交付核查另在真实 UI 中完成虚构 CHAT-ACCEPT-1103 记录的确认、完整刷新与确认快照查看，截图直接放在 README。原始反馈、AI 生成事实、人工标题和未知字段保留，其他体验记录未修改。

面试使用[五分钟演示流程](demo.md)，以可复现的小闭环说明价值、取舍和工程边界。优先改进更广泛反馈样本的输出稳定性与操作可理解性；真实业务系统查询、工单分派和自动修复不在本题完成范围。
