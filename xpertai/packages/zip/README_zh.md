# Xpert 插件：Zip

`@xpert-ai/plugin-zip` 是为 [Xpert AI](https://github.com/xpert-ai/xpert) 智能体平台提供的文件压缩/解压工具集插件。它为智能体提供 Zip 和 Unzip 工具，使其能在工作流中直接打包中间产物或检查上传的压缩包。

## 安装

```bash
pnpm add @xpert-ai/plugin-zip
# 或
npm install @xpert-ai/plugin-zip
```

> **注意**：本插件依赖于 `@xpert-ai/plugin-sdk`、`@nestjs/common@^11`、`@nestjs/config@^4`、`@langchain/core@0.3.72`、`chalk@4.1.2` 和 `zod@3.25.67` 作为 peer 依赖。启用插件前请在宿主项目中安装这些依赖。

## 快速开始

1. **安装与构建**  
  将依赖添加到宿主服务并重新构建，以便插件可被发现。

2. **注册插件**  
  在插件列表（环境变量或配置文件）中包含此包：

  ```sh .env
  PLUGINS=@xpert-ai/plugin-zip
  ```

  插件会自动启动 `ZipPlugin` 的 NestJS 模块，注册工具集，并输出生命周期日志。

3. **为智能体配置工具集**  
  - Xpert 控制台：添加内置工具集实例并选择 `Zip`。  
  - API：请求工具集 `zip`。  

  无需凭证或密钥，任何授权智能体均可立即创建实例。

## Zip 工具集

| 字段        | 值                                                                 |
| ----------- | ------------------------------------------------------------------ |
| 名称        | `zip`                                                              |
| 显示名称    | Zip / 压缩文件                                                     |
| 分类        | `tools`                                                            |
| 描述        | 在智能体工作流中压缩多个文件或解压归档文件。                       |
| 配置        | 无需额外配置或外部集成。                                           |

工具集基于 `jszip`，在内存中读写压缩包。文件以 base64 字符串交换，可安全通过 JSON 传递。

## 工具

| 工具      | 作用                                                                 | 输入说明                                                                                                                                         | 输出 |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `zip`     | 将多个文件打包为 `.zip` 压缩包并以 base64 形式返回。                  | `files[]`：每项需包含 `name`/`filename` 和 `content`（字符串、Buffer 或 `Uint8Array`）。可选 `file_name` 控制压缩包名称（默认为 `files.zip`）。 | JSON 字符串，含 `blob`（base64 zip）、`mime_type`、`filename`。 |
| `unzip`   | 解压 `.zip` 压缩包，自动推断文件 MIME 类型。                         | `file`：需提供以 `.zip` 结尾的 `name`/`filename` 及 `content`/`blob`（Buffer、`Uint8Array` 或 base64 字符串）。目录会自动跳过。                  | JSON 字符串，含 `files[]`（每项含 `blob`、`mime_type`、`filename`）。 |

### 示例输入输出

```json
// Zip
{
  "tool": "zip",
  "input": {
   "files": [
    { "name": "README.md", "content": "# intro" },
    { "name": "data/data.json", "content": "{\"value\": 1}" }
   ],
   "file_name": "bundle.zip"
  }
}
```

```json
// Unzip
{
  "tool": "unzip",
  "input": {
   "file": {
    "name": "bundle.zip",
    "blob": "<base64-encoded zip>"
   }
  }
}
```

每个工具返回 JSON 文本。智能体通常通过 `JSON.parse(result)` 解析结果，获取 base64 格式的二进制数据。无效输入会返回由 `getErrorMessage` 生成的友好错误信息。

## MIME 检测与行为

- 内置映射覆盖常见文档类型（如 `.md`、`.docx`、`.xlsx`、`.pptx`）、代码文件（如 `.py`、`.ts`、`.json` 等）、图片（如 `.webp`、`.svg`、`.ico`）及其他格式（如 `.csv`、`.env`、`.gitignore`）。
- 未知扩展名默认为 `application/octet-stream`。
- Zip 工具会忽略空文件项；Unzip 工具跳过目录，若压缩包为空或无效则返回错误。

## 权限与安全

- **无外部网络请求**：所有压缩/解压均在本地完成。
- **文件系统**：工具仅操作内存缓冲区，除非智能体自行读写文件，否则无需文件系统权限。
- **日志**：仅输出轻量级生命周期日志（如 `register`、`onStart`、`onStop`）。

## 开发与测试

```bash
npm install
npx nx build @xpert-ai/plugin-zip
npx nx test @xpert-ai/plugin-zip
```

手动测试说明请参见 `packages/zip/README-TEST.md`（及中文版）。构建产物位于 `packages/zip/dist`，发布前请确保编译文件、类型声明和包元数据一致。

## 许可证

本项目遵循仓库根目录下的 [AGPL-3.0 License](../../../LICENSE)。
