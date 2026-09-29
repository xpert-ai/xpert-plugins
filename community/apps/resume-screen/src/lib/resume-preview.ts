/**
 * 简历预览渲染管线（spec v5 §3.5）
 *
 * docx 在服务端用 mammoth 转 HTML 并消毒后下发（浏览器不解析 docx）；pdf 直接 base64，
 * 由 iframe 转 Blob URL 交给浏览器原生查看器。文本类正文只在任务内存流转，本模块输出
 * 的是「给人看的原始版式」，消毒是 XSS 唯一防线，白名单收紧不放宽。
 */
import { RESUME_FILE_MAX_BYTES, ResumeFileParseError, detectResumeFileKind } from './resume-file-parser'

export type ResumePreviewPayload = { kind: 'html'; html: string } | { kind: 'pdf'; base64: string }

// 整段删除的标签：可携带脚本、外部文档或样式注入
const DROP_TAGS = ['script', 'iframe', 'object', 'embed', 'style', 'link', 'form', 'base', 'meta', 'noscript']

// 属性内需要清洗的危险 URL 值（大小写/空白/实体前置都覆盖，正则里已允许前导空白）
const DANGEROUS_URL = /^\s*(javascript|data\s*:\s*text\/html|vbscript)/i

/**
 * 消毒 mammoth 产出的 HTML
 *
 * 为什么必须有这一层：docx 是完全外部可控的输入，mammoth 只做版式转换、不做任何安全过滤，
 * 转换结果会被 iframe 侧直接 innerHTML 渲染；本函数是这条链上唯一的 XSS 防线，
 * 因此口径只收紧不放宽（新增放行项必须改 spec，不能在此私自加）。
 * 实现取舍：不引入 DOM 级 sanitizer（DOMPurify/jsdom 等），一是 U1 红线禁止新增依赖，
 * 二是服务端无 DOM 环境；代价是纯文本替换，故按「删什么」穷举而非按「留什么」白名单匹配。
 *
 * @param html 未信任的 HTML 字符串（来源为上传的 docx 转换结果）
 * @returns 删除脚本/嵌入/事件属性/危险协议后的 HTML；常规排版标签原样保留
 */
export function sanitizePreviewHtml(html: string): string {
  let cleaned = html
  for (const tag of DROP_TAGS) {
    // 成对标签连内容一起删（[\s\S] 跨行），自闭合/空标签单独兜一轮
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), '')
    cleaned = cleaned.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '')
  }
  // 只在标签内部做属性替换，避免误删正文里的尖括号文本
  cleaned = cleaned.replace(/<[a-z][^>]*>/gi, (tag) => {
    let attrs = tag.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    attrs = attrs.replace(
      /\s+(?:href|src|xlink:href|formaction|action|data|srcdoc)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (match, double?: string, single?: string, bare?: string) => {
        const value = (double ?? single ?? bare ?? '').trim()
        // 放行 data:image/*（docx 内嵌图片）与安全协议；其余危险协议整条属性丢弃
        if (DANGEROUS_URL.test(value)) {
          return ''
        }
        return match
      }
    )
    return attrs
  })
  // 条件注释与 CDATA 是历史脚本载体，一律删除
  return cleaned.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
}

/**
 * 渲染简历预览载荷
 *
 * @param buffer 简历原始字节（来源为 ResumeFileStore.read，尺寸已受上传闸约束）
 * @param mime 落盘时记录的 mime；缺失或不准时按字节魔数复核
 * @returns docx → { kind:'html', html }；pdf → { kind:'pdf', base64 }
 * @exception ResumeFileParseError file_too_large（超过尺寸闸）/ unsupported_format（扩展名或魔数不认识）
 *   / parse_error（docx 解包失败）/ no_text_layer（转换结果为空白）
 */
export async function renderResumePreview(buffer: Buffer, mime: string): Promise<ResumePreviewPayload> {
  if (buffer.length > RESUME_FILE_MAX_BYTES) {
    throw new ResumeFileParseError('file_too_large', '简历文件超过 10MB，无法预览')
  }
  // kind 判定复用 T3 纯函数：扩展名 + 魔数双重校验，mime 只是提示
  const fileName = mime.includes('pdf') ? 'resume.pdf' : 'resume.docx'
  const kind = detectResumeFileKind(buffer, fileName)
  if (kind === 'pdf') {
    return { kind: 'pdf', base64: buffer.toString('base64') }
  }
  // mammoth 走延迟 require：与 resume-file-parser 同口径，避免 ESM/CJS 混载
  const mammoth = require('mammoth') as typeof import('mammoth')
  // try/catch 包装：junk zip 能过掉上面的魔数闸（前 4 字节即 PK\x03\x04），
  // 此时 mammoth 抛的是它自己的异常，message 可能带宿主临时路径，
  // 既不能透出给前端也不能让调用方按文案分支——统一折叠为 parse_error 类型化原因。
  // 原始 message 不做留存：预览渲染跑在队列 worker 内，失败原因与堆栈由上层统一记录，
  // 本模块是纯函数管线，直写 stdout 会绕过可注入 logger 约定。
  let converted: Awaited<ReturnType<typeof mammoth.convertToHtml>>
  try {
    converted = await mammoth.convertToHtml({ buffer })
  } catch {
    throw new ResumeFileParseError('parse_error', 'Word 文件解析失败，无法生成预览')
  }
  if (!converted.value?.trim()) {
    throw new ResumeFileParseError('no_text_layer', '简历内容为空，无法预览')
  }
  return { kind: 'html', html: sanitizePreviewHtml(converted.value) }
}
