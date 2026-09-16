# Test Case Generator（测试用例智能生成）

AI-powered test case generator business app plugin for the Xpert open-source platform. It generates structured test cases from natural-language requirement descriptions, supports inline editing in a Workbench, and persists projects to the platform database with tenant/organization isolation.

---

## 一、产品说明

### 目标用户

- **测试工程师**：需要根据需求文档快速编写结构化测试用例
- **产品经理**：需要在需求评审阶段快速验证场景覆盖度

### 原有工作痛点

根据需求文档手动编写测试用例耗时长，容易遗漏边界条件和异常场景，团队间用例标准不统一，历史用例难以复用。

### 核心业务流程

```
输入需求描述 → AI 生成结构化用例 → 人工编辑确认 → 保存用例库 → 历史查询恢复
```

### AI 的核心作用

- **需求拆解**：将自然语言需求拆解为可测试的功能点
- **多场景用例生成**：自动覆盖正常流程、异常流程、边界条件三类场景
- **优先级自动划分**：根据业务影响自动分配 P0（关键）/ P1（高）/ P2（中）
- **标准化格式输出**：统一用例字段（名称、前置条件、操作步骤、预期结果、优先级）

### 功能取舍说明

| 做（✅） | 不做（❌） |
|---------|-----------|
| 单需求生成用例 | 批量需求导入 |
| 用例行内编辑、删除、新增 | Excel 导出 |
| 保存到用例库、历史恢复 | 多版本对比 |
| 失败重试（输入过短/语义模糊） | 多人协作 |
| Assistant 自然语言触发 | 商业版专属功能 |

---

## 二、应用插件源码

### 架构概览

```
src/
├── index.ts                                    # 插件入口（meta + config + templates + register）
├── xpert-test-case-generator-assistant.yaml    # Assistant DSL 模板
└── lib/
    ├── constants.ts                            # 插件名、feature、view key、SVG icon
    ├── types.ts                                # TestCase/Project/Scope 类型 + 校验函数
    ├── test-case-generator.config.ts           # Zod 配置 schema（环境变量注入）
    ├── test-case-generator.plugin.ts           # @XpertServerPlugin NestJS 模块
    ├── test-case-generator.service.ts          # CRUD Service + TypeORM 事务持久化
    ├── test-case-generator.middleware.ts       # @AgentMiddleware 4 个 LangChain 工具
    ├── test-case-generator-view.provider.ts    # @ViewExtensionProvider 双页面工作台
    ├── test-case-generator.templates.ts        # Assistant 模板注册
    ├── entities/
    │   ├── index.ts
    │   ├── test-case.entity.ts                 # plugin_test_case 表
    │   └── test-case-project.entity.ts         # plugin_test_case_project 表
    └── remote-components/
        └── test-case-workbench/
            └── app.js                          # iframe 隔离 React 双页面工作台
```

### 核心模块说明

| 模块 | 实现方式 | 复用来源 |
|------|---------|---------|
| 数据持久化 | TypeORM 实体 + `@XpertServerPlugin` 注册 | 参考 smart-maintenance 实体模式 |
| AI Agent 工具 | `@AgentMiddlewareStrategy` + `@langchain/core/tools` + Zod | 参考 smart-maintenance middleware |
| Workbench 界面 | `@ViewExtensionProvider` + 远程 React 组件（iframe） | 参考 smart-maintenance view provider |
| 失败重试 | 输入校验 + INVALID_INPUT 错误码 + 增量生成 | 自研 |
| Assistant 模板 | YAML DSL + templates.ts 注册 | 参考 smart-maintenance 模板 |

### 数据模型

**TestCaseProject（用例项目）**：`plugin_test_case_project` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| requirementText | text | 需求描述 |
| granularity | enum | basic / detailed |
| tenantId | varchar | 租户隔离 |
| organizationId | varchar | 组织隔离 |
| createdBy | varchar | 创建人 |
| createdAt / updatedAt | timestamp | 时间戳 |

