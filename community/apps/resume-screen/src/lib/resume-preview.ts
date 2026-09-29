/**
 * 简历预览渲染管线（spec v5 §3.5）
 *
 * docx 在服务端用 mammoth 转 HTML 并消毒后下发（浏览器不解析 docx）；pdf 直接 base64，
 * 由 iframe 转 Blob URL 交给浏览器原生查看器。文本类正文只在任务内存流转，本模块输出
 * 的是「给人看的原始版式」，消毒是 XSS 唯一防线，白名单收紧不放宽。
 */
import { RESUME_FILE_MAX_BYTES, ResumeFileParseError, detectResumeFileKind } from './resume-file-parser'

export type ResumePreviewPayload = { kind: 'html'; html: string } | { kind: 'pdf'; base64: string }

// 整段删除的标签：可携带脚本、外部文档或 <style> 元素级样式表
// 注意口径边界：本层只删「元素」，内联 style 属性不在 spec §3.5 的删除清单内，因此不删；
// 同理外链像素类属性（srcset）也不清洗——收紧属于 spec 变更，不在此私自加。
const DROP_TAGS = ['script', 'iframe', 'object', 'embed', 'style', 'link', 'form', 'base', 'meta', 'noscript']

// 属性内需要清洗的危险协议值：本正则只匹配「原始文本形态」的前导空白与大小写（java\tscript 之类靠 \s* 挡）；
// 字符实体形态（&#106;avascript:…）不靠这里，而是先经 decodeForProtocolTest 解码后再由本正则判定。
const DANGEROUS_URL = /^\s*(javascript|data\s*:\s*text\/html|vbscript)/i

/**
 * 只为「属性值是否是危险协议」这一步做字符引用解码，解码结果绝不写回 HTML。
 *
 * 为什么只在属性判定这一层解码：HTML 分词器先切标签、之后才在属性态/文本态内解码字符引用，
 * 解码出来的 `<` 不会被重新分词成标签——所以「标签名用实体伪装」这类绕过本来就不存在，
 * 全文预归一反而会把 mammoth 已安全转义的正文 `&lt;b&gt;` 变成活的 `<b>`，凭空造出注入点。
 * 但属性值是浏览器解码后直接交给协议解析器的：`href="&#106;avascript:alert(1)"` 原始形态不匹配
 * DANGEROUS_URL，解码后却是真实 javascript: URL，因此必须在判定前解码。
 * 只解一层、不做不动点迭代：属性态同样只解码一轮，双重编码（`&amp;#106;avascript:`）解一次得到
 * 的字面量 `&#106;avascript:` 已是最终值，浏览器不会再解第二轮，故无需也不应循环解码。
 *
 * @param value 属性原始值（trim 前后由调用方处理）
 * @returns 解码一层后的字符串，仅用于协议判定；无法识别的实体原样保留
 */
function decodeForProtocolTest(value: string): string {
  try {
    return (
      value
        // 命名实体只列协议判定需要的这几个，其余原样保留以免破坏简历可读性
        .replace(/&(colon|tab|lpar|rpar);/gi, (_match, name: string) => NAMED_PROTOCOL_ENTITIES[name.toLowerCase()])
        .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) => codePointToChar(parseInt(hex, 16)))
        .replace(/&#(\d+);?/g, (_match, dec: string) => codePointToChar(parseInt(dec, 10)))
    )
  } catch {
    // 越界码点会让 fromCodePoint 抛 RangeError：解码只为判定服务，失败时退回原始值，
    // 判定强度不因此降低（原始值仍送 DANGEROUS_URL 测一轮），更不能让消毒整步崩溃。
    return value
  }
}

/** 码点 → 单个字符；越界码点折叠为空白，避免抛出且保持「前置空白可剥离」的判定语义 */
function codePointToChar(codePoint: number): string {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return ' '
  }
  return String.fromCodePoint(codePoint)
}

// 解码 `:` 与空白这几类可直接改写协议前缀形态的命名实体（键为小写实体名，不含 & ;）
const NAMED_PROTOCOL_ENTITIES: Record<string, string> = {
  colon: ':',
  tab: '\t',
  lpar: '(',
  rpar: ')'
}

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
      /\s+(?:href|src|xlink:href|formaction|action|srcdoc)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
      (match, double?: string, single?: string, bare?: string) => {
        const value = (double ?? single ?? bare ?? '').trim()
        // 放行 data:image/*（docx 内嵌图片）与安全协议；其余危险协议整条属性丢弃。
        // 双值判定：原始形态挡住 java\tscript 一类空白绕过，解码形态挡住 &#106;avascript 一类实体绕过；
        // 解码串只用于这里的判定，不写回 HTML（写回等于全文实体归一，会复活正文里已转义的标签）。
        if (DANGEROUS_URL.test(value) || DANGEROUS_URL.test(decodeForProtocolTest(value))) {
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
 * @returns docx → { kind:'html', html }（转换结果为空白时如实返回空串：预览展示的是版式而非文字层，
 *   前端渲染空白页是可读的真相，故本管线不设「内容为空」失败闸）；pdf → { kind:'pdf', base64 }
 * @exception ResumeFileParseError file_too_large（超过尺寸闸）/ unsupported_format（扩展名或魔数不认识）
 *   / parse_error（docx 解包失败）
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
  return { kind: 'html', html: sanitizePreviewHtml(converted.value) }
}
