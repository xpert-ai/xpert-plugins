# Xpert 插件：Pdfium

`@xpert-ai/plugin-pdfium` 是为 [Xpert AI](https://github.com/xpert-ai/xpert) 智能体平台提供的 PDF 转换工具集插件。它赋予智能体将 PDF 文件转换为 Markdown 格式的能力，同时提取文本和图像，以便在工作流中更轻松地处理。

## 安装

```bash
pnpm add @xpert-ai/plugin-pdfium
# 或
npm install @xpert-ai/plugin-pdfium
```

> **注意**：本插件依赖于 `@xpert-ai/plugin-sdk`、`@nestjs/common@^11`、`@hyzyla/pdfium`、`pngjs` 和 `zod` 作为 peer 依赖。启用插件前请在宿主项目中安装这些依赖。

## 快速开始

1. **注册插件**  
   在插件列表（环境变量或配置文件）中包含此包：

   ```sh .env
   PLUGINS=@xpert-ai/plugin-pdfium
   ```

   插件会自动启动 `PdfiumModule` NestJS 模块，注册工具集，并输出生命周期日志。

2. **为智能体配置工具集**

   - Xpert 控制台：添加内置工具集实例并选择 `PDF to Markdown`。
   - API：请求工具集 `pdfium`。

   无需凭证或密钥，任何授权智能体均可立即创建实例。

## Pdfium 工具集

| 字段     | 值                                                   |
| -------- | ---------------------------------------------------- |
| 名称     | `pdfium`                                             |
| 显示名称 | PDF to Markdown / PDF 转 Markdown                    |
| 分类     | `tools`                                              |
| 描述     | 将 PDF 文件转换为带有提取文本和页面图像的 Markdown。 |
| 配置     | 无需额外配置或外部集成。                             |

该工具集使用 `@hyzyla/pdfium` 渲染 PDF 页面并提取文本。图像保存为 PNG 文件。

## 工具

| 工具              | 作用                                                              | 输入说明                                                                                      | 输出                                                                                |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pdf_to_markdown` | 将 PDF 文件转换为 Markdown 文件，包含提取的文本和渲染的页面图像。 | `fileUrl`、`filePath` 或 `content`（base64/buffer）。可选 `fileName` 和 `scale`（默认 2.0）。 | JSON 对象，包含 `group`、`pageCount`、`content`（Markdown 字符串）和 `files` 列表。 |

### 示例输入输出

```json
// PDF to Markdown
{
  "tool": "pdf_to_markdown",
  "input": {
    "fileUrl": "https://example.com/document.pdf",
    "scale": 2.0
  }
}
```

工具返回一个 JSON 对象。智能体通常使用 `content` 字段获取 Markdown 文本，使用 `files` 字段访问生成的图像。

## 权限与安全

- **网络请求**：如果提供 `fileUrl`，则从 URL 获取 PDF。
- **文件系统**：将生成的 Markdown 和图像文件写入工作区卷。
- **日志**：仅输出轻量级生命周期日志。

## 开发与测试

```bash
npm install
npx nx build @xpert-ai/plugin-pdfium
npx nx test @xpert-ai/plugin-pdfium
```

## 许可证

本项目遵循仓库根目录下的 [AGPL-3.0 License](../../../LICENSE)。
