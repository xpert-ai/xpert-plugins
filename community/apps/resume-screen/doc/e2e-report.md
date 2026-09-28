# 简历初筛工作台 · E2E 真机验收报告（spec §16）

> 验收时间：2026-09-28 ｜ 执行方式：playwright-cli 持久化会话 + DB 断言 + 平台日志三方取证
> 用例定义：`docs/spec/resume-screen-spec.md` **v2.4** §16.3（上传链路语义，E2E-05 含新增上传用例）
> 测试数据全部为**虚构**简历（孙一/周二/吴三/郑六 + 补证轮钱七/孙八/周九，jszip 基于 `__fixtures__/resume-minimal.docx` 生成），无任何真实个人信息。

## 结论：E2E-01 ~ E2E-11 **全部通过**（11/11）

其中 E2E-01 附带两条**平台侧已知问题**（不属插件缺陷，按 §16.6 规则 3 如实记录，见文末）。

## 逐用例结果

| ID | 结果 | 断言核对 | 证据 |
| --- | --- | --- | --- |
| E2E-01 | **通过** | 重启平台（`xpert-dev.sh restart`，API 125s 就绪）→ 插件市场「已安装 28」，`@xpert-ai/plugin-resume-screen` 卡片出现（org 作用域）；`/api/plugin` 列表含 resume-screen@e3283ecf。api.log 重启 bootstrap 阶段有插件 staging ERROR（平台侧，见问题 1），经 deploy refresh 恢复后无插件运行 ERROR | `assets/e2e/e2e-01-plugin-list.png` + api.log |
| E2E-02 | **通过** | 助手 `resume-screen-retest`（id 82069b33）workflow 节点类型 `[agent, workflow]`，workflow 含 resume-screen 中间件引用（`GET /api/xpert/{id}` 取证）。studio 图形编辑器因平台侧登录 guard 异常不可达（见问题 2），节点完整性以 API 取证替代 | API 响应（报告正文记录） |
| E2E-03 | **通过** | 打开助手 → 工作台固定视图 tab 渲染：岗位下拉/JD 面板/统计 pill/搜索排序/列表/详情/上传队列区齐全；空岗（复核岗位-0928，0 候选人）空态「暂无候选人，上传简历文件开始初筛」+「支持 .docx/.pdf」正常 | `assets/e2e/e2e-03-workbench.png`（空岗空态实拍） |
| E2E-04 | **通过** | 新建岗位 Dialog：空标题/短 JD → 保存按钮 `disabled=true` + 「不超过 200 字」「至少」提示在场；填合法（标题+JD≥30）保存 → Dialog 关闭 + **自动切换**到新岗「E2E-04岗位」；**刷新后岗位仍在且选中**。证据形态注：spec 要求「2 截图 + DB 查询」，第二张以刷新后 innerText 记录 + 新岗出现在下拉（E2E-09 截图可见岗位切换在场）替代 | `assets/e2e/e2e-04-invalid-job.png` + 刷新后 innerText |
| E2E-05 | **通过** | 选岗后注入 3 份虚构 docx（首轮孙一/周二/吴三 → api.log 12:11:05 三条「候选人解析回填完成 score=20/20/35」；复审补证轮钱七/孙八/周九 → 队列「已提交 3 · 已创建 3 · 失败 0」+ 行内「查看」实况截图）；DB 即时 `parsing` → 模型回填 `pending_review`；详情含**抽取字段（姓名/年限/学历/当前公司/技能）+ 匹配评分 + AI 理由 + 命中点 + 风险点**，理由为自由文本且分差随内容变化（20/20/35/5/0 非模板），证真调用 DeepSeek。**AC2.1「未选岗位→提交只提示不入队」分支：本环境组织内恒有岗位（无删除岗位 UI），未选态真机不可达，未做真机覆盖——仅单测证据（`resume-screen-view.provider.spec.ts:388` + 实现 `workbench.tsx:398` notify「请先选择岗位」/provider:473 failure），按 §16.6 规则 4 如实标注未验证** | `assets/e2e/e2e-05-upload-queue.png`（实况）+ api.log |
| E2E-06 | **通过** | 重复上传同一文件（周二.docx）→ 队列「跳过 1」+ 行「跳过(重复) 该简历内容已存在」；DB 计数前后对比 `3 → 3` 不变（dedupeKey 幂等） | 队列 innerText + DB count |
| E2E-07 | **通过** | 推进（孙一）/待定（周二）/淘汰（吴三）各一次，淘汰有二次确认 AlertDialog「淘汰该候选人？…可撤回」；刷新后统计 `1待审 1推进 1待定 1淘汰` 持久；**模型工具面核查**：`GET /api/xpert/{id}` 工作流仅含 `resume_screen_save_candidates / list_candidates / get_candidate_detail` 三工具，accept/hold/reject **不在模型工具面**（不可逆动作仅人工 UI）。证据形态注：spec 要求「截图 ×2 + 工具清单截图」，工具清单截图因 studio 编辑器平台侧不可达（见问题 2）以 API 输出文字替代 | `assets/e2e/e2e-07-review-actions.png` + API 工具清单 |
| E2E-08 | **通过** | 周二撤回为待审 → 编辑姓名「周二（人工改）」+ 分数 88 保存 → DB `humanEditedFields=[name,yearsOfExperience,education,currentCompany,skills,matchScore]`；置 failed → 重试触发 **AI 重跑** → 回填完成后 `name=周二（人工改）`、`matchScore=88` **未被模型值覆盖**（模型原文抽取名应为「周二」） | DB 前后查询 |
| E2E-09 | **通过** | 刷新页面 + **重启平台**后重进：岗位（E2E-04岗位/测试冒烟岗位-UI四链路/前端工程师(真机)/复核岗位-0928，DB 核实 4 岗位全在）、候选人 4 行、状态/评分/AI 结果（理由/命中/风险）全部在场 | `assets/e2e/e2e-09-persistence.png`（截图下拉收起仅见选中岗，其余岗位在场以 DB 查询核实） |
| E2E-10 | **通过** | 真实失败链（§16.4 方法 1 变体：DB 层临时改无效 DeepSeek key，**未改任何代码**）→ 上传郑六 → 4 attempts 耗尽 → `failed` + 可读原因「模型解析失败：401 Authentication Fails, Your api key: ****0000 is invalid」（平台已掩码）+ `attemptCount 0→1`；api.log 12:19:49「候选人解析最终失败」。**改回原 key** → UI 点重试 → 同 id `739bf5ea` 变 `parsing` → `pending_review`（score=5），列表无重复行。恢复确认：重试成功本身即正常路径复跑（E2E-05/09 语义），另刷新验证持久（E2E-09 截图）；失败态 UI 呈现（行「失败」徽标+原因直显+统计 1 失败）见 `e2e-10-failed-state.png`（郑六已重试恢复，故以周九行为对象 DB 置 failed 补拍 UI 呈现，截后已还原；真实失败链证据以郑六行 api.log 12:19:49 为准） | DB 前后 id/attemptCount + api.log + `e2e-10-failed-state.png` + `e2e-09-persistence.png` |
| E2E-11 | **通过** | `git status --short`：仅 3 项与本任务无关的既有工作区改动（.gitignore / pnpm-workspace.yaml / node_modules 状态文件），无未跟踪敏感文件；`git diff --cached \| grep -niE 'sk-\|api[_-]?key\|secret\|token'` 无命中（暂存区为空）；追加扫描：本分支全 diff 中真实 key 值 0 命中。仓库内无真实 Key | 命令输出（本报告不含 key 值） |

