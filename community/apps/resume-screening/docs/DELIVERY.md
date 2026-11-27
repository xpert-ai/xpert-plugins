# 简历初筛交付与运行手册

本文说明产品范围、实现、环境配置、六步安装与使用、验收方法、AI协作和已知限制。实际截图见[插件README](../README.md)，检查结果见[验收清单](CHECKLIST.md)。

## 1 产品说明

目标用户是需要对照岗位要求批量阅读简历的 HR 或招聘负责人。原来的工作方式是逐份查看文件、手工对照 JD、在表格记录分数，再将材料交给同事复核。问题是标准不一致、理由与材料容易分离、重复阅读成本高，也难以追溯人工改分。

应用把岗位、简历材料、规则发现、AI 分数和人工结论放在一个可恢复的工作台：筛查单列表 → 进入筛查单 → 添加文本简历 → 人工选择候选人 → AI 读取材料、预筛、评分并保存 → 查看依据 → 人工确认、改分和备注 → 刷新恢复。

| 关键页面 | 布局及操作 | 重要状态 |
| --- | --- | --- |
| 筛查单列表 | 标题/岗位搜索、状态筛选、查看、编辑、关联简历数、进入 | 无数据、加载、加载失败、分页 |
| 筛查单内候选人列表 | 岗位信息；姓名搜索/搜索/重置；右侧添加；独立一行批量评分；表格行内操作 | 未评分、已评分、待重评、人工已复核 |
| 简历详情与编辑 | 基本资料、技能标签、正文提纲、评分材料快照、历史评分 | 必填校验、技能去重、保存失败保留输入 |
| 评分详情与复核 | AI 原始分与人工分分开；五维依据；预筛发现；人工结论和备注 | 总分 0–100 整数；并发冲突；重新评分确认 |

这些页面的原型和落地效果以 README 中的真实运行截图为准。AI 只负责基于已保存证据给出五维判断和理由；硬条件校验、总分计算、数据范围、版本检查与保存由服务端处理。模型不能执行人工确认。

范围取舍：支持文本 JD/简历、筛选、预筛、评分、排序、复核与恢复；不实现 PDF/OCR、简历文件批量导入、通知或完整招聘管理。演示全部使用虚构材料，不据此作真实招聘决定。

## 2 实现与数据

使用 TypeScript、Xpert SDK、NestJS、TypeORM、LangChain/Zod、React 和共享 `@xpert-ai/plugin-shadcn-ui`。业务源码位于 `src/lib`，远程界面位于 `src/lib/remote-components/resume_screening__remote`；模板为 `src/xpert-resume-screening-assistant.yaml`，测试在 `tests`，依赖在 `package.json` 与 community 锁文件。

| 组成 | 职责 |
| --- | --- |
| ResumeScreening | 保存岗位、JD、最低年限/学历/技能、状态与上下文 |
| ResumeCandidate | 保存文本与结构化材料、规则发现、材料版本 |
| ResumeScore | 五维分、原始总分、人工调整、结论/备注、版本及历史 |
| ResumeScoringTask | 保存本次明确选择的人选及材料/评分版本；每批最多 20 人 |
| View provider + React workbench | 通过宿主桥接查询、编辑、发起选择评分及人工复核 |
| ResumeScreeningMiddleware + Assistant 模板 | 提供业务工具与模型工作说明，绑定工作台入口 |

五个工具为 `resume_list_screenings`、`resume_list_candidates`、`resume_get_candidate`、`resume_prescreen`、`resume_score`。评分从人工选择生成任务开始，模型使用任务内的人选与材料，不先枚举所有候选人再过滤。

五个评分维度：经验匹配、技能匹配、项目相关度、稳定性、加分项，各 0–20 的整数，服务端校验维度完整性并合计。建议阈值：70 分以上且无 error 规则发现为约面试；70 分以上有 error 或 50–69 分为待定；不足 50 为淘汰。建议与人工结论分开保存。

