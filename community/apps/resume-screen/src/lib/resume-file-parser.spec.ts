import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  detectResumeFileKind,
  parseResumeFileContent,
  RESUME_FILE_MAX_BYTES,
  ResumeFileKind,
  ResumeFileParseError,
  ResumeFileParseReason
} from './resume-file-parser'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name))

// 页数异常用例专用：伪造 pdf 只需通过魔数与体积闸，真正解析被桩接管（不依赖 101 页真实样本）
function fakePdfBuffer() {
  return Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.from('x'.repeat(64))])
}

// pdfjs 桩：doMock + 重新 require 被测模块，令其内部延迟 require 命中桩实现；
// afterEach 统一解除，避免污染同文件其余真实 pdf 用例
function withFakePdf(doc: { numPages: number; text?: string }) {
  jest.resetModules()
  jest.doMock('pdfjs-dist/legacy/build/pdf.js', () => ({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: doc.numPages,
        getPage: async () => ({ getTextContent: async () => ({ items: [{ str: doc.text ?? 'x' }] }) })
      })
    })
  }))
  return require('./resume-file-parser') as typeof import('./resume-file-parser')
}

afterEach(() => {
  jest.dontMock('pdfjs-dist/legacy/build/pdf.js')
  jest.resetModules()
})

describe('parseResumeFileContent', () => {
  it('extracts readable text from a docx resume', async () => {
    const text = await parseResumeFileContent(fixture('resume-minimal.docx'), 'resume-minimal.docx')
    expect(text).toContain('张三')
    expect(text).toContain('React')
  })

  it('extracts readable text from a pdf resume', async () => {
    const text = await parseResumeFileContent(fixture('resume-minimal.pdf'), 'resume-minimal.pdf')
    expect(text).toContain('Li Si')
    expect(text).toContain('Java')
  })

  it('fails with no_text_layer when extraction yields blank (scanned pdf)', async () => {
    await expect(parseResumeFileContent(fixture('resume-empty.pdf'), 'resume-empty.pdf')).rejects.toMatchObject({
      reason: 'no_text_layer'
    })
  })

  it('fails with encrypted for password-protected pdf', async () => {
    await expect(parseResumeFileContent(fixture('fake-encrypted.pdf'), 'fake-encrypted.pdf')).rejects.toMatchObject({
      reason: 'encrypted'
    })
  })

  it('rejects unsupported extensions before touching bytes', async () => {
    await expect(parseResumeFileContent(Buffer.from('hello'), 'resume.txt')).rejects.toBeInstanceOf(ResumeFileParseError)
    await expect(parseResumeFileContent(Buffer.from('hello'), 'resume.txt')).rejects.toMatchObject({
      reason: 'unsupported_format'
    })
  })

  it('rejects oversized files over 10MB', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    // 伪装成 pdf 魔数绕过格式嗅探，命中大小闸
    big.write('%PDF-1.7', 0)
    await expect(parseResumeFileContent(big, 'big.pdf')).rejects.toMatchObject({ reason: 'file_too_large' })
  })

  // 页数异常闸（M8' Minor）：简历正常不超过百页，超限视为畸形文档，快速失败不做逐页抽取
  it('rejects a pdf over 100 pages as page-count anomaly', async () => {
    const mod = withFakePdf({ numPages: 101, text: 'x' })
    const err = await mod.parseResumeFileContent(fakePdfBuffer(), 'huge.pdf').catch((e) => e)
    // 桩 doc 逐页抽取本可成功：旧实现会正常返回文本，新实现必须先于循环抛页数异常
    expect(err).toBeInstanceOf(mod.ResumeFileParseError)
    expect(err).toMatchObject({ reason: 'parse_error' })
    expect(String(err.message)).toContain('页数')
  })

  it('accepts a pdf exactly at the 100-page boundary', async () => {
    const mod = withFakePdf({ numPages: 100, text: 'boundary resume' })
    await expect(mod.parseResumeFileContent(fakePdfBuffer(), 'edge.pdf')).resolves.toContain('boundary resume')
  })

  it('maps parser crashes to parse_error with Chinese message', async () => {
    // PK 头 + 垃圾内容 = docx 解包必炸
    const junk = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not-a-real-zip')])
    const err = await parseResumeFileContent(junk, 'junk.docx').catch((e) => e)
    expect(err).toBeInstanceOf(ResumeFileParseError)
    expect(['parse_error', 'unsupported_format']).toContain(err.reason)
    expect((err.message || '').length).toBeGreaterThan(0)
  })
})

