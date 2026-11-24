# 安装与复现

插件为独立 Xpert Agentic App，包名 `@community/apps-defect-intake`，当前版本 0.2.2。需要已完成首次管理员与组织初始化、PostgreSQL 和 Redis 可用、允许本地插件安装的 Xpert 开源版测试环境。插件通过宿主数据源、托管队列和已授权模型运行时工作，不要求另建第三方工单系统。

## 版本与环境

| 项目 | 实际开发和验收环境 |
| --- | --- |
| Xpert 开源版 main 起始基线与测试源码 | `3ddc380ca20373f9113a77411090de3c3da75e37` |
| 插件仓库上游 main 起始基线 | `dfad5423205811b3251628ee9bf59a79a4bcbd87` |
| 业务代码完成验收的提交 | `8fa9d7be9a6d87f60883f8988eedc999b6578d42`；后续交付材料补充不改变业务代码 |
| 工具链 | Node.js 22.23.4；宿主 pnpm 10.24.0；community pnpm 8.15.8 |
| SDK / contracts | 已发布版本 3.30.2；SDK 作为宿主 peer dependency |
| 已验证模型 | 平台 DeepSeek 官方连接，模型 `deepseek-flash`；凭证仅在平台配置 |

平台维护源代码没有手工修改；启动构建改变了 execution-observability 的两个 timeline 生成资源，不包含在本插件 PR 中。本文固定起始基线用于复现，不声称未经测试的其他 main 提交均兼容。宿主初次搭建依照该版本的 [平台 README](https://github.com/xpert-ai/xpert/tree/3ddc380ca20373f9113a77411090de3c3da75e37) 完成，不把插件安装当成平台初始化。

## 构建插件

在插件仓库的 `community` 目录执行：

```sh
corepack pnpm --filter @community/apps-defect-intake... install --frozen-lockfile
corepack pnpm --filter @community/apps-defect-intake build
corepack pnpm --filter @community/apps-defect-intake test
corepack pnpm --filter @community/apps-defect-intake verify:dist
```

构建依赖同仓库共享 UI 包，命令会先构建该包，再生成服务端与远程组件。实际运行使用 `index.cjs`、`dist` 和 package metadata；不要直接从 `src` 加载插件。插件没有独立 lint 脚本，已执行双端严格 TypeScript 检查。

## 安装与激活

将 [env.example](../env.example) 复制到仓库外的私有目录，填写宿主地址、安装身份与本插件绝对路径。不要把真实值写回示例文件。系统插件必须在 Default tenant 使用 tenant scope，以具备对应安装权限的正常平台登录进行操作；不要用业务 API key 代替登录身份。

在宿主仓库根目录执行，路径替换为你自己的私有配置位置：

```sh
set -a
source /absolute/private/path/defect-intake.env
set +a
corepack pnpm plugin:deploy:local \
  --plugin-dir "$DEFECT_INTAKE_PLUGIN_DIR" \
  --scope tenant --api-url "$XPERT_API_ORIGIN" --no-keychain
```

CLI 从当前进程读取登录信息，不把密码放在命令行参数中。部署提示 `restartRequired` 或待重启时，按宿主支持的启动方式重启 API。本文测试的源码宿主使用 `corepack pnpm start:api`，Cloud UI 使用另一个终端运行 `corepack pnpm start:cloud`。在平台插件页确认加载了 0.2.2 后再继续；staged 不代表正在运行。

## 创建并发布助手

1. 在目标组织的模型提供商页面配置可用连接和额度，凭证留在平台中。第三方模型服务是唯一按使用者选择调用的外部业务依赖。
2. 在组织工作空间从插件模板安装“智能工单补全助手”。选择已授权的主模型；模板不会携带本机连接 ID。
3. 打开领域中间件“分析模型”，明确选择该组织可用的模型连接。以已验收的 DeepSeek 配置复现时，使用非思考模式、JSON 对象输出，`streaming: false`、`max_tokens: 4096`。这些是提供商模型选项；其他提供商按自己的支持范围配置。
4. 保存并发布同一助手。模板已连接领域、Todo 与 Context Compression 中间件；领域中间件激活工作台并提供查找、读取、分析三个工具，不需要另建同名 Agent Tool 节点。
5. 从助手菜单打开“智能工单补全”，先录入一条标记为虚构的反馈，执行 AI 整理、回答保存、重新整理、人工确认。完整流程见 [演示流程](demo.md)。

如果不显式指定分析模型，插件会尝试组织已有默认模型；不存在时明确失败，不自动修改组织默认配置。为稳定复现，推荐显式绑定专用分析模型。插件保留提供商选项，限制最大输出为 8,192 tokens、单次模型调用为 90 秒；JSON 模式仍必须通过来源和结构校验。

安装插件、安装助手模板、发布助手及模型联调是四个独立检查点。仅看到插件描述或模板不代表业务验收成功。其他普通用户使用时，通过平台标准助手分享授予使用权，记录仍按租户、组织及当前用户隔离。

## 验证与常见失败

先运行单元与契约测试，再从插件仓库根目录执行：

```sh
node plugin-dev-harness/dist/index.js \
  --workspace ./community --plugin @community/apps-defect-intake
```

Harness 的基础设施为 mock，真实平台验证脚本及变量见 [README](../README.md)。`XPERT_API_ORIGIN` 是部署用的 origin，`XPERT_API_URL` 是脚本使用的 `/api` 地址，二者不要混用。脚本的组织与助手 ID 来自正常安装回执或平台配置，不从数据库或浏览器凭证中提取。

| 现象 | 核对与处理 |
| --- | --- |
| 插件已安装但看不到工作台 | 确认 API 已重启、助手已从模板创建且已发布、领域中间件启用，并检查当前用户的助手使用权 |
| 分析模型不可用 | 检查领域分析模型绑定、提供商连接、额度与授权；保留原记录，修复后重试 |
| 输出截断或超时 | 检查提供商的思考模式与输出额度；不要延长到无限超时，也不要接受半份 JSON |
| 格式或来源校验失败 | 结果不会写入，草稿保留；可在同一记录重试，不能据此填入未经证实的信息 |
| 草稿版本冲突 | 先保留本地输入，再重新加载已保存内容并核对；过期写入不覆盖新版本 |

本地/测试平台安装即可，不要求 npm 发布。Cloud 产品和其他宿主提交未单独验收；具体覆盖与未覆盖范围见 [第三阶段记录](phase-three.md)。
