# 复用来源与本题实现

本插件沿用仓库的 AGPL-3.0 声明，完整文本随包提供于根目录 `LICENSE`。以下列明复用范围，不将开源框架、共享组件或 AI 生成代码宣称为候选人独立实现的基础设施。

| 来源 | 声明许可 | 使用范围及本题改动 |
| --- | --- | --- |
| Xpert plugin SDK 与 contracts 3.30.2 | AGPL-3.0 | 使用公开类型、插件注册、View、Runtime Capability 与托管队列契约；没有修改宿主维护源代码 |
| 同仓库 `packages/shadcn-ui` | AGPL-3.0 | 复用 React 控件、i18n 适配与宿主主题样式；仅编写本应用布局和文案，不修改共享控件 |
| React / React DOM 18.3.1 | MIT | 工作台组件、状态与渲染；随正式远程 JS 构建，不使用 CDN |
| lucide-react 1.24.0 | ISC | 工作台操作图标 |
| Tailwind CSS 及共享 UI 的依赖 | 各包声明见依赖清单 | 编译界面样式并复用共享交互基础；原始许可文本随包保留 |
| NestJS、TypeORM、Zod、LangChain core、tslib | 各自包元数据声明 | 依赖注入、持久化、边界校验和模型类型；宿主 peer dependencies 不打入远程 UI |
| 官方 community/apps 示例与配套 Skills | 参照其所在仓库许可与使用说明 | 学习插件、中间件、Workbench 和模板的连接方式；本题业务服务与数据结构在独立目录新增 |

本题新增的内容包括：缺陷反馈和分析尝试实体、按用户隔离的数据服务、AI 结果来源校验、队列与版本写回、人工保护和确认快照、三项领域工具、反馈工作台、回答与重试交互、助手模板以及单元和真实平台验收脚本。AI 开发工具参与方案梳理、代码实现、调试与材料整理，关键选择见 [AI 协作记录](ai-collaboration.md)。

实际构建中嵌入的包与版本见 [依赖清单](bundled-dependencies.md)，许可和版权原文位于根目录 `THIRD_PARTY_NOTICES.txt`。清单来自冻结依赖安装后 esbuild 输出中实际有字节贡献的模块，并补充 CSS 依赖及 tslib；不将整个 node_modules 随包发布。`react-remove-scroll-bar` 的安装包未附独立许可文件，已从其官方仓库补充许可原文并标明获取来源。

第三方库的版权及许可归各权利人所有。模型 API 是平台中配置的外部服务，不随本插件分发其实现或凭证；本机提供商设置不进入可移植助手模板。
