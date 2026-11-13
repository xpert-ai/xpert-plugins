# 会后行动项核对工作台：面试交付清单

整理日期：2026-11-01。依据《Xpert 业务应用开发面试说明》第八节“最终交付清单”，并核对第五节 Git/PR 要求。本文记录材料准备状态，不把“文档已写好”当成测试通过或 PR 已提交。

## 1 当前交付结论

插件版本 **0.1.5** 已安装到 Xpert，完成真实 AI、人工核对、确认与恢复验证，以及新增会话同步联调。用户已反馈会话同步手工验证可以正常使用。

七项材料已有对应文件；本次补齐配置示例、演示脚本、最新验证摘要、README 异常截图及会话同步截图。**本材料与插件代码一起纳入本地功能提交；尚未推送功能分支，也未创建 PR，最终远程交付仍未完成。**不要求发布 npm，也不需要合并 PR。

## 2 七项材料检查

| 任务书要求 | 当前交付入口 | 状态与检查点 |
| --- | --- | --- |
| 产品说明 | [需求方案](meeting-action-review-plan.md)第 1～5 节；[插件 README](../community/apps/meeting-action-review/README.md) | 已准备：会议整理者、从杂乱原文手工整理的痛点、输入→AI 草稿→人工核对→保存确认流程；第 5 节含页面布局草图，实际截图另行标注 |
| 应用插件源码 | [插件目录](../community/apps/meeting-action-review/)；[开发设计](meeting-action-review-development-design.md)；[数据库设计](meeting-action-review-database-design.md) | 已准备：一个 Agent、一个中间件、两个工具、一个工作台、两张表；有依赖和行为测试；复用共享 shadcn UI，参考智能维保/Meetings，说明 AGPL-3.0 来源；待纳入 Git 提交 |
| 运行说明 | [README](../community/apps/meeting-action-review/README.md)；[使用步骤](../community/apps/meeting-action-review/docs/usage.mdx)；[环境变量示例](../community/apps/meeting-action-review/docs/env.example)；[插件配置示例](../community/apps/meeting-action-review/docs/plugin-config.example.json) | 已准备：构建、归档安装、tenant 级作用域、必要 API 重启、模板创建、模型配置、发布和打开工作台；凭据不打包 |
| 运行截图与演示 | [README 实际截图](../community/apps/meeting-action-review/README.md#实际平台截图)；[演示脚本](../community/apps/meeting-action-review/docs/demo.md) | 已准备：输入、AI 结果与依据、确认后恢复、会话同步、真实超时异常；结果与确认态已重截为 0.1.5 的左右同步全图；旧图仅在历史验证中标注保留；图片位于插件 docs/images，通过相对路径嵌入 |
| 验证结果 | [插件验证记录](../community/apps/meeting-action-review/docs/verification.md)；[会话同步验收](meeting-action-review-chat-sync-validation.md) | 已准备：0.1.4 主流程和故障重试、0.1.5 的 27 项自动化测试及真实双栏联调；模拟与真实结果分开列出，不声称 A01～A29 全覆盖 |
| AI 协作说明 | [协作记录](../community/apps/meeting-action-review/docs/ai-collaboration.md) | 已准备：Codex 与实际业务模型、产品收敛、布局调整、平台接入问题和会话同步边界；开发工具底层模型标识未核实，未编造 |
| 已知限制 | [README 限制](../community/apps/meeting-action-review/README.md#设计来源与限制)；[未验证专项](../community/apps/meeting-action-review/docs/verification.md#尚未执行的专项检查) | 已准备：文本输入、单整理者、确认后只读、无任务派发；平台原生控制保持不变；跨账号、在途重启、复杂语义和最大输入等未完成专项明确列出 |

## 3 可复现版本与安装包

| 项目 | 记录 |
| --- | --- |
| 插件包名 / 版本 | @xpert-ai/plugin-meeting-action-review / 0.1.5 |
| 功能分支 | feat/meeting-action-review |
| 插件 main 开发基线 | 60794aa72edb1fddffebd5e5d071619b8c29014b |
| 平台源码与实际测试版本 | 83e0d4ce9462996e7a4c24517f63559bedf23b7e / Xpert 3.29.1 |
| SDK / contracts | 3.29.1 / 3.29.1 |
| 实际环境 | Windows 开发、SSH/WSL Docker 平台；API Node 20.20.2；本地构建 Node 26.8.1、pnpm 8.15.8 |
| 业务模型 | 平台已有 deepseek/deepseek-v4-pro，输出预算 8192；无需沙盒或搜索服务 |
| 最近正式安装产物 | xpert-ai-plugin-meeting-action-review-0.1.5.tgz，402318 字节 |
| 产物 SHA-256 | cc558c9de8c9b9cc018db5afd0520c77801054c1d65df4b2a1691678928221a4 |
| 资料更新后的交付归档 | 0.1.5，952727 字节；运行文件与上述已安装包逐文件一致 |
| 交付归档 SHA-256 | 68d3d7009194137e05ff97d9fc933f89a92fc435d80f302780e279bb1de02f9e |
| 交付 commit / PR | 本地功能提交用 `git log -1 --format=%H` 查询；PR 尚未创建，不将 main 基线 SHA 冒充功能提交 SHA |

保留原已安装归档及其校验值；本次另行生成包含最新交付资料的 0.1.5 归档，并逐文件确认 dist、助手模板和 package.json 共 41 个运行文件与已安装包完全一致。两个 SHA-256 不同来自文档/图片更新，没有重新部署平台。最终 PR 仍以源码与文档为审阅入口，归档不加入 Git。

## 4 Git 与 PR 最后步骤

已只读核对：origin 为个人 Fork `Yukixieyuya821/xpert-plugins`，upstream 为 `xpert-ai/xpert-plugins`，当前分支正确。上述 SHA 是开发基线；功能提交包含本清单和插件代码，实际提交 SHA 由 Git 历史确定。

- [x] 从 main 基线建立功能分支。
- [x] 完成实现、安装与真实业务流程验证。
- [x] 准备七项材料、相对图片链接、配置示例与 [PR 描述草稿](meeting-action-review-pr-draft.md)。
- [x] 已审查当前工作区差异，修复无关依赖解析并通过 frozen 校验；实际暂存后仍需复核。
- [x] 当前候选提交文件的敏感信息与临时文件检查完成，未发现真实凭据；后续新增文件仍需复核。
- [x] 本插件、对应文档/图片及必要 lockfile 作为一个本地功能提交；提交前检查暂存差异、实体命名和冻结依赖。
- [ ] 推送个人 Fork 的 feat/meeting-action-review，创建指向 xpert-ai/xpert-plugins:main 的 PR。
- [ ] 在 PR 中补最终功能 commit、实际测试版本和材料链接，检查 GitHub 图片实际显示，提交 PR 链接。

材料准备阶段未执行 Git 写操作；后续按用户授权仅完成本地功能提交，不推送、不创建 PR，也不向面试方发送消息。

## 5 面试前快速检查

1. 平台可登录，组织、助手、模型及工作台可用；不要把登录凭据写进演示材料。
2. 先排练一次 demo.md 的短会议主流程；复杂会议作为补充，不用复杂样例替代稳定演示。
3. 保留已确认记录与专用失败/重试记录，能解释其来源。异常截图是专用超时试验，不冒充正常模型故障。
4. 能讲清两张表为何分开、AI 工具与人工确认的权限边界、同一会议多次尝试如何隔离，以及为什么不做任务派发。
5. 能说明左侧是 AI 初始会话，右侧保存的是人工版本；新建表单不立刻清空旧聊天。

本轮详细结论、修复与尚未覆盖项见[交付前审查](meeting-action-review-delivery-review.md)。
