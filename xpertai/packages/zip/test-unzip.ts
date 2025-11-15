/**
 * 简单的 Unzip 插件测试脚本
 * 运行方式: npx tsx test-unzip.ts
 */

import { buildUnzipTool } from './src/lib/unzip.tool.js'
import { buildZipTool } from './src/lib/zip.tool.js'
import JSZip from 'jszip'

async function testUnzip() {
  console.log('🧪 开始测试 Unzip 插件功能...\n')

  // 1. 首先创建一个测试用的 zip 文件
  console.log('📦 步骤 1: 创建测试 zip 文件...')
  const zipTool = buildZipTool()
  
  const zipResult = await zipTool.invoke({
    files: [
      { name: 'test1.txt', content: '这是第一个测试文件\nHello World 1' },
      { name: 'test2.txt', content: '这是第二个测试文件\nHello World 2' },
      { name: 'subfolder/test3.txt', content: '这是子文件夹中的文件\nHello World 3' },
      { name: 'data.json', content: '{"key": "value", "number": 123}' }
    ],
    file_name: 'test-archive.zip'
  })

  const zipData = JSON.parse(zipResult as string)
  console.log(`✅ Zip 文件创建成功: ${zipData.filename}`)
  console.log(`   大小: ${(zipData.blob.length / 1024).toFixed(2)} KB\n`)

  // 2. 测试解压功能
  console.log('📂 步骤 2: 测试解压功能...')
  const unzipTool = buildUnzipTool()
  
  const unzipResult = await unzipTool.invoke({
    file: {
      name: zipData.filename,
      blob: zipData.blob
    }
  })

  const unzipData = JSON.parse(unzipResult as string)
  console.log(`✅ 解压成功！提取了 ${unzipData.files.length} 个文件\n`)

  // 3. 显示解压结果
  console.log('📄 步骤 3: 显示解压结果...')
  for (const file of unzipData.files) {
    const content = Buffer.from(file.blob, 'base64').toString('utf-8')
    console.log(`\n文件: ${file.filename}`)
    console.log(`  MIME 类型: ${file.mime_type}`)
    console.log(`  内容预览: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`)
  }

  // 4. 验证文件内容
  console.log('\n✅ 步骤 4: 验证文件内容...')
  const file1 = unzipData.files.find((f: any) => f.filename === 'test1.txt')
  const file2 = unzipData.files.find((f: any) => f.filename === 'test2.txt')
  const file3 = unzipData.files.find((f: any) => f.filename === 'subfolder/test3.txt')
  const jsonFile = unzipData.files.find((f: any) => f.filename === 'data.json')

  if (file1 && Buffer.from(file1.blob, 'base64').toString().includes('Hello World 1')) {
    console.log('✅ test1.txt 内容正确')
  }
  if (file2 && Buffer.from(file2.blob, 'base64').toString().includes('Hello World 2')) {
    console.log('✅ test2.txt 内容正确')
  }
  if (file3 && Buffer.from(file3.blob, 'base64').toString().includes('Hello World 3')) {
    console.log('✅ subfolder/test3.txt 内容正确')
  }
  if (jsonFile && jsonFile.mime_type === 'application/json') {
    console.log('✅ data.json MIME 类型识别正确')
  }

  console.log('\n🎉 所有测试通过！')
}

async function testUnzipWithRealZipFile() {
  console.log('\n🧪 测试 2: 使用真实 zip 文件测试...\n')

  // 创建一个包含不同类型文件的 zip
  const zip = new JSZip()
  zip.file('readme.md', '# 测试文档\n\n这是一个 Markdown 文件')
  zip.file('script.py', 'print("Hello from Python")')
  zip.file('config.json', '{"setting": "value"}')
  zip.file('image.png', Buffer.from('fake image data'))

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const zipArrayBuffer = await zipBlob.arrayBuffer()
  const zipBuffer = Buffer.from(zipArrayBuffer)
  const base64Zip = zipBuffer.toString('base64')

  const unzipTool = buildUnzipTool()
  const result = await unzipTool.invoke({
    file: {
      name: 'real-test.zip',
      blob: base64Zip
    }
  })

  const unzipData = JSON.parse(result as string)
  console.log(`✅ 成功解压 ${unzipData.files.length} 个文件:`)
  
  for (const file of unzipData.files) {
    console.log(`  - ${file.filename} (${file.mime_type})`)
  }
}

// 运行测试
testUnzip()
  .then(() => testUnzipWithRealZipFile())
  .catch((error) => {
    console.error('❌ 测试失败:', error)
    process.exit(1)
  })

