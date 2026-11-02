# Bosi 经营分析助手套件

按真实岗位职责选装 Assistant，共享分析 Skills，并通过现有 Live Dashboard
能力制作看板。支持通过授权分析资源访问 BW XMLA、SAP OData 和数据库；实际
数据、组织、期间和问题以用户本次请求为准。

- 常用岗位：CEO、CFO、销售经理、采购经理、供应链经理、生产经理。
- 按分工选装：成本控制经理、资金经理、应收管理经理、项目经理。
- 通用入口：Bosi 经营分析助手。适合一个人兼任多个岗位或尚未确定职责视角。

这是 **一个 Agent Plugin、11 个可选模板、10 个共享 Bosi Skills**，不要求客户
安装 11 个 Assistant。模板不是权限包；每个实例单独绑定实际资源和人员权限。
模板名称也不限制可分析的主题，更不绑定 BW、OData 或数据库中的某一种协议。

每个模板配有独立的东方年轻成年人卡通头像，位于 `assets/avatars/`。生成器
将同一张头像嵌入该模板的 Assistant 与主 Agent，安装后无需访问外部图片地址。
画风与角色提示词保存在 `assets/avatar-prompts.json`；套件图标仍使用品牌标识。

阅读 [岗位与模型规划](docs/roles.mdx)、[安装使用](docs/usage.mdx)、
[数据准备](docs/data-sources.mdx) 和 [验收范围](docs/acceptance.mdx)。

## 开发与打包

在仓库的 `agent-plugins` 目录执行：

```sh
corepack pnpm build:bosi
corepack pnpm test
corepack pnpm test:lifecycle --platform-root /path/to/xpert --plugin bosi-business-review
corepack pnpm quickstart --pack --output-dir /path/to/output bosi-business-review
```

岗位定义位于 `skills/bosi-business-review/references/roles.json`，分析主题位于
同目录 `topics.json`。生成器只生成 manifest 和模板，不覆盖 Skills、客户数据或文档。
修改这些定义后重新生成；包版本随实际发布更新。打包 ZIP 通过平台标准 Agent
Plugins 导入，再选用模板。已有实例通过模板升级流程更新，不重复新建。
