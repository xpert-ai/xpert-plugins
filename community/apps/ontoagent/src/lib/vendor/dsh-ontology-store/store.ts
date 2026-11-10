/**
 * 本体存储：append-only JSONL + 分块 Merkle manifest + 快照。
 * 版本 = manifest 内容哈希（可复算：同 (base, ops) → 同 manifest）。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { foldOps, type Assertion, type Op } from '../dsh-ontology-core/index.js'

export const CHUNK_SIZE = 1000
/** 未提供时间时的固定值：保持版本哈希可复算（不读时钟） */
export const NEW_EPOCH = '1970-01-01T00:00:00.000Z'

export interface Manifest {
  version: string
  ops: number
  chunks: string[]
  updatedAt: string
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

const canonical = (op: Op): string => JSON.stringify(op)

/**
 * 日志中间行损坏（不是尾部撕裂）。读路径必须 fail-closed：
 * 若静默跳过，`fold()`/`version()` 会把"少了一条"当成合法状态，下一次 `append()`
 * 还会用新 manifest 把损坏洗白成正式版本。
 */
export class StoreCorruptionError extends Error {
  readonly code = 'STORE_CORRUPT'
  constructor(readonly corrupt: number[], readonly tornTail: number) {
    super('STORE_CORRUPT: 日志中间行损坏（行号从 0 计）' + JSON.stringify(corrupt) +
      (tornTail > 0 ? '，尾部残缺=' + String(tornTail) : ''))
    this.name = 'StoreCorruptionError'
  }
}

export class OntologyStore {
  private readonly logPath: string
  private readonly manifestPath: string
  /**
   * 读缓存：ops 日志是 append-only，按 (mtime, size) 失效即可。
   * 缓存只用于读路径；append 后立即重建，跨进程追加也能被 size 变化发现。
   * `foldCached()` 返回的对象按只读约定使用（服务层只读，不修改断言）。
   */
  private cached?: { mtimeMs: number; size: number; ops: Op[]; table: Map<string, Assertion>; manifest: Manifest }

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
    this.logPath = join(dir, 'ops.jsonl')
    this.manifestPath = join(dir, 'manifest.json')
  }

  /** @param at 由调用方传入时间（工程纪律 §4：确定性模块不读时钟） */
  /**
   * 追加。**一条一行、一次一写**：批量拼成一个 buffer 再写，被 SIGKILL 打断会留下撕裂行
   * （B4 实测抓到过）。逐条写把撕裂窗口压到单行，且让"最长只有最后一行可能不完整"成为可断言的性质。
   */
  append(ops: Op[], at = NEW_EPOCH): Manifest {
    // 先验 + 修复：损坏的日志不可追加（否则新 manifest 会以"少一条"的口径把损坏洗白）；
    // 尾部撕裂行必须先截掉，否则新行会粘在半行后面，把尾部撕裂变成中间损坏。
    const before = this.readOps()
    if (before.corrupt.length > 0) throw new StoreCorruptionError(before.corrupt, before.tornTail)
    if (before.tornTail > 0) this.truncateTornTail()
    for (const op of ops) appendFileSync(this.logPath, canonical(op) + '\n', { encoding: 'utf8' })
    const read = this.readOps()
    // 并发写者可能在两步之间弄坏日志：此时 ops 已写入，但绝不写 manifest（不掩盖、可人工核对）。
    if (read.corrupt.length > 0) throw new StoreCorruptionError(read.corrupt, read.tornTail)
    const manifest = this.buildManifest(read.ops, at)
    this.writeManifest(manifest)
    const sig = this.signature()
    if (sig !== null) {
      this.cached = { ...sig, ops: read.ops, table: foldOps([], read.ops).table, manifest }
    } else {
      this.cached = undefined
    }
    return manifest
  }

  /**
   * 只有"日志确实不存在"才返回 null；权限/IO 错误必须继续抛。
   * 否则 EACCES 会被折叠成空库：`version()` 照常出哈希、`fold()` 返回 0 条（读崩了看起来像没数据）。
   */
  private signature(): { mtimeMs: number; size: number } | null {
    try {
      const s = statSync(this.logPath)
      return { mtimeMs: s.mtimeMs, size: s.size }
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') return null
      throw err
    }
  }

  /**
   * 截掉尾部撕裂行：它从未成为一条完整 op（可能只是 SIGKILL 留下的半个字节），
   * 不属于事实源。用 truncate 而不是重写整份日志。
   * 注意撕裂行**可能带尾随换行**（半个 JSON + '\n'），所以按"最后一条非空行"截，而不是按最后一个换行。
   */
  private truncateTornTail(): void {
    const lines = readFileSync(this.logPath, 'utf8').split('\n')
    let last = lines.length - 1
    while (last >= 0 && lines[last]!.trim().length === 0) last -= 1
    if (last < 0) return
    const kept = lines.slice(0, last)
    const text = kept.length === 0 ? '' : kept.join('\n') + '\n'
    truncateSync(this.logPath, Buffer.byteLength(text, 'utf8'))
  }

