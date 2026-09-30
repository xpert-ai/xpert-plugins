/**
 * ResumeFileStore 单测（Task 4）。
 *
 * 隔离口径：全部用例在 beforeEach 用 mkdtemp 建临时根目录，afterEach 递归删除——
 * 禁止写进插件目录或默认 data/resume-screen，否则单测会污染真实存储目录。
 * 字节一律来自 __fixtures__ 的真实 docx/pdf（魔数与扩展名同源），不伪造头部，
 * 保证「扩展名 + 魔数」两条判定链路与线上一致。
 */
import { readFileSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RESUME_FILE_MAX_BYTES } from './resume-file-parser'
import { ResumeFileStore } from './resume-file-store'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name))
const PDF_BYTES = fixture('resume-minimal.pdf')
const DOCX_BYTES = fixture('resume-minimal.docx')

// 固定 UTC 时刻：日期分桶必须完全由入参 date 决定，否则用例结果随运行时间漂移
const FIXED_UTC = new Date('2026-09-29T02:00:00.000Z')

describe('ResumeFileStore', () => {
  let root: string
  let store: ResumeFileStore
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'rs-store-'))
    store = new ResumeFileStore(root)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('按 UTC 日期分桶落盘并返回相对 key', async () => {
    const saved = await store.put({ buffer: PDF_BYTES, fileName: '张三-简历.pdf', date: FIXED_UTC })
    // key 只有「日期桶 / 哈希前缀 + 后缀」两部分，严禁任何第二段（candidateId、随机或时间后缀）：
    // 一旦容忍尾段，本条断言就挡不住「重新引入随机后缀」这类改动——它会照样通过，
    // 同时悄悄毁掉下一条幂等用例守护的「同字节必得同 key」。故这里精确匹配完整 key。
    const hashPrefix = saved.sha256.slice(0, 16)
    expect(saved.key).toBe(`2026-09-29/${hashPrefix}.pdf`)
    expect(hashPrefix).toMatch(/^[0-9a-f]{16}$/)
    expect(saved.key.startsWith(root)).toBe(false) // key 必须是相对路径
    expect(await readdir(join(root, '2026-09-29'))).toHaveLength(1)
  })

  it('同字节二次上传复用同一 key（sha256 幂等，不复制文件）', async () => {
    const first = await store.put({ buffer: PDF_BYTES, fileName: 'a.pdf', date: FIXED_UTC })
    const second = await store.put({ buffer: PDF_BYTES, fileName: 'b.pdf', date: FIXED_UTC })
    expect(second.sha256).toBe(first.sha256)
    expect(await readdir(join(root, '2026-09-29'))).toHaveLength(1)
  })

  it('拒绝扩展名与内容不符的字节（伪装 pdf）', async () => {
    await expect(store.put({ buffer: DOCX_BYTES, fileName: 'fake.pdf', date: FIXED_UTC })).rejects.toThrow(/扩展名不符/)
  })

  it('拒绝超过 10MB 的字节（与上传闸同值）', async () => {
    await expect(
      store.put({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1), fileName: 'big.pdf', date: FIXED_UTC })
    ).rejects.toThrow()
  })

  it('resolveSafe 阻断目录穿越与绝对路径', () => {
    expect(() => store.resolveSafe('../../etc/passwd')).toThrow(/非法文件路径/)
    expect(() => store.resolveSafe('/etc/passwd')).toThrow(/非法文件路径/)
    // resolveSafe 的文档声称连 Windows 反斜杠变体一起挡，这里必须真的验一次
    expect(() => store.resolveSafe('..\\..\\windows\\win.ini')).toThrow(/非法文件路径/)
    expect(store.resolveSafe('2026-09-29/a.pdf').startsWith(root)).toBe(true)
  })

  it('read 在碰磁盘之前就拒绝穿越 key（非法路径而非 ENOENT）', async () => {
    await expect(store.read('../../etc/passwd')).rejects.toThrow(/非法文件路径/)
    // 空根目录即证明拦截发生在 resolveSafe，readFile 根本没被执行到
    expect(await readdir(root)).toEqual([])
  })

  it('read 能取回原始字节，exists 对不存在 key 返回 false', async () => {
    const saved = await store.put({ buffer: PDF_BYTES, fileName: 'a.pdf', date: FIXED_UTC })
    expect((await store.read(saved.key)).equals(PDF_BYTES)).toBe(true)
    expect(await store.exists('2026-09-29/missing.pdf')).toBe(false)
  })

  // 以下三条守护本模块的安全/契约不变量：文件名绝不进 key、构造不落盘、超大字节零写入
  it('用户文件名不出现在 key 与落盘路径中（防注入与路径穿越）', async () => {
    const hostile = '../../evil\0.pdf'
    const saved = await store.put({ buffer: PDF_BYTES, fileName: hostile, date: FIXED_UTC })
    expect(saved.key).not.toContain('evil')
    expect(saved.absolutePath).not.toContain('evil')
    expect(saved.absolutePath.startsWith(join(root, '2026-09-29'))).toBe(true)
  })

  it('构造函数不创建任何目录（目录只在 put 时懒建）', async () => {
    const unusedRoot = join(root, 'never-created')
    new ResumeFileStore(unusedRoot)
    expect(await readdir(root)).toEqual([])
  })

  it('体积闸命中时不落盘任何字节（先校验后写盘）', async () => {
    const oversized = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(RESUME_FILE_MAX_BYTES, 1)])
    await expect(store.put({ buffer: oversized, fileName: 'big.pdf', date: FIXED_UTC })).rejects.toThrow()
    expect(await readdir(root)).toEqual([])
  })

  // put 的第一道闸：零字节输入连 sha256/key 都无从谈起，必须在建目录写盘前拒绝，
  // 否则会上游生成一个空文件占据内容寻址 key，污染幂等探测
  it('拒绝空内容字节（零字节绝不建 key、不落盘）', async () => {
    await expect(store.put({ buffer: Buffer.alloc(0), fileName: 'empty.pdf', date: FIXED_UTC })).rejects.toThrow(
      '简历文件内容为空'
    )
    // 根目录仍为空 = 空输入零写入（连日期桶目录都不建）
    expect(await readdir(root)).toEqual([])
  })

  // 空 key 的两处防线：resolveSafe 直接拒绝（绝不把根目录本身当读路径回落），
  // exists 借此把非法 key 归为「不存在」，让幂等探测继续走写入路径由 resolveSafe 兜底拦截
  it('空 key 在路径解析前即拒绝；exists 对空 key 视为不存在而不抛错', async () => {
    expect(() => store.resolveSafe('')).toThrow('key 为空')
    await expect(store.exists('')).resolves.toBe(false)
  })
})