describe('ResumeFileParseError', () => {
  it('carries the reason enum', () => {
    const reasons: ResumeFileParseReason[] = ['unsupported_format', 'file_too_large', 'encrypted', 'no_text_layer', 'parse_error']
    const e = new ResumeFileParseError('encrypted', '文件已加密')
    expect(reasons).toContain(e.reason)
    expect(e.message).toBe('文件已加密')
  })
})

// detectResumeFileKind：落盘存储与文本解析共用的类型判定纯函数（spec §3.1/§3.5）
describe('detectResumeFileKind', () => {
  it('按扩展名与魔数一致判定 docx/pdf', () => {
    expect(detectResumeFileKind(fixture('resume-minimal.docx'), '张三-简历.docx')).toBe('docx')
    expect(detectResumeFileKind(fixture('resume-minimal.pdf'), '张三-简历.pdf')).toBe('pdf')
  })

  it('伪装扩展名（pdf 名但内容是 docx 的 PK 头）判为不支持格式', () => {
    const docx = fixture('resume-minimal.docx')
    // 名称声称「判为不支持格式」，就必须把 reason 与文案一起钉住：只断言异常类型时 reason 写错也能通过
    expect(() => detectResumeFileKind(docx, 'fake.pdf')).toThrow(/扩展名不符/)
    let caught: unknown
    try {
      detectResumeFileKind(docx, 'fake.pdf')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ResumeFileParseError)
    expect(caught).toMatchObject({ reason: 'unsupported_format' })
  })

  it('未知扩展名给出「仅支持 .docx / .pdf」指引', () => {
    expect(() => detectResumeFileKind(Buffer.from('hello'), 'resume.txt')).toThrow(/仅支持/)
  })

  it('空文件名视为非法（上传通道缺名不可信）', () => {
    expect(() => detectResumeFileKind(Buffer.from('x'), '')).toThrow(ResumeFileParseError)
  })

  it('超大字节照常返回 kind——体积不在本函数职责内（尺寸闸属各调用方）', () => {
    // 反向钉住职责边界：若将来有人往共享函数里塞尺寸闸（brief 原文的说法），本用例即红，
    // 逼作者去面对「会把 parseResumeFileContent 的失败优先级改掉」这个后果
    const oversizedPdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(RESUME_FILE_MAX_BYTES, 1)])
    expect(detectResumeFileKind(oversizedPdf, 'big.pdf')).toBe('pdf')
  })
})

