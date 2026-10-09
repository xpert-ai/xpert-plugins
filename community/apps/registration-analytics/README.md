# Registration Analytics（报名问数台）

一个运行在 Xpert 平台上的**报名数据智能问数**业务应用。面向活动报名运营人员：用自然语言提问，AI 理解后转成结构化查询，从报名数据中取数、分组统计并解读结果；常用查询可保存复用。

## 目标用户与业务价值

- **用户**：活动报名运营人员（非技术人员）
- **痛点**：报名数据在后台表格里，查"本周报名多少人 / 哪个城市最多 / 各渠道分布"要手动筛选，不会 SQL 就得找技术
- **价值**：把"查数据"变成"问一句"——AI 负责把自然语言转成查询条件、执行统计、解读结论

## 核心流程

```
用户在聊天框提问（如"按城市统计报名人数"）
  → AI 转成结构化查询条件（filters / groupBy / aggregates）
  → 调用 registration_query 工具 → 服务端查询数据库
  → 返回聚合表格 + 一句话结论
  → 用户可说"保存这个查询"，存入常用查询复用
```

## 插件能力

| 能力 | 说明 |
|---|---|
| Agent 工具 | `registration_list_activities` 列活动；`registration_query` 结构化查询/聚合；`registration_save_query` 保存常用查询；`registration_list_saved_queries` 列常用查询 |
| 工作台视图 | 报名问数台：总览卡片 + 建议问题 + 报名记录表 + 常用查询列表 |
| 助手模板 | 报名问数助手（DSL yaml），预置 5 条 starter prompts |
| 数据持久化 | TypeORM 实体自动建表，数据落在 Xpert 平台数据库，租户/组织隔离 |

## 数据模型

- `plugin_registration_record`：报名记录（活动、姓名、手机、邮箱、城市、渠道、报名时间、状态、费用）
- `plugin_registration_saved_query`：常用查询（名称、原始问题、结构化条件 JSON）

首次使用时自动预置 20 条演示报名数据（覆盖 4 个活动、多种渠道/城市/状态），便于直接体验问数。

## 目录结构

```
community/apps/registration-analytics/
├── package.json
├── index.cjs                  # 包入口
├── tsconfig*.json
├── scripts/
│   ├── build-remote.mjs       # esbuild 打包工作台前端（无 React 依赖）
│   └── copy-assets.mjs        # 复制 yaml + html 到 dist
├── src/
│   ├── index.ts               # 插件入口：元信息 + 注册
│   ├── registration-analytics-assistant.yaml  # 助手模板 DSL
│   └── lib/
│       ├── registration.plugin.ts       # NestJS 模块
│       ├── registration.entity.ts       # 报名记录实体
│       ├── saved-query.entity.ts        # 常用查询实体
│       ├── registration.service.ts      # 查询/聚合/保存逻辑
│       ├── registration-seed.service.ts # 演示数据
│       ├── registration.middleware.ts   # Agent 工具
│       ├── registration-view.provider.ts # 工作台视图
│       ├── registration.templates.ts    # 助手模板贡献
│       ├── registration.config.ts       # 插件配置
│       ├── scope.ts                     # 租户/组织隔离
│       ├── constants.ts / types.ts
│       └── remote/                      # 工作台前端（单 HTML + iframe）
│           ├── template.html
│           ├── bridge.ts                # 与宿主通信的桥接
│           ├── main.ts                  # 界面逻辑
│           └── registration-console.html # 构建产物
└── tests/plugin.test.mjs
```

## 构建与测试

```sh
# 依赖：Node 22+，需先安装 pnpm 依赖
pnpm install

# 构建（打包前端 + tsc 编译 + 复制资源）
pnpm build

# 类型检查
pnpm typecheck

# 测试（元信息/模板/配置校验）
pnpm test
```

> 说明：`src/lib/remote/registration-console.html` 由 `scripts/build-remote.mjs` 从 `main.ts` 生成并提交，保证可复现且不依赖运行时打包。实体表名带 `plugin_` 前缀，符合 community 仓库的命名约束。

## 部署与体验（测试环境）

1. 构建后安装插件到测试宿主（按平台 `plugin:deploy:local` 流程，凭证从测试环境配置读取）。
2. 从模板创建"报名问数助手"，配置模型并发布。
3. 打开工作台，在聊天框提问，例如：
   - "本周有多少人报名？"
   - "按城市统计报名人数"
   - "各渠道的报名人数分布"
   - "已确认报名的有多少人？"
4. 说"保存这个查询"，即可在常用查询中看到。

## 失败与重试场景

- **AI 解析失败 / 条件不完整**：工具返回明确错误信息，助手引导用户换一种问法，可重试。
- **查询结果为空**：工作台表格显示空状态，助手建议放宽条件。
- **数据加载失败**：工作台显示错误提示并支持刷新，不会用空数据覆盖已有记录。

## 许可

AGPL-3.0。参考了官方 `community/apps/crm` 与 `community/apps/dockyard` 的插件结构，复用其 SDK 用法与桥接协议（MIT/AGPL 允许范围内）。