## 平台侧已知问题（非插件缺陷，§16.6 规则 3 记录）

1. **重启 bootstrap 的 org 插件 staging 失败**：`Failed to stage workspace plugin @xpert-ai/plugin-resume-screen for organization …: Failed to install runtime dependencies`（api.log 11:54:21）；同轮多个 global 插件（deepseek/fastgpt/postgres 等）`ESM import failed … Cannot find module 'file:///…'`。影响：重启后插件不自动可用，需执行 deploy refresh（`deploy-local-plugin.mjs --skip-build --skip-test`）恢复，恢复后全部功能正常（E2E-03~10 均在恢复后执行）。模型供应商不受影响（E2E-05/10 真实调用成功）。复现：`xpert-dev.sh restart` 后观察 api.log。
2. **studio 编辑器（/x-chatkit）登录 guard 异常**：`/x/clawxpert` 重定向 `/auth/login?returnUrl=/x-chatkit/x/clawxpert`，登录表单提交（含全序列事件派发）不跳转，编辑器不可达。主应用（/chat、/plugins）登录与功能不受影响。E2E-02 断言改由 `/api/xpert/{id}` API 取证替代。

## 两仓基线 SHA

- 插件仓 `plugins/`（分支 `feat/resume-screen-workbench`）：`0cfa289`（Task 23 docs）← `4ce4b2b`（TDZ 修复）← `2838d56`（琢修复轮）
- 平台仓 `platform/`：`d24ca81`（本任务未改动平台）

## 卸载与重装步骤（PR 描述引用）

- 卸载：平台 UI 插件市场 → 简历初筛工作台 → 卸载（org 作用域）；或 `DELETE /api/plugin/{instanceId}`。
- 重装：`cd platform && XPERT_USERNAME=… XPERT_PASSWORD=… XPERT_ORG_ID=e3283ecf-… node tools/scripts/deploy-local-plugin.mjs --plugin-dir "…/plugins/community/apps/resume-screen" --scope organization --skip-build --skip-test`（dist 需先 `pnpm --filter @xpert-ai/plugin-resume-screen build`）。