// 重构红线：parseResumeFileContent 三条闸的先后顺序必须钉死。
// 不认识扩展名 → 体积 → 魔数 的顺序一旦改成「先整体调用 detectResumeFileKind」，
// 「合法后缀 + 超大 + 魔数不符」的上传会从 file_too_large 漂成 unsupported_format，
// 而 UI 按 reason 映射指引文案（resume-screen-view.provider.ts），用户看到的重试建议随之改变。
describe('parseResumeFileContent gate ordering invariant', () => {
  /** 略超 10MB：长度只需 MAX+1，避免用例反复分配大块内存 */
  const oversize = (head: string) => Buffer.concat([Buffer.from(head), Buffer.alloc(RESUME_FILE_MAX_BYTES, 1)])

  it('体积闸先于魔数复核：合法后缀 + 超大 + 魔数不符 → file_too_large', async () => {
    // 关键构造：头部是 PK zip 魔数而文件名是 .pdf —— 两种顺序在此输入上必然分歧：
    //   体积闸在前 → file_too_large（重构前行为，本用例期望）
    //   魔数复核在前（删掉扩展名预检、直接整体调用 detectResumeFileKind）→ unsupported_format
    // 注：既有「rejects oversized files over 10MB」用例把 %PDF-1.7 写进 pdf 命名的 buffer，
    // 魔数合法，两种顺序都返回 file_too_large，因此钉不住本不变量。
    await expect(parseResumeFileContent(oversize('PK\x03\x04'), 'big.pdf')).rejects.toMatchObject({ reason: 'file_too_large' })
  })

  it('体积闸先于魔数复核：另一侧交叉伪装同样 → file_too_large', async () => {
    // .docx 名 + %PDF- 头：魔数复核会判 unsupported_format，故只有体积闸在前才能得到 file_too_large
    await expect(parseResumeFileContent(oversize('%PDF-'), 'big.docx')).rejects.toMatchObject({ reason: 'file_too_large' })
  })

  it('不认识的后缀先于体积闸：超大 + .txt → unsupported_format', async () => {
    // 优先级另一侧也要钉住：若把体积闸提到扩展名预检之前，本用例变红
    await expect(parseResumeFileContent(oversize('%PDF-'), 'big.txt')).rejects.toMatchObject({ reason: 'unsupported_format' })
  })
})

/**
 * 特征化测试（characterization）：锁定本次抽取前后两个入口的可观察行为逐格一致。
 * 这不是新行为的 TDD —— 每格期望值都取自重构前的旧实现，目的是把「对外行为逐字不变」
 * 这条红线从报告里的临时矩阵变成仓库里可复跑的凭证。
 * 维度：fileName（大小写后缀 / 无后缀 / 空名 / .pdfx / 尾随空格）× bytes（魔数形态）× size（限内 / 超限）。
 * parse 列全部构造为「必然停在判定层」，不进 mammoth/pdfjs，因此期望值与解析库版本无关；
 * 判定放行的正例单独用真实 fixture 走端到端文本抽取。
 */