  /** 读路径的缓存 ops；外部追加由 size/mtime 触发重读。 */
  private cachedOps(): Op[] {
    const sig = this.signature()
    if (sig === null) {
      const manifest = this.buildManifest([], NEW_EPOCH)
      this.cached = { mtimeMs: 0, size: 0, ops: [], table: new Map(), manifest }
      return []
    }
    if (this.cached !== undefined && this.cached.mtimeMs === sig.mtimeMs && this.cached.size === sig.size) {
      return this.cached.ops
    }
    const read = this.readStrict()
    this.cached = { ...sig, ops: read.ops, table: foldOps([], read.ops).table, manifest: this.buildManifest(read.ops, NEW_EPOCH) }
    return read.ops
  }

  /** 严格读：中间行损坏直接抛错，而不是返回一个"少了损坏行"的集合。 */
  private readStrict(): { ops: Op[]; tornTail: number } {
    const read = this.readOps()
    if (read.corrupt.length > 0) throw new StoreCorruptionError(read.corrupt, read.tornTail)
    return read
  }

  /** 只读视图：缓存表直接返回；调用方不得修改断言对象。 */
  foldCached(): Map<string, Assertion> {
    this.cachedOps()
    return this.cached!.table
  }

  /** manifest 原子替换：先写 .tmp 再 rename。直接 writeFileSync 会**先截断再写**，中途死掉就只剩空文件。 */
  private writeManifest(manifest: Manifest): void {
    const tmp = this.manifestPath + '.tmp'
    writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n')
    renameSync(tmp, this.manifestPath)
  }

  /**
   * 读日志并区分"尾部残缺"与"中间残缺"。
   * 契约：SIGKILL 可能让**最后一行**不完整（无 fsync + 无校验记录时无法避免），
   * 但中间行残缺 = 真损坏，必须报出来而不是静默跳过。
   */
  readOps(): { ops: Op[]; tornTail: number; corrupt: number[] } {
    let text: string
    try {
      text = readFileSync(this.logPath, 'utf8')
    } catch (err) {
      // 只有"确实不存在"才是空库；EACCES 等必须抛（existsSync 会把权限错误也折叠成 false）
      if ((err as { code?: string }).code === 'ENOENT') return { ops: [], tornTail: 0, corrupt: [] }
      throw err
    }
    const lines = text.split('\n').filter((line) => line.trim().length > 0)
    const ops: Op[] = []
    const corrupt: number[] = []
    let tornTail = 0
    for (let i = 0; i < lines.length; i += 1) {
      try {
        ops.push(JSON.parse(lines[i]) as Op)
      } catch {
        if (i === lines.length - 1) tornTail += 1
        else corrupt.push(i)
      }
    }
    return { ops, tornTail, corrupt }
  }

  ops(): Op[] {
    // 浅拷贝数组，避免调用方 push/splice 污染缓存；断言对象本身按只读约定使用。
    return [...this.cachedOps()]
  }

  /** fold：状态 = fold(日志)（不就地更新）。base 为空时走缓存表。 */
  fold(base: Assertion[] = []): Map<string, Assertion> {
    if (base.length === 0) return new Map(this.foldCached())
    return foldOps(base, this.cachedOps()).table
  }

  /** 分块 Merkle：每 CHUNK_SIZE 条一组，组哈希再哈希成版本 */
  buildManifest(ops: Op[], at = NEW_EPOCH): Manifest {
    const chunks: string[] = []
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const slice = ops.slice(i, i + CHUNK_SIZE)
      chunks.push(sha(slice.map(canonical).join('\n')))
    }
    const version = 'sha256:' + sha(chunks.join('|') + '#' + ops.length).slice(0, 32)
    return { version, ops: ops.length, chunks, updatedAt: at }
  }

  version(): string {
    this.cachedOps()
    return this.cached!.manifest.version
  }

  manifest(): Manifest | null {
    try {
      return JSON.parse(readFileSync(this.manifestPath, 'utf8')) as Manifest
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') return null
      throw err
    }
  }

  /** 清理遗留的 .tmp（rename 前死掉会留下它，属正常残留）。 */
  cleanupTmp(): void {
    const tmp = this.manifestPath + '.tmp'
    if (existsSync(tmp)) unlinkSync(tmp)
  }

  /** 快照：物化当前状态，供读取加速（日志仍是事实源） */
  snapshot(base: Assertion[] = []): { version: string; assertions: Assertion[] } {
    const table = base.length === 0 ? this.foldCached() : this.fold(base)
    const assertions = [...table.values()].sort((a, b) => a.id.localeCompare(b.id))
    writeFileSync(join(this.dir, 'snapshot.json'), JSON.stringify({
      version: this.version(), assertions,
    }, null, 2) + '\n')
    return { version: this.version(), assertions }
  }
}