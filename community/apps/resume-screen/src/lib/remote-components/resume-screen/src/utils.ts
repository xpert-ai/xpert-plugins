/**
 * 远端组件通用工具
 *
 * iframe 侧的纯函数集合：bridge 消息解包、I18n 双语文案取值等。
 * 刻意保持零依赖（不 import 服务端 lib），保证浏览器 bundle 干净。
 */

// 判断普通对象（排除数组/null），bridge 消息校验与解包的基础原语
export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// 解包宿主响应：data/result/payload 三种包装字段依次取壳，都缺省时原样返回
export function unwrap(response: unknown): Record<string, unknown> {
  if (!isObject(response)) return {}
  if (Object.prototype.hasOwnProperty.call(response, 'data')) return asRecord(response.data)
  if (Object.prototype.hasOwnProperty.call(response, 'result')) return asRecord(response.result)
  if (Object.prototype.hasOwnProperty.call(response, 'payload')) return asRecord(response.payload)
  return response
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

// I18n 文本取值：本工作台按中文优先（宿主语言环境为中文部署），兼容纯字符串回执
export function resolveText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (isObject(value)) return String(value.zh_Hans || value.en_US || '')
  return String(value)
}