describe('resume file gate behavior matrix (characterization)', () => {
  const oversize = (head: string) => Buffer.concat([Buffer.from(head), Buffer.alloc(RESUME_FILE_MAX_BYTES, 1)])

  type MatrixRow = {
    fileName: string
    bytes: Buffer
    /** detectResumeFileKind 期望正常返回的类型；与 detectReason 互斥 */
    kind?: ResumeFileKind
    /** detectResumeFileKind 的期望抛错 reason；缺省表示该入口不覆盖此格 */
    detectReason?: ResumeFileParseReason
    /** parseResumeFileContent 的期望抛错 reason；缺省表示该入口不覆盖此格 */
    parseReason?: ResumeFileParseReason
  }

  const rows: MatrixRow[] = [
    // --- 扩展名不认识：先于体积与魔数（重构前即此优先级）---
    { fileName: 'resume.txt', bytes: Buffer.from('hello'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    { fileName: 'resume.txt', bytes: Buffer.from('%PDF-'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    { fileName: 'resume.txt', bytes: Buffer.from('PK\x03\x04'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    { fileName: 'noext', bytes: Buffer.from('%PDF-'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    // .pdfx 不以 .pdf 结尾（endsWith 判定），不得被误认为合法后缀
    { fileName: 'weird.pdfx', bytes: Buffer.from('%PDF-'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    // 空名 / 缺省名：上传通道缺 originalname 时按空串下发，实现内 `fileName || ''` 兜底后判为非法
    { fileName: '', bytes: Buffer.from('%PDF-'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    // 尾随空格后缀不做 trim：与重构前一致判为非法扩展名
    { fileName: 'resume.pdf ', bytes: Buffer.from('%PDF-'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    // 超大 + 未知后缀：仍由扩展名预检先给出 unsupported_format
    { fileName: 'big.txt', bytes: oversize('%PDF-'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    // --- 内容与扩展名不符（交叉伪装 / 空 buffer 无魔数可辨）---
    { fileName: 'fake.pdf', bytes: Buffer.from('PK\x03\x04wordprocessingml'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    { fileName: 'fake.docx', bytes: Buffer.from('%PDF-1.7resume'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    { fileName: 'empty.pdf', bytes: Buffer.alloc(0), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    { fileName: 'empty.docx', bytes: Buffer.alloc(0), detectReason: 'unsupported_format', parseReason: 'unsupported_format' },
    // --- 尺寸维度：体积闸先于魔数复核（详见上方 ordering invariant describe）---
    { fileName: 'big.pdf', bytes: oversize('PK\x03\x04'), detectReason: 'unsupported_format', parseReason: 'file_too_large' },
    { fileName: 'big.docx', bytes: oversize('%PDF-'), detectReason: 'unsupported_format', parseReason: 'file_too_large' },
    // 超大 + 合法后缀 + 合法魔数：判定放行给出 kind，门面仍先命中尺寸闸
    { fileName: 'big-ok.pdf', bytes: oversize('%PDF-'), kind: 'pdf', parseReason: 'file_too_large' },
    { fileName: 'big-ok.DOCX', bytes: oversize('PK\x03\x04'), kind: 'docx', parseReason: 'file_too_large' },
    // --- 大小写后缀：判定层放行（kind 正确）---
    { fileName: 'resume.PDF', bytes: Buffer.from('%PDF-1.7'), kind: 'pdf' },
    { fileName: 'resume.DOCX', bytes: Buffer.from('PK\x03\x04word'), kind: 'docx' },
    // 不足 5 字节的前缀拿不到完整 '%PDF-'，判为内容与扩展名不符（重构前后同一口径）
    { fileName: 'short.pdf', bytes: Buffer.from('%PDF'), detectReason: 'unsupported_format', parseReason: 'unsupported_format' }
  ]

  for (const r of rows) {
    const label = `${JSON.stringify(r.fileName)} × ${r.bytes.subarray(0, 5).toString('latin1')} × ${r.bytes.length}B`
    if (r.kind !== undefined) {
      it(`detectResumeFileKind passes through → ${label}`, () => {
        expect(detectResumeFileKind(r.bytes, r.fileName)).toBe(r.kind)
      })
    }
    if (r.detectReason) {
      it(`detectResumeFileKind rejects → ${label}`, () => {
        expect(outcomeOfDetect(r.bytes, r.fileName)).toBe(r.detectReason)
      })
    }
    if (r.parseReason) {
      it(`parseResumeFileContent rejects → ${label}`, async () => {
        await expect(parseResumeFileContent(r.bytes, r.fileName)).rejects.toMatchObject({ reason: r.parseReason })
      })
    }
  }

  // 判定放行的正例走真实 fixture：确认门面端到端仍能解析出文本（合成 buffer 只会得到解析层原因，比不了）
  it('parseResumeFileContent 对判定放行且真实的 docx / pdf 正常返回文本', async () => {
    await expect(parseResumeFileContent(fixture('resume-minimal.docx'), 'resume.DOCX')).resolves.toContain('张三')
    await expect(parseResumeFileContent(fixture('resume-minimal.pdf'), 'resume.PDF')).resolves.toContain('Li Si')
  })
})

/** 把 detectResumeFileKind 的抛错压平成 reason，便于表驱动逐格比对（成功格不从这里断言） */
function outcomeOfDetect(buffer: Buffer, fileName: string): ResumeFileParseReason {
  try {
    detectResumeFileKind(buffer, fileName)
    throw new Error(`特征化矩阵期望抛错但通过了判定：${fileName}`)
  } catch (error) {
    if (error instanceof ResumeFileParseError) return error.reason
    throw error
  }
}
