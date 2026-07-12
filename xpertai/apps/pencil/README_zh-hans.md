# Pencil

[English](./README.md)

Pencil 是面向 Xpert 的多人协同 Agentic 设计应用。它将可编辑设计画布、AI 设计助手、持久化文档、实时协作、可审阅版本和生产级文件导出整合到同一个工作空间中。

人和智能体操作的是同一份结构化文档，不再通过静态截图反复传递结果。用户可以在 Workbench 中直接选择和编辑设计元素，智能体则能理解当前打开的文档、页面和选中节点，继续调整布局、内容和样式，并生成可交付文件。

## 为什么使用 Pencil

传统的 AI 设计流程经常停留在生成代码或不可编辑的预览图。Pencil 将生成结果保留为结构化、可持续编辑的设计文档：

- **与智能体共同设计** —— 让 Pencil Assistant 创建页面、补充区块、改写文案、整理布局、应用视觉样式、检查节点或分析整个设计。
- **在原生画布中编辑** —— 支持页面、图层、Frame、文本、形状、组件、变量、约束、自动布局、填充、描边、特效等结构化 Pencil 元素。
- **多人实时协同** —— 用户和智能体共享同一份基于 Yjs 的工作文档，并展示协作者状态、实时光标、选区、正在操作的元素、断线恢复及协同撤销/重做。
- **保留有意义的历史** —— 普通编辑只更新工作副本，不会频繁制造版本；只有用户点击“保存版本”或智能体显式调用保存工具时，才创建不可变版本。
- **完整文件流转** —— 可从 Xpert Workspace Files 导入 `.fig`、`.pen`，并导出 `.fig`、PNG、JPG、WebP、SVG、PDF 或 JSX。
- **持续理解当前上下文** —— Assistant 能获得当前文档、页面、节点、选区、修订号和未保存状态，从而优先修改当前设计，而不是误建新文档。

## 产品体验

### Pencil Workbench

全屏 Workbench 是 Pencil 文档的主要工作界面，提供：

- 设计文档切换与新建
- 多页面画布导航
- 页面、图层和素材面板
- 设计属性与代码检查
- 缩放、平移、选择和画布内直接编辑
- 导入、导出、保存、恢复、审阅、归档和删除
- 协作者头像、连接状态、实时光标、选区和智能体操作标识
- 基于 Xpert CSS variables 的宿主主题适配

### Pencil Assistant

插件内置的 Assistant Template 将自然语言请求连接到 Pencil middleware tools，可以：

- 创建空白文档或生成真实感示例设计
- 搜索和检查已有文档
- 读取当前文档、页面或选中节点
- 创建和修改节点、布局、样式、组件、变量与矢量路径
- 对复杂设计执行小范围 JSX 渲染和增量修复
- 通过 Workspace Files 导入和导出文件
- 显式保存版本、更新审阅状态，并记录可恢复失败

智能体执行修改工具时会作为虚拟协作者出现在协作者列表中，因此多人、多智能体共同编辑同一文档的过程清晰可见。

## 协作与版本

Pencil 使用 Xpert 平台级 `platform.collaboration` 能力。平台负责安全 session、Yjs 同步、presence、断线补偿和多节点消息传递；Pencil 负责设计文档 schema 与画布交互。

工作副本是实时协同状态，版本则是用户主动建立的里程碑：

1. 用户和智能体共同编辑工作副本。
2. 变更通过增量方式同步，不自动创建版本。
3. 点击“保存版本”后，记录包含当前设计图和视图上下文的不可变检查点。
4. 恢复旧版本只更新当前工作副本，不覆盖历史版本。

文档和版本按照租户、组织、工作空间/项目以及 Xpert 身份进行隔离。

## 文件格式

| 方向 | 格式 | 说明 |
| --- | --- | --- |
| 导入 | `.fig`、`.pen` | 从当前 Xpert 工作空间读取，并保留结构化设计图数据。 |
| 导出 | `.fig` | 生成可继续编辑的设计文件。 |
| 导出 | PNG、JPG、WebP | 支持目标节点，以及可用时的缩放和质量参数。 |
| 导出 | SVG | 面向页面或节点的矢量输出。 |
| 导出 | PDF | 适用于设计审阅与交付分享。 |
| 导出 | JSX | 供后续开发流程使用的结构化设计表示。 |

所有导出结果都会写入 Xpert Workspace Files，并返回可移植文件引用，不暴露本机绝对路径。

## 插件包含的能力

- `Pencil Workbench` Remote Component
- `Pencil Assistant` 模板
- `Pencil Agent Skill`
- Agent middleware 与经过筛选的 Open Pencil core tools
- 平台 Collaboration 文档 Provider
- 租户、工作空间、项目及 Xpert 作用域的数据持久化
- 工作副本、不可变版本、操作日志和结构化失败报告
- Workspace Files 导入与导出集成

## 典型工作流

1. 打开 Pencil，新建文档、导入已有文件，或让 Assistant 生成初稿。
2. 在画布上直接修改，或者通过自然语言描述需要调整的内容。
3. 与团队成员和智能体共同编辑，并查看对方所在页面、光标、选区或目标元素。
4. 在重要审阅节点手动保存版本。
5. 将文档标记为草稿、已审阅或已归档。
6. 将所需设计格式导出到 Workspace Files。

## 开发与验证

在 `xpert-plugins` 仓库根目录执行：

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-pencil
pnpm -C xpertai exec nx build @xpert-ai/plugin-pencil
npx -y node@20 plugin-dev-harness/dist/index.js \
  --workspace ./xpertai \
  --plugin @xpert-ai/plugin-pencil
```

插件运行时要求 Xpert 宿主提供 Workspace Files 和 `platform.collaboration` 能力。

## 许可证

Pencil 使用 [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) 许可证发布，并使用 Open Pencil runtime 提供结构化设计编辑和文件处理能力。
