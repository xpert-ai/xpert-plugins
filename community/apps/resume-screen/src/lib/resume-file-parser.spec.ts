import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseResumeFileContent, ResumeFileParseError, ResumeFileParseReason } from './resume-file-parser'

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
