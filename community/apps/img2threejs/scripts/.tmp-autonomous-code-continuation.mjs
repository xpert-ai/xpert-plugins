import { Client } from '/Users/xpertai/Pro/xpert-pro/node_modules/@xpert-ai/xpert-sdk/dist/index.js'
import {
  createRequestHeaders,
  resolveAuthentication
} from '/Users/xpertai/GitHub/os/xpert/tools/scripts/local-plugin-cli.mjs'

const apiOrigin = 'http://localhost:3000'
const organizationId = '5bdc8076-36cd-444a-9aa1-82ea0fa30496'
const tenantId = 'a3ed4e50-da8e-4b4b-aec1-87e1027ad3f1'
const assistantId = '6e266458-7287-47c1-9cbb-40fdc9419061'
const projectId = 'de2c1420-9ed5-4d2d-8219-68429a581bc1'
const authArgs = { apiUrl: apiOrigin, scope: 'organization', orgId: organizationId, tenantId }
const authentication = await resolveAuthentication(authArgs)
const headers = createRequestHeaders(authArgs, authentication.token, authentication.tenantId)
delete headers['content-type']
const client = new Client({ apiUrl: `${apiOrigin}/api/ai`, defaultHeaders: headers, timeoutMs: 60_000 })

const threadId = '2da1887d-8a4d-40f0-a950-a1bed31296d1'
process.stdout.write(JSON.stringify({ event: 'thread-selected', threadId }) + '\n')

const prompt = process.env.IMG2THREEJS_PROMPT ?? [
  `继续自主完成 Img2ThreeJs 项目 ${projectId} 的 Doraemon House 重建。你是唯一的模型代码作者。`,
  '先调用 img2threejs_get_status 获取权威状态，读取当前已接受代码、Workspace 候选和工具返回的真实失败诊断。自行修复所有确定性问题，再用 img2threejs_refine_code 提交。',
  '继续遵循工具状态推进到浏览器渲染，并调用 img2threejs_read_visual_diagnostics 读取真实图像与指标；根据证据自主改进，直到可以客观验收。不要发送 checksum、revision、baseRevision、runRevision 或 concurrency 字段。不要读取、复制、翻译或改造上游 img2threejs 源码。'
].join('\n')

const interesting = /read_skill_file|img2threejs_|sandbox_(?:read|write|append|edit|multi)|failureCodes|deterministicStatus|visualStatus|codeVersionId|sourceSha256|completed|compress|context|error/i
let eventCount = 0
for await (const event of client.runs.stream(threadId, assistantId, {
  input: { action: 'send', message: { input: { input: prompt } } },
  streamMode: ['updates', 'custom']
})) {
  eventCount += 1
  const serialized = JSON.stringify(event)
  if (interesting.test(serialized)) {
    process.stdout.write(`${serialized.length > 12000 ? serialized.slice(0, 12000) + '…' : serialized}\n`)
  }
}
process.stdout.write(JSON.stringify({ event: 'stream-complete', eventCount, threadId }) + '\n')
