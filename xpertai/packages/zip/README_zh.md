# zip

这是一个使用 [Nx](https://nx.dev) 生成的插件库。

## 描述

一个用于将多个文件压缩为 zip 文件以及从 zip 归档中提取文件的 TypeScript 插件。

## 功能特性

- **Zip 工具**: 将多个文件压缩为单个 zip 文件
- **Unzip 工具**: 从 zip 归档中提取文件

## 构建

运行 `nx build @xpert-ai/plugin-zip` 来构建该库。

## 运行单元测试

运行 `nx test @xpert-ai/plugin-zip` 通过 [Jest](https://jestjs.io) 执行单元测试。

## 测试

查看 [README-TEST_zh.md](./README-TEST_zh.md) 了解测试说明。

## 使用方法

### Zip 工具

将多个文件压缩为 zip 文件：

```typescript
{
  files: [
    { name: 'file1.txt', content: 'Content 1' },
    { name: 'file2.txt', content: 'Content 2' }
  ],
  file_name: 'archive.zip' // 可选，默认为 'files.zip'
}
```

**参数说明：**
- `files` (必需): 要压缩的文件数组
  - `name`: 文件名
  - `content`: 文件内容（字符串、Buffer 或 Uint8Array）
- `file_name` (可选): zip 文件的名称，如果不以 `.zip` 结尾会自动添加

**返回结果：**
```typescript
{
  blob: "base64编码的zip文件内容",
  mime_type: "application/zip",
  filename: "archive.zip"
}
```

### Unzip 工具

从 zip 归档中提取文件：

```typescript
{
  file: {
    name: 'archive.zip',
    content: <zip文件buffer或base64字符串>
  }
}
```

**参数说明：**
- `file` (必需): zip 文件对象
  - `name` 或 `filename`: 文件名（必须以 `.zip` 结尾）
  - `content` 或 `blob`: zip 文件内容（Buffer、Uint8Array 或 base64 字符串）

**返回结果：**
```typescript
{
  files: [
    {
      blob: "base64编码的文件内容",
      mime_type: "text/plain",
      filename: "file1.txt"
    },
    // ... 更多文件
  ]
}
```

## 使用示例

### 示例 1: 压缩多个文件

```typescript
import { buildZipTool } from './src/lib/zip.tool.js'

const zipTool = buildZipTool()

const result = await zipTool.invoke({
  files: [
    { name: 'readme.txt', content: '这是说明文件' },
    { name: 'data.json', content: '{"key": "value"}' }
  ],
  file_name: 'my-archive.zip'
})

const zipData = JSON.parse(result as string)
// zipData.blob 包含 base64 编码的 zip 文件
// zipData.filename 为 'my-archive.zip'
```

### 示例 2: 解压 zip 文件

```typescript
import { buildUnzipTool } from './src/lib/unzip.tool.js'
import { readFileSync } from 'fs'

const unzipTool = buildUnzipTool()

// 读取 zip 文件
const zipBuffer = readFileSync('archive.zip')
const base64Zip = zipBuffer.toString('base64')

// 解压
const result = await unzipTool.invoke({
  file: {
    name: 'archive.zip',
    blob: base64Zip
  }
})

const unzipData = JSON.parse(result as string)
// unzipData.files 包含所有提取的文件
for (const file of unzipData.files) {
  const content = Buffer.from(file.blob, 'base64').toString('utf-8')
  console.log(`文件: ${file.filename}, 内容: ${content}`)
}
```

## 支持的 MIME 类型

Unzip 工具会自动识别以下文件类型的 MIME 类型：

- **文档类型**: `.md`, `.markdown`, `.rst`, `.tex`, `.docx`, `.xlsx`, `.pptx`
- **代码类型**: `.py`, `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.sh`, `.bat`, `.ps1`
- **图片类型**: `.webp`, `.svg`, `.ico`
- **其他**: `.csv`, `.log`, `.env`, `.gitignore`, `.npmrc`, `.lock`

对于未识别的文件类型，将使用默认的 `application/octet-stream`。

## 注意事项

1. Zip 工具会自动跳过空文件数组或 null 值
2. Unzip 工具会自动跳过目录，只提取文件
3. 所有文件内容都以 base64 编码返回，便于在 JSON 中传输
4. 支持嵌套文件夹结构