**TestCase（测试用例）**：`plugin_test_case` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| projectId | uuid | 外键 → project |
| name | varchar | 用例名称 |
| precondition | text | 前置条件 |
| steps | jsonb | 操作步骤（字符串数组） |
| expectedResult | text | 预期结果 |
| priority | enum | P0 / P1 / P2 |
| createdAt / updatedAt | timestamp | 时间戳 |

### Agent 工具列表

| 工具名 | 说明 | 输入 | 输出 |
|--------|------|------|------|
| `test_case_generate` | AI 生成测试用例 | requirementText（≥20字）、granularity | 结构化用例数组 / INVALID_INPUT 错误 |
| `test_case_save_project` | 保存用例项目 | requirementText、granularity、testCases | 项目 id、用例数 |
| `test_case_list_projects` | 列出历史项目 | search（可选）、page、pageSize | 分页项目列表 |
| `test_case_delete_project` | 删除项目 | projectId | 操作结果 |

---

## 三、运行说明

### 环境要求

- Node.js >= 20
- pnpm（通过 corepack 启用）
- Xpert 开源版平台（main 分支）
- Docker（平台基础设施：PostgreSQL、Redis 等）
- 大模型 API 密钥（通过平台 Assistant 模型配置注入，不写入代码）

### 构建命令

```bash
# 在 xpert-plugins 仓库根目录
cd community

# 安装依赖
pnpm install

# 构建插件
pnpm --filter @community/apps-test-case-generator build

# 类型检查
pnpm --filter @community/apps-test-case-generator exec tsc -p tsconfig.lib.json --noEmit

# 单元测试（类型校验）
pnpm --filter @community/apps-test-case-generator test
```

### 部署到本地测试平台

```bash
# 在 Xpert 平台根目录
corepack pnpm plugin:deploy:local \
  --plugin-dir <xpert-plugins绝对路径>/community/apps/test-case-generator \
  --scope <测试租户/组织ID> \
  --api-url <平台API地址>
```

部署后重启平台服务，进入 Workbench 确认「测试用例智能生成」应用入口正常显示。

### 环境变量配置示例

| 环境变量 | 类型 | 默认值 | 说明 |
|---------|------|--------|------|
| `TEST_CASE_GENERATOR_ENABLED` | boolean | `true` | 插件是否启用 |
| `TEST_CASE_GENERATOR_DEFAULT_GRANULARITY` | enum | `basic` | 默认用例粒度 |
| `TEST_CASE_GENERATOR_MAX_CASES` | number (1-50) | `10` | 单次最大生成用例数 |
| `TEST_CASE_GENERATOR_REQUIREMENT_MIN_LENGTH` | number (5-100) | `20` | 需求描述最小字数 |

> 所有大模型 API 密钥通过 Xpert 平台 Assistant 模型配置页面注入，不通过环境变量硬编码。

---

## 四、运行截图

> 截图放置于 `assets/` 目录，使用相对路径引用。

| 截图 | 说明 |
|------|------|
| `assets/main-workbench.png` | 主操作页：左侧需求输入 + 粒度选择，右侧用例列表编辑 |
| `assets/ai-generation-result.png` | AI 生成结果：覆盖正常/异常/边界场景，P0/P1/P2 优先级 |
| `assets/failure-retry.png` | 失败重试场景：输入过短时顶部红色提示，补充后重新生成 |
| `assets/history-list.png` | 历史列表页：卡片展示已保存项目，显示创建时间和用例数 |

> 注：截图需在平台部署成功后通过实际操作截取。当前版本源码已就绪，截图待平台环境部署后补充。

---

## 五、验证结果

### 第一层：单元测试与构建检查

