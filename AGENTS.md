# Xpert 插件工作区智能体协作通用指南 (AGENTS.md)

本文档为在 `xpert-plugins` 仓库中进行插件开发、视图构建、集成验证和本地安装的通用智能体与开发者指引。

---

## 一、远程视图界面开发规范 (Remote View UI)

1. **交互组件规范**：
   - React 远程视图必须使用 `@xpert-ai/plugin-shadcn-ui` 提供的交互式基础组件（包括：对话框 Dialog、对话框底栏 DialogFooter、下拉选择 Select、复选框 Checkbox、选项卡 Tabs、命令输入 Command、按钮 Button、输入框 Input、文本域 Textarea 及表格 Table）。严禁使用浏览器原生弹窗（如 `alert`、`confirm`、`prompt`）或自建非标准组件进行替代。Vue 视图应使用共享的 `shadcn-vue` 依赖包。
2. **样式与主题变量**：
   - 严格继承共享的 shadcn 组件样式及变体。宿主平台注入的主题语义变量（如颜色、边距、圆角、边框与阴影）是唯一的自定义途径。插件样式仅可用于控制页面排版、限制视口尺寸或格式化文档内容，不得强行覆写组件表面底色、标题字号或交互焦点状态。
3. **国际化与多语言**：
   - 远程视图界面的文案必须维护在各插件独立的 `remote/locales/<locale>.json` 语言包中，通过语义化键名引用。结合 `@xpert-ai/plugin-shadcn-ui/i18n` 适配器与 `RemoteI18nProvider` 渲染，避免在 JSX 中硬编码双语字符串。单纯的语言切换不得重置用户的查询条件、草稿或协同会话。
4. **生命周期校验要求**：
   - 在开发或修改任何插件后，在视任务完成前，必须按照 `plugin-dev-harness/README.md` 的指引，通过生命周期测试工具 `plugin-dev-harness` 验证插件的加载、初始化与销毁流程。
5. **插件元信息对齐**：
   - 保持插件运行时的元数据与插件自身的 `package.json` 一致。优先从 `version`、`xpert.plugin.level` 和 `xpert.plugin.artifactNamespace` 中推导对应元数据，避免版本与发布漂移。提交代码前应通过 `node scripts/check-plugin-metadata.mjs` 检查元数据完整性。`.githooks/pre-commit` 会对实体表名命名规范及暂存依赖进行强制检查。
6. **类型边界与判别字段**：
   - 严禁通过显示文案、展示标题或偶发字段猜测业务类型。依赖机器识别的业务逻辑必须使用共享接口中明确定义的类型字段（如可判别联合类型）。若缺少必要的类型区分，应先在公共定义中补充，严禁在业务逻辑中硬编码启发式猜测。

---

## 二、从插件中调用平台能力规范 (Platform Capabilities)

1. **能力暴露决策原则**：
   - 仅当接口需要被外部插件跨包消费时，才应暴露为运行时能力（Capability）；平台内部专属的服务与工厂应当通过 NestJS 构造函数注入以及显式的模块 `imports`/`exports` 进行组织，避免过度抽象。
2. **避免跨模块调用内部 CQRS 总线**：
   - 严禁在插件中直接引用平台私有 SDK 的 CQRS 命令/查询类（Command/Query）并通过 CommandBus/QueryBus 分发。插件与宿主可能加载不同版本的 `@nestjs/cqrs`，类标识和事件总线实例不能作为跨边界调用的可靠通道。
3. **使用类型安全的运行时能力 API**：
   - 通过宿主注册表提供的强类型运行时能力 API 进行调用，使用稳定的字符串能力标识（Capability ID）寻址，直接调用解析出的方法，不依赖跨包的类实例判断（`instanceof`）。
4. **权限与范围绑定**：
   - 涉及身份与租户隔离的特性，应由宿主内部受信任的范围进行绑定。插件不得通过工具入参自行构造超出权限的范围，也不得将插件安装者的权限擅自替换为当前操作用户的权限。

---

## 三、本地 Xpert 插件安装与调试 (Local Installation)

1. **环境配置准备**：
   - 对于社区插件开发，平台连接配置集中维护在 `community/.env` 中（以 `community/env.example` 为模板）。在将插件安装或重装到本地 Xpert 后端之前，应优先读取该环境配置，严禁硬编码真实的租户密钥或 Token。
2. **安装所需的核心参数**：
   - 必须配置 `XPERT_API_URL`、`XPERT_TOKEN`，以及针对组织级插件的 `XPERT_ORG_ID` 或针对系统级插件的 `XPERT_INSTALL_SCOPE=global`。严禁提交真实的访问密钥或私人 Token 到版本库。
3. **安装专用命令参考**：
   - 组织级安装：
     ```bash
     pnpm plugin:install:local --workspace-path <plugin-dir> --org-id "$XPERT_ORG_ID" --token "$XPERT_TOKEN" --api-url "$XPERT_API_URL"
     ```
   - 组织级重新安装：
     ```bash
     pnpm plugin:reinstall:local --workspace-path <plugin-dir> --org-id "$XPERT_ORG_ID" --token "$XPERT_TOKEN" --api-url "$XPERT_API_URL"
     ```
4. **系统级（全局）插件部署注意事项**：
   - 对于 `meta.level` 为 `system` 的插件，需使用平台超级管理员（`SUPER_ADMIN`）角色登录获取的 JWT Token 部署到全局范围，普通的 API Key 或只读 Token 无法通过系统级安装的鉴权拦截。
5. **配置参数独立性**：
   - 各插件的安装配置负载必须保持独立，不得跨插件复用配置对象，避免配置冲突或属性污染。