人工总分限制 0–100 整数。清空并保存将通过显式null清除人工调整、恢复AI原始分；服务调用省略调整字段则保持原人工分，兼容既有调用。已有评分显示“重新评分”，再次调用前提示额度与分数变化；含人工结论时明确保留历史、新结果须重新复核。取消不发送任务。材料修改后旧评分标为待重评，历史与快照保留。

评分详情区分 AI 原始分与人工调整后的当前分数。“历史评分（不含当前）”保存已替换或已失效的旧结果。新增 `ResumeScore.scoredAt` 可空时间列，在 AI 评分保存时写入，人工确认和重复请求不改变该时间；重评时将旧时间一起存入历史。缺少时间的旧记录显示“未记录”，不从人工修改时间推算。部署时需按平台实体结构更新流程同步该可空列。

创建/添加重试复用请求 UUID；评分操作键防止同一次保存重复入账。人工确认通过 revision 条件更新防止覆盖。数据按租户、组织及适用的助手/工作空间/项目范围限定；同组织同助手的授权成员共享业务数据，个人聊天独立。插件没有单独的业务只读角色。

## 3 环境与配置

| 项目 | 已验证配置 |
| --- | --- |
| Xpert | 开源版source-hybrid：Docker PostgreSQL 15 / Redis，源码API与Web |
| Node / pnpm | Node22.18.0；插件community pnpm8.15.8；宿主pnpm10.24.0；使用Corepack |
| 插件 | @xpert-ai/plugin-resume-screening 0.1.0，system level，namespace resume_screening |
| 插件开发main基线 | 9bfa96594a3debbb33f0ba25c7ade49e7d360c8b |
| 插件测试工作树基点 | 6aeb9c347f4b42974c88cd91312bc9219642ef0a |
| 宿主main基线 | ba8736c897474f7db9a261aa5f64d95860bb9f60 |
| 实际测试构建 | 由基点、[源码/产物SHA-256](evidence/2026-11-12-fixes/checks.json)和宿主兼容补丁确定 |

基线与源码/产物指纹共同标识实际测试版本，部署时应使用匹配版本。

### 宿主兼容前提

验证环境使用了Windows构建、认证/Dialog循环依赖、模板目录fsync、npm/Corepack子进程、模型元信息及类型构建方面的兼容修复。[兼容补丁](host-compatibility-ba8736c.patch)包含20个源文件的差异，针对上述宿主基线，不含数据库配置、凭据或原始日志。该补丁是复现附件，不属于插件运行模块。

在对应基线的宿主工作树中检查并应用：

```powershell
git apply --check <plugin-repo-root>/community/apps/resume-screening/docs/host-compatibility-ba8736c.patch
git apply <plugin-repo-root>/community/apps/resume-screening/docs/host-compatibility-ba8736c.patch
```

已包含相同修复时不要重复应用；可用`git apply --reverse --check <补丁路径>`检查。上游已修复的版本应使用其对应方案。固定基线文件上的补丁应用检查已通过，尚未验证全新机器的完整部署。

### 连接与凭据

参考[env.example](../env.example)，通过安全环境变量或批准的凭据存储提供安装身份；模型凭据在Xpert模型连接中配置。安装需要管理员登录身份，模型Key不能替代平台登录JWT。官方CLI不会自动加载插件community/.env，须将所需变量注入其进程。

`XPERT_API_URL`填写API origin，例如本地开发的`http://localhost:3000`；Web地址以宿主配置为准，例如`http://localhost:4200`。API进程的`PLUGIN_WORKSPACE_ROOTS`需要允许插件源码根及宿主内置插件根。应用业务数据沿用目标平台的数据库。

## 4 构建与测试

在插件仓库的 `community` 目录执行：

```powershell
corepack pnpm install --filter @xpert-ai/plugin-resume-screening... --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-resume-screening lint
corepack pnpm --filter @xpert-ai/plugin-resume-screening test
corepack pnpm --filter @xpert-ai/plugin-resume-screening verify:dist
```