| 测试项 | 操作 | 结果 |
|--------|------|------|
| TypeScript 类型检查（lib） | `tsc -p tsconfig.lib.json --noEmit` | ✅ 通过，零错误 |
| TypeScript 类型检查（spec） | `tsc -p tsconfig.spec.json --noEmit` | ✅ 通过，零错误 |
| 构建产物完整性 | `pnpm build` | ✅ 通过，dist/ 包含 index.js、lib/、YAML、远程组件 |
| 输入校验单测 | requirementText < 20 字 | ✅ 返回 INVALID_INPUT 错误码 |
| 数据结构校验单测 | TestCase 字段完整性 | ✅ 通过 |
| 失败场景返回值单测 | 语义模糊时不强制生成 | ✅ 返回明确提示 |

### 第二层：插件生命周期测试

| 测试项 | 操作 | 结果 |
|--------|------|------|
| 插件可加载 | plugin-dev-harness 加载验证 | ⏳ 待验证（harness 构建中） |
| 配置校验通过 | Zod schema 校验 | ✅ 代码层面通过 |
| 初始化无错误 | onPluginBootstrap | ✅ 代码层面通过 |
| 销毁无错误 | onPluginDestroy | ✅ 代码层面通过 |

### 第三层：界面与平台业务流程测试

| 测试场景 | 操作步骤 | 通过标准 | 结果 |
|----------|---------|---------|------|
| 完整业务流程 | 输入登录需求 → 生成 → 编辑2条 → 保存 | AI生成结构化用例；编辑生效；保存成功 | ⏳ 待平台部署后验证 |
| 保存与恢复 | 保存后刷新 → 历史列表 → 打开详情 | 数据不丢失，详情一致 | ⏳ 待平台部署后验证 |
| 输入与空状态 | 不输入内容直接点击生成 | 提示「请输入需求描述」，不触发AI | ✅ 代码层面已实现校验 |
| 失败与重试 | 输入「测试登录」（过短）→ 补充 → 重新生成 | 第一次返回提示；补充后生成完整用例；不重置已有结果 | ✅ 代码层面已实现 |

### 第四层：测试结果记录

| 层级 | 已验证项 | 未验证项 | 备注 |
|------|---------|---------|------|
| 单元测试 | 类型检查、构建、输入校验、数据结构、失败场景 | — | 全部通过 |
| 生命周期 | 配置校验、初始化/销毁代码逻辑 | harness 实际运行 | 待 harness 构建完成后验证 |
| 界面业务流程 | 空状态校验、失败重试逻辑代码 | 完整流程、保存恢复、实际界面操作 | 需平台部署后验证 |
| 多用户权限隔离 | — | 多用户权限隔离 | 非核心范围，未验证 |

---

## 六、AI 协作说明

### 所用工具与模型

- **开发辅助**：Doubao AI Agent（代码生成、架构设计、问题排查）
- **参考架构**：xpert-plugins 仓库 smart-maintenance 示例应用
- **官方文档**：Xpert 平台插件开发文档、Agent Skills 开发指南

### 代表性协作过程

#### 1. 需求传递：如何向 AI 介绍 Xpert 插件架构

在开发开始前，先让 AI 完整阅读 smart-maintenance 示例应用的全部源码（index.ts、plugin.ts、service.ts、middleware.ts、view-provider.ts、config.ts、entities、remote-components、package.json、assistant.yaml），建立对 Xpert 插件架构的完整认知：插件入口通过 `XpertPlugin` 接口注册 meta/config/templates/register，服务端逻辑通过 `@XpertServerPlugin` 装饰器注册 NestJS 模块，Agent 工具通过 `@AgentMiddlewareStrategy` + LangChain `tool()` 封装，Workbench 界面通过 `@ViewExtensionProvider` + 远程 React iframe 组件实现。在此基础上传递测试用例生成的业务需求，AI 能够准确映射到对应的架构模式。

#### 2. 方案选择：Workbench 扩展视图 vs 纯对话窗口

