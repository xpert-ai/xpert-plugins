# Zip 插件测试指南

## 快速测试 Unzip 功能

### 方法 1: 使用测试脚本（推荐）

运行测试脚本：

```bash
cd xpertai/packages/zip
npx tsx test-unzip.ts
```

这个脚本会：
1. 创建一个包含多个文件的 zip 文件
2. 使用 unzip 工具解压它
3. 验证解压结果和文件内容
4. 测试 MIME 类型识别

### 方法 2: 手动测试

#### 步骤 1: 创建一个测试 zip 文件

你可以使用任何工具创建一个 zip 文件，或者使用 Node.js：

```javascript
import JSZip from 'jszip'
import { writeFileSync } from 'fs'

const zip = new JSZip()
zip.file('test.txt', 'Hello World')
zip.file('data.json', '{"key": "value"}')

const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
writeFileSync('test.zip', zipBuffer)
```

#### 步骤 2: 在代码中使用 Unzip 工具

```typescript
import { buildUnzipTool } from './src/lib/unzip.tool.js'
import { readFileSync } from 'fs'

const unzipTool = buildUnzipTool()

// 读取 zip 文件
const zipBuffer = readFileSync('test.zip')
const base64Zip = zipBuffer.toString('base64')

// 解压
const result = await unzipTool.invoke({
  file: {
    name: 'test.zip',
    blob: base64Zip
  }
})

// 解析结果
const data = JSON.parse(result as string)
console.log('解压的文件:', data.files)
```

### 方法 3: 在 Xpert 平台中测试

1. 构建插件：
   ```bash
   npx nx build @xpert-ai/plugin-zip
   ```

2. 在 Xpert 平台中安装插件

3. 使用 zip 工具创建一个 zip 文件

4. 使用 unzip 工具解压该文件

## 测试用例

### 基本功能测试

- ✅ 解压包含多个文件的 zip
- ✅ 解压包含子文件夹的 zip
- ✅ 跳过空文件夹
- ✅ 识别文件 MIME 类型
- ✅ 处理 base64 编码的 zip 文件
- ✅ 处理 Buffer 格式的 zip 文件

### 错误处理测试

- ✅ 非 zip 文件错误
- ✅ 空文件错误
- ✅ 无效 zip 文件错误
- ✅ 空 zip 文件错误

## 预期结果

成功解压后，应该返回：

```json
{
  "files": [
    {
      "blob": "base64编码的文件内容",
      "mime_type": "text/plain",
      "filename": "test.txt"
    }
  ]
}
```