按仓库 `plugin-dev-harness/README.md` 首先安装并构建 harness，然后从插件仓库根运行：

```powershell
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @xpert-ai/plugin-resume-screening
node scripts/check-plugin-metadata.mjs --package community/apps/resume-screening
```

若元信息检查脚本无法解析TypeScript，可在插件仓库根设置进程级`$env:NODE_PATH=(Resolve-Path community/apps/resume-screening/node_modules).Path`后运行，检查结束后恢复原值。

harness 的基础设施为 mock，只证明加载/初始化/销毁。PostgreSQL 集成测试需在安全进程环境提供 `RESUME_TEST_DATABASE_URL` 后，进入应用目录执行 `node --test tests/postgres.test.mjs`；该测试使用独立随机 schema，并清理测试 schema，不写平台业务表。不要打印连接字符串。

## 5 六步安装与使用

安装插件后仍需创建并发布助手。以下步骤分别给出操作和通过标准，实际验证结果见[六步验收](CHECKLIST.md#六步必需演示)。

### 步骤 1 安装插件

在Xpert宿主根目录执行官方命令：

```powershell
corepack pnpm plugin:deploy:local --help
corepack pnpm plugin:deploy:local `
  --plugin-dir <plugin-repo-root>/community/apps/resume-screening `
  --scope tenant --api-url <api-origin> `
  --manifest-file <private-output-directory>/deployment.json
```

插件为system level，安装在Default tenant，使用tenant scope，不传组织ID。CLI默认进行构建、测试和产物校验。通过标准为安装记录存在，服务端入口、模板及界面JS/CSS齐全，并按回执处理`restartRequired`和`loadStatus`。无需公开发布npm包。

已有安装需要验证卸载重装时，先备份目标业务，再通过平台卸载目标插件。卸载注册不等于清空业务数据；首次安装无需执行卸载。

### 步骤 2 重启并确认加载

安装回执要求重启时，在目标宿主使用标准API启动方式：

```powershell
corepack pnpm start:api
Invoke-RestMethod <api-origin>/api/health/ready
```

通过标准为API ready、目标插件描述符`loaded`，并能从平台页面打开插件资源。仅安装成功或健康接口成功不等于插件已加载。

### 步骤 3 展示助手模板

打开“专家市场 → 智能体模板”，查找“简历初筛助手”，查看模板能力与依赖。模板稳定标识为`@xpert-ai/plugin-resume-screening:resume-screening-assistant`。

通过标准为平台显示插件提供的模板及ResumeScreeningMiddleware依赖，而非仅在源码中存在YAML文件。

### 步骤 4 从模板创建助手

在模板详情选择“导入为智能体”，选择目标工作空间和可用模型，安装并发布。已有助手升级时使用平台模板更新流程，保留实例身份与绑定。

通过标准为实例发布成功、模板来源元数据正确、模型连接实际可用。模板示例模型名称需要按部署环境选择。

### 步骤 5 确认工具与工作台绑定

打开已发布助手画布，确认模型、ResumeScreeningMiddleware及五个简历工具。进入助手的“简历初筛”视图，视图键为`resume_screening__workbench`。模板安装会携带所需绑定。

通过标准为工具存在、工作台可从真实平台入口打开，并能查询和保存业务记录。

### 步骤 6 真实处理、人工确认与恢复

1. 创建筛查单，填写JD与硬条件，录入虚构文本简历。可参考[测试夹具](../tests/fake-repo.mjs)准备材料，补充任职时间、职责、技能和项目证据。
2. 勾选需要评分的人选或使用行内评分入口，记录未选择人选的原状态。查看对话中的材料读取、预筛和评分保存工具。
3. 查看五维评分与依据。模型分数不固定，未选择的人选应保持原状态。
4. 在工作台确认结论、调整总分和填写备注后保存。调整分须为0–100整数；清空调整值恢复AI原始分。
5. 完整刷新顶层平台页面并重新进入筛查单，核对材料、AI原始分、人工结果与备注。
6. 检查重新评分的确认与取消，确认取消不会发起模型调用。

通过标准为对话、工具回执、工作台状态与持久化结果一致。人工确认只通过工作台执行。

## 6 验收与故障处理

| 场景 | 验证方法 |
| --- | --- |
| 完整业务流程 | 创建记录、选择评分、真实模型处理、查看依据、人工保存，核对界面与服务端结果 |
| 保存与恢复 | 刷新或退出重进，核对原记录与结果，不依赖页面内存 |
| 输入与空状态 | 检查必填缺失、无匹配、非法分数和年限；纠正后可继续 |
| 失败与重试 | 模型不可用时保留结果，恢复后重试，不重复新增业务结果 |
| 权限与数据范围 | 指定授权成员正常访问，未授权助手与跨组织读写被拒绝 |

已执行的检查及结果见[验收清单](CHECKLIST.md)。harness使用mock基础设施；真实模型、数据库和权限分别由平台实测与集成测试验证。

受控模型故障验证应使用专用演示助手及其独有模型记录：备份主Agent模型配置，将模型名临时设为不可用，发起明确人选的评分，核对失败提示和原结果未变；恢复模型及全部选项，再重发同一任务并核对保存结果、历史和人数。主Agent模型可覆盖助手默认模型，应确认实际运行配置，避免影响共享连接。

宿主可能将模型配置不可用统一显示为“会员计划无法使用该Copilot模型”。遇到此提示先核对模型配置与访问权限，不能直接判断为余额不足。该用例不代表供应商真实计费、429或超时测试。

远程界面的调试开关由宿主init.debug提供，缺省及生产环境关闭。启用后只记录固定事件、动作/命令名称和结果类型，不输出身份、简历正文或凭据。沙箱初始化和已安装浅色主题的验证范围见清单。

## 7 AI协作与复用

开发工具使用Codex，原型阶段使用Muse；业务模型使用平台配置的DeepSeek。开发助手的具体模型版本未记录。

| 协作任务 | 人工选择与实现 | 收获 |
| --- | --- | --- |
| 控制评分范围 | 将全量评分方案调整为人工勾选/单人入口，服务端保存选择任务与证据版本 | 让系统约束范围，而非仅依赖提示词 |
| 衔接材料与评分依据 | 完善正文提纲、证据提示、技能去重、材料快照与过期评分标记 | 评分前先确保材料可读、可保存、可追溯 |
| 排查桥接失败 | 对照宿主契约修正text/input字段，处理success=false并保留输入 | 区分消息发送、模型执行和业务保存三个阶段 |
| 验证人工改分 | 明确省略与清空的不同语义，用接口、数据库及平台刷新验证 | 测试需要核对业务结果，不能只检查按钮或函数调用 |

工程结构参考同仓`community/apps/procurement-quote-comparison`，适用AGPL-3.0。复用平台SDK、桥接与模板机制、共享shadcn UI，以及NestJS/TypeORM、LangChain/Zod；简历业务模型、选择任务、材料快照、预筛和复核按本选题实现。AI建议通过代码审查、类型检查、测试和真实平台操作确认。

## 8 已知限制

- 仅支持文本JD与简历，未实现PDF/OCR、批量文件导入、通知或完整招聘管理。
- 评分准备/发送阶段防重；模型执行全过程尚无持久任务进度和取消管理。
- 模型分数可能变化，证据完整性与最终结论仍需人工复核。
- 宿主兼容补丁通过固定基线应用检查，未验证全新机器、空库和所有操作系统的完整部署。
- 供应商真实429/超时、长批次吞吐、全部共享权限组合、深色主题和设备适配未完整覆盖。

优先改进任务进度/取消、模型故障诊断与可重复部署验证；文件解析按实际使用需求扩展。