AI 最初提出可以仅通过 Assistant 对话 + Agent 工具实现用例生成（开发量最小）。但根据需求文档「必须有可操作的交互界面，不能仅为对话窗口」的硬性要求，选择了 Workbench 扩展视图方案：使用 `@ViewExtensionProvider` 注册双页面视图（主操作页 + 历史列表页），通过远程 React 组件（iframe 隔离）实现富交互界面。取舍点：Workbench 方案开发量更大（需要实现远程组件、dataSource、viewAction 通信），但提供了更好的用户体验（用例行内编辑、可视化历史管理），且符合平台业务应用的标准模式。

#### 3. 问题排查：数据持久化失效的定位过程

在实现 TypeORM 实体时，AI 最初仅定义了实体类但未在 `@XpertServerPlugin` 的 `entities` 数组和 `imports` 的 `TypeOrmModule.forFeature()` 中注册，导致平台无法识别数据表。通过对比 smart-maintenance 示例的 plugin.ts 文件，发现需要同时在三处注册实体：(1) `@XpertServerPlugin({ entities: [...] })`、(2) `imports: [TypeOrmModule.forFeature([...])]`、(3) entities/index.ts 统一导出。修复后实体被平台正确识别，数据持久化生效。

#### 4. 效果验证：本地构建 + 类型检查，而非仅依赖代码审查

完成代码实现后，不依赖 AI 的「代码看起来正确」的判断，而是通过实际执行构建命令验证：`tsc -p tsconfig.lib.json --noEmit` 类型检查零错误、`pnpm build` 构建成功且 dist/ 产物完整、`tsc -p tsconfig.spec.json --noEmit` 测试类型检查通过。过程中发现 4 个类型错误（middleware 类型守卫、service 返回类型、view provider getViewData 返回结构），逐一修复后全部通过。后续平台部署后将通过实际操作验证界面业务流程。

### 遇到的限制与收获

- **限制**：Docker/WSL 环境在中国大陆网络下安装困难（WSL Ubuntu 镜像下载受 DNS 污染影响），导致平台本地部署和界面集成测试延迟；大模型 API 密钥需用户在平台配置后才能进行端到端 AI 生成测试。
- **收获**：通过深度阅读官方示例源码，掌握了 Xpert 插件的完整开发模式（meta 注册 → NestJS 模块 → TypeORM 持久化 → Agent 工具 → Workbench 视图 → Assistant 模板），理解了平台插件系统的设计哲学「Everything is a Plugin」。

---

## 七、已知限制

### 未完成功能

- **批量需求导入**：当前仅支持单需求输入生成，不支持批量导入需求文档
- **Excel 导出**：用例仅保存在平台数据库，不支持导出为 Excel/CSV
- **多版本对比**：不支持同一需求的不同版本用例对比
- **多人协作**：不支持多人同时编辑同一用例项目
- **运行截图**：assets/ 目录截图待平台部署后补充

### 适用边界

- 仅适用于 Xpert 开源版（main 分支），不依赖商业版专属功能
- AI 生成质量取决于所配置大模型的能力，建议使用代码生成能力较强的模型
- 需求描述需包含足够的功能规则和输入输出约束（建议 ≥ 50 字），过短的需求可能导致生成结果不完整

### 后续优化方向

1. 支持需求文档批量导入（Word/PDF/Markdown 解析）
2. 支持用例导出为 Excel/CSV/TestLink 格式
3. 增加用例评审工作流（草稿 → 评审 → 定稿）
4. 支持用例与需求条目双向追溯
5. 增加 AI 生成质量反馈机制（用户评分 → 优化 Prompt）

---

## 基线版本信息

- **xpert-plugins 仓库基线**：`569512a2a316631b19e1933fff9561b470b8b2d1`（upstream/main）
- **xpert 平台仓库基线**：`182f2f4a7d05d968016a9ec20a93833687c4394f`（main）
- **功能分支**：`feat/test-case-generator`
- **包名**：`@community/apps-test-case-generator`

## License

AGPL-3.0
