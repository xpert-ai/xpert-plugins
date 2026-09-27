/**
 * 简历文件解析模块：上传文件 → 纯文本的唯一入口（spec v2.2 蓝图 D5/§8.3）。
 * 依赖 mammoth（docx）与 pdfjs-dist 3.x legacy CJS 构建（pdf），二者均为运行时依赖（F6）；
 * 无任何模型/网络调用，纯本地字节 → 文本，失败以 ResumeFileParseError.reason 区分四类可执行指引。
 */

/** 录入前失败的可执行原因（spec v2.2 §8.3 失败分支①），UI 按 reason 映射指引文案 */
export type ResumeFileParseReason = 'unsupported_format' | 'file_too_large' | 'encrypted' | 'no_text_layer' | 'parse_error'

export class ResumeFileParseError extends Error {
  readonly reason: ResumeFileParseReason
  constructor(reason: ResumeFileParseReason, message: string) {
    super(message)
    this.name = 'ResumeFileParseError'
    this.reason = reason
  }
}

/** 与 spec v2.2 蓝图 D5 一致：单文件 10MB 上限 */
export const RESUME_FILE_MAX_BYTES = 10 * 1024 * 1024

/**
 * 简历文件 → 纯文本。上传链路唯一文本来源（spec v2.2：sourceText 不再接受粘贴）。
 * 按扩展名初筛 + 魔数复核，防止伪装后缀；解析失败统一抛 ResumeFileParseError，
 * 由调用方（executeViewFileAction）转成队列失败行呈现，不产生候选人行。
 * @param buffer 文件字节（来自视图文件上传通道）
 * @param fileName 原始文件名（用于扩展名判定与指引文案，允许缺省视为非法名）
 * @returns 去首尾空白后的纯文本；抽取为空视为扫描件走异常
 */
export async function parseResumeFileContent(buffer: Buffer, fileName: string): Promise<string> {
  const lower = (fileName || '').toLowerCase()
  const isDocx = lower.endsWith('.docx')
  const isPdf = lower.endsWith('.pdf')
  if (!isDocx && !isPdf) {
    throw new ResumeFileParseError('unsupported_format', '仅支持 .docx / .pdf 文件')
  }
  if (buffer.length > RESUME_FILE_MAX_BYTES) {
    throw new ResumeFileParseError('file_too_large', '文件超过 10MB，请压缩或拆分后重新上传')
  }
  // 魔数复核：docx 是 zip（PK\x03\x04），pdf 以 %PDF- 开头
  const head = buffer.subarray(0, 5).toString('latin1')
  if (isDocx && !head.startsWith('PK')) {
    throw new ResumeFileParseError('unsupported_format', '文件内容与 .docx 扩展名不符')
  }
  if (isPdf && !head.startsWith('%PDF-')) {
    throw new ResumeFileParseError('unsupported_format', '文件内容与 .pdf 扩展名不符')
  }
  const text = isDocx ? await extractDocxText(buffer) : await extractPdfText(buffer)
  if (!text.trim()) {
    throw new ResumeFileParseError('no_text_layer', '无法提取文字（可能为扫描件），请转存为 Word 后重新上传')
  }
  return text.trim()
}

/** docx 抽取：mammoth 的 extractRawText 按段落输出纯文本；解包异常统一折叠为 parse_error */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    // mammoth 纯 JS 解析 docx（office open xml），extractRawText 输出段落分隔的纯文本
    // 延迟 require：仅 docx 分支加载，避免 pdf 上传白白付出 mammoth 的模块初始化成本
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return String(result.value || '')
  } catch (error) {
    throw new ResumeFileParseError('parse_error', `Word 文件解析失败：${(error as Error).message}`)
  }
}

/**
 * pdf 抽取：逐页 getTextContent 拼接（保留词边界空格，不做列对齐还原——评分不依赖版式）。
 * 加密类异常（PasswordException 等消息含 encrypt/password）映射为 encrypted 指引解除密码，
 * 其余崩溃折叠为 parse_error，由上层呈现重试建议。
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // pdfjs-dist 锁定 3.x legacy CJS 构建（v4 为纯 ESM，与本仓 jest/ts-node CJS 链不兼容——决策 F6）
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false }).promise
    const pages: string[] = []
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo)
      const content = await page.getTextContent()
      // 按 item 顺序拼接，空格分隔保留词边界（不做列对齐还原——简历评分不依赖版式）
      pages.push(content.items.map((item: { str?: string }) => item.str || '').join(' '))
    }
    return pages.join('\n')
  } catch (error) {
    const message = String((error as Error)?.message || error)
    if (/encrypt|password/i.test(message)) {
      throw new ResumeFileParseError('encrypted', '文件已加密，请解除密码后重新上传')
    }
    throw new ResumeFileParseError('parse_error', `PDF 文件解析失败：${message}`)
  }
}
