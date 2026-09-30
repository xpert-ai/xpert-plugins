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

/** pdf 页数上限（M8' Minor）：简历正常远达不到百页，超限视为畸形文档，逐页抽取前先拦 */
export const RESUME_FILE_MAX_PDF_PAGES = 100

/** 简历字节支持的唯一两类格式（扩展名 + 魔数双重判定的结果枚举） */
export type ResumeFileKind = 'docx' | 'pdf'

/**
 * 简历字节的「类型判定」入口：扩展名初筛 + 魔数复核，供落盘存储与文本解析共用同一口径（spec §3.1/§3.5）。
 *
 * 职责边界（重要）：本函数只判定格式，**不校验体积**。brief 曾把「超尺寸」列入其抛错条件，但实现刻意不做——
 * 因为 `parseResumeFileContent` 重构前的失败优先级是「不认识扩展名 → 超尺寸 → 魔数不符」，
 * 一旦在本函数内加尺寸闸，就必须把它挪到 `parseResumeFileContent` 体积闸之前，
 * 会让「合法扩展名 + 超大 + 魔数不符」的上传从 file_too_large 漂成 unsupported_format。
 * 因此尺寸闸由各调用方自行套用 RESUME_FILE_MAX_BYTES：解析侧见 parseResumeFileContent，
 * 存储侧见 resume-file-store.ts；新增调用方若漏掉这一层，就等于对超大文件放行。
 * @param buffer 文件字节（只看前 5 字节魔数，长度不影响判定结果）
 * @param fileName 原始文件名；缺省或空串视为非法（上传通道缺名不可信）
 * @returns 'docx' 或 'pdf'
 * @throws ResumeFileParseError unsupported_format（扩展名不认识 / 内容与扩展名不符）；不会抛 file_too_large
 */
export function detectResumeFileKind(buffer: Buffer, fileName: string): ResumeFileKind {
  const lower = (fileName || '').toLowerCase()
  const isDocx = lower.endsWith('.docx')
  const isPdf = lower.endsWith('.pdf')
  if (!isDocx && !isPdf) {
    throw new ResumeFileParseError('unsupported_format', '仅支持 .docx / .pdf 文件')
  }
  const head = buffer.subarray(0, 5).toString('latin1')
  if (isDocx && !head.startsWith('PK')) {
    throw new ResumeFileParseError('unsupported_format', '文件内容与 .docx 扩展名不符')
  }
  if (isPdf && !head.startsWith('%PDF-')) {
    throw new ResumeFileParseError('unsupported_format', '文件内容与 .pdf 扩展名不符')
  }
  return isDocx ? 'docx' : 'pdf'
}

/**
 * 简历文件 → 纯文本。解析任务期内唯一文本来源，不落库（spec v2.2：sourceText 不再接受粘贴）。
 * 格式判定复用 detectResumeFileKind 的口径（扩展名 + 魔数），本函数只额外承担体积闸；
 * 体积闸必须先于魔数复核——伪装扩展名的超大文件应报 file_too_large 而非 unsupported_format（重构前即此顺序）。
 * 解析失败统一抛 ResumeFileParseError，
 * 由调用方（executeViewFileAction）转成队列失败行呈现，不产生候选人行。
 * @param buffer 文件字节（来自视图文件上传通道）
 * @param fileName 原始文件名（用于扩展名判定与指引文案，允许缺省视为非法名）
 * @returns 去首尾空白后的纯文本；抽取为空视为扫描件走异常
 */
export async function parseResumeFileContent(buffer: Buffer, fileName: string): Promise<string> {
  // 先按扩展名拦截不认识的后缀，再卡体积，保证失败原因与重构前一致
  const lower = (fileName || '').toLowerCase()
  if (!lower.endsWith('.docx') && !lower.endsWith('.pdf')) {
    throw new ResumeFileParseError('unsupported_format', '仅支持 .docx / .pdf 文件')
  }
  if (buffer.length > RESUME_FILE_MAX_BYTES) {
    throw new ResumeFileParseError('file_too_large', '文件超过 10MB，请压缩或拆分后重新上传')
  }
  // 到这里扩展名必然合法，detectResumeFileKind 实际只做魔数复核并给出最终 kind
  const kind = detectResumeFileKind(buffer, fileName)
  const text = kind === 'docx' ? await extractDocxText(buffer) : await extractPdfText(buffer)
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
    // 页数异常闸：畸形文档（巨页）会拖垮逐页抽取，先于循环快速失败（M8' Minor）
    if (doc.numPages > RESUME_FILE_MAX_PDF_PAGES) {
      throw new ResumeFileParseError('parse_error', `PDF 页数异常：${doc.numPages} 页超过 ${RESUME_FILE_MAX_PDF_PAGES} 页上限`)
    }
    const pages: string[] = []
    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo)
      const content = await page.getTextContent()
      // 按 item 顺序拼接，空格分隔保留词边界（不做列对齐还原——简历评分不依赖版式）
      pages.push(content.items.map((item: { str?: string }) => item.str || '').join(' '))
    }
    return pages.join('\n')
  } catch (error) {
    // 业务异常（页数闸等）原样透出，不做二次包装
    if (error instanceof ResumeFileParseError) {
      throw error
    }
    const message = String((error as Error)?.message || error)
    if (/encrypt|password/i.test(message)) {
      throw new ResumeFileParseError('encrypted', '文件已加密，请解除密码后重新上传')
    }
    throw new ResumeFileParseError('parse_error', `PDF 文件解析失败：${message}`)
  }
}
