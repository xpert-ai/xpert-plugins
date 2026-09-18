# 来源、许可与基线

## 基线版本

开始开发时（2026-09-17）获取两个仓库 main 的最新代码：

| 仓库 | 基线 commit | 说明 |
| --- | --- | --- |
| `xpert-ai/xpert`（平台） | `2b5756576af0f5aa9faa8e404e153fb4cd50482a` | 未修改；实际测试也是这个 commit |
| `xpert-ai/xpert-plugins`（插件） | `9d108933273f8c9a2241a38882781a2685b6716b` | 功能分支 `feat/complaint-triage-app` 从这里创建 |
| `xpert-ai/xpert-skills`（开发指导） | `467976ae6bc916849716210b4518e0350029c068` | 只读参考，不进入交付物 |

插件依赖 `@xpert-ai/plugin-sdk` 与 `@xpert-ai/contracts` **3.18.6**（与上述平台 commit 内置版本一致），精确版本锁在 `pnpm-lock.yaml`。本作品**不需要修改平台**，也不依赖商业版功能。

## 复用范围与自己的改动

本插件没有 vendor 任何第三方源码，全部业务代码（`src/`、`tests/`、`scripts/`）为本次新写。参考和复用如下：

| 来源 | 许可 | 怎么用的 | 自己的改动 |
| --- | --- | --- | --- |
| `community/apps/dockyard`（同仓库） | AGPL-3.0 | **参考结构，未复制代码**：独立包 + 自带 lockfile 的组织方式、`packageExtensions` 补齐 SDK 缺失依赖的做法、`runtime: 'esm'` 的远程组件清单写法、六份面试文档的目录结构 | 业务、数据模型、工具、界面、测试全部不同 |
| `xpert-ai/xpert-skills` 的 `xpert-agentic-app-developer` / `xpert-plugin-development` | 见该仓库 | 作为开发规范遵循：系统级插件 + `artifactNamespace`、租户/组织隔离列、工具参数“只让模型提供判断”、结果用紧凑 DTO、`verboseParsingErrors`、禁用 Web Storage、`verify:dist` | — |
| `@xpert-ai/plugin-sdk` 的 `renderRemoteModuleIframeHtml` 及 `xui-*` 样式 | AGPL-3.0（随平台） | 运行时由宿主 SDK 渲染 iframe 外壳与主题变量；界面控件用 SDK 自带的 `xui-*` 类 | 只写了布局样式 `src/lib/remote/app.css` |
| React 18、esbuild、TypeORM、zod、LangChain core、sql.js、tsx | 各自的 MIT / Apache-2.0 等 | 正常依赖；React 打进 iframe 包，其余为宿主提供的 peer 或仅用于构建、测试 | — |
| 脚手架 `community/scripts/create-package.mjs` | 同仓库 | 生成初始骨架（第一个 commit） | 之后替换为实际实现 |

插件自身按仓库惯例声明 `AGPL-3.0`。

## AI 生成代码

代码由 AI 开发工具（Claude Code）在本人给定的选题、范围和取舍下生成，并经过类型检查、单元测试、生命周期测试和平台内实际操作验证；协作过程见 [AI 协作说明](04-ai-collaboration.md)。提交信息中的 `Co-Authored-By` 如实标注了这一点。

## 凭证与隐私

仓库中没有任何真实密钥、令牌、账号或租户 / 组织标识。模型密钥只在平台的模型提供商配置里填写；部署登录通过当前进程环境变量传入，示例见 [deploy.env.example](deploy.env.example)。示例客诉、客户称呼、订单号均为虚构。
