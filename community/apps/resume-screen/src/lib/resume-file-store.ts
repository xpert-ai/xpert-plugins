/**
 * 简历字节落盘存储（spec v5 §3.1/§3.2）
 *
 * v5 起原文不进库：上传通道把字节写进插件自己的存储目录（按 UTC 日期分桶），
 * 候选人行只保留 {filePath, fileSize, fileHash, fileMime}，其中 filePath 就是本模块返回的相对 key。
 * 本模块是全局唯一允许接触简历字节的出口——service 层因此可以完全不持有字节、只用内存仓储做单测。
 *
 * 不变量：
 * 1. key 与绝对路径全部由服务端生成，永不拼接用户文件名（防注入、防路径穿越）；
 * 2. 幂等键取内容 sha256，同字节重复上传复用同一份落盘文件，不复制；
 * 3. 任何读路径先过 resolveSafe，越出根目录即拒绝；
 * 4. 简历正文属敏感数据：调用方日志只允许出现 key/体积/hash，本模块不输出任何正文字节。
 *
 * 线程/并发特性：无共享可变状态，可并发调用。key 由内容唯一决定，同字节并发写入
 * 写的是同一份相同字节（writeFile 整文件覆盖），结果幂等，无需加锁。
 * 依赖：node:fs/promises + node:crypto，纯本地 IO，无网络、无模型调用。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { detectResumeFileKind, RESUME_FILE_MAX_BYTES, ResumeFileKind } from './resume-file-parser'

/** 一次落盘的完整结果：key 入库（相对路径，可安全下发到视图层做预览），absolutePath 仅服务端内部使用 */
export interface StoredResumeFile {
  /**
   * 相对存储根目录的 key，数据库 filePath 列存这个值。
   *
   * 形态固定为 `{yyyy-MM-dd UTC}/{sha256 前 16 位}.{ext}`，**没有第二段**：
   * 日期桶之后就是哈希前缀加后缀，不含 candidateId、不含随机段、不含用户文件名。
   * 这是硬契约——去重依赖「同一份字节算出同一个 key」，一旦追加任何可变后缀，
   * 重复上传就会各写一份副本，幂等探测失效。下游解析 key 时只允许切这两段。
   */
  key: string
  /** key 对应的绝对路径，供解析/预览直接 open，不外泄给前端 */
  absolutePath: string
  /** 字节数，落库为 fileSize，同时用于体积闸复核 */
  size: number
  /** 全文 sha256（十六进制小写），落库为 fileHash，是重复上传的幂等判定依据 */
  sha256: string
  /** 由 kind 推导的标准 MIME，落库为 fileMime，供预览与下载头使用 */
  mime: string
}

/** put 入参：字节 + 原始文件名（只用于扩展名判定，不参与 key 生成）+ 可选时间戳 */
export interface PutResumeFileInput {
  /** 上传通道拿到的完整文件字节，不允许为空 */
  buffer: Buffer
  /** 用户上传时的文件名；仅参与「扩展名 vs 魔数」一致性判定，绝不出现在落盘路径里 */
  fileName: string
  /** 分桶时间，缺省取当前时间；测试与回填场景传入固定值以获得确定性 key */
  date?: Date
}

/** kind → 标准 MIME：只有 docx/pdf 两类，用显式映射表而不是猜，避免与上游白名单漂移 */
const KIND_TO_MIME: Record<ResumeFileKind, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf'
}

/** key 中 sha256 前缀长度：16 位（64bit）足以在按天分桶内区分两份不同简历，同时保持文件名可读 */
const KEY_HASH_PREFIX_LENGTH = 16

/**
 * 简历字节 → 插件本地文件存储
 *
 * rootDir 必须是绝对路径（由 resolveFileStorageDir 从插件配置解析而来）。
 * 构造函数刻意不做任何磁盘操作：服务实例化时配置目录可能指向真实部署路径，
 * 提前 mkdir 会让「只是 new 一个服务」的单测产生副作用，也让只读部署在启动期就报错。
 */
export class ResumeFileStore {
  /** 归一化后的绝对根目录，所有 key 都相对它解析 */
  private readonly root: string

  /**
   * @param rootDir 存储根目录（绝对路径；相对路径会按 process.cwd() 解析后再使用）
   *        来源为插件安装配置 fileStorageDir 或环境变量兜底，属系统生成而非用户输入
   */
  constructor(rootDir: string) {
    this.root = resolve(rootDir)
  }

  /**
   * 落盘一份简历字节，返回可直接入库的描述子。
   *
   * 执行顺序即安全顺序：体积闸 → 类型闸 → 幂等探测 → 建目录 → 写文件。
   * 体积闸必须在本模块内独立执行——detectResumeFileKind 有意不管体积（为了保持
   * parseResumeFileContent 既有的失败优先级），所以不能指望共享函数覆盖这一层。
   *
   * @param input buffer 非空字节；fileName 仅用于扩展名判定；date 决定日期分桶，缺省为当前时间
   * @returns StoredResumeFile，key 为相对路径，size/sha256/mime 可直接写进候选人行
   * @throws Error 文件超过 10MB / 扩展名不认识 / 内容与扩展名不符（消息含「扩展名不符」）
   *         —— 非法字节一律零写入；底层 fs 异常（权限、磁盘满）原样透出，由调用方转成队列失败行
   */
  async put(input: PutResumeFileInput): Promise<StoredResumeFile> {
    const { buffer, fileName, date } = input
    if (!buffer || buffer.length === 0) {
      throw new Error('简历文件内容为空')
    }
    if (buffer.length > RESUME_FILE_MAX_BYTES) {
      throw new Error(`文件超过 ${Math.floor(RESUME_FILE_MAX_BYTES / (1024 * 1024))}MB 上限，请压缩或拆分后重新上传`)
    }
    // 扩展名 + 魔数双重判定（与文本解析同一口径），伪装后缀在这里就被拦下
    const kind = detectResumeFileKind(buffer, fileName)
    // 分桶时间只取一次：两次 new Date 若跨越 UTC 零点，key 的日期与 mkdir 的日期会不一致，
    // 结果是往一个未创建的目录写盘
    const now = date ?? new Date()
    const sha256 = createHash('sha256').update(buffer).digest('hex')
    const key = this.buildKey(now, sha256, kind)
    const absolutePath = this.resolveSafe(key)
    const mime = KIND_TO_MIME[kind]

    // 幂等复用：内容寻址，同字节必然同 key；已存在则不再写盘，避免重复上传堆积副本
    if (await this.exists(key)) {
      return { key, absolutePath, size: buffer.length, sha256, mime }
    }

    await mkdir(join(this.root, this.dateBucket(now)), { recursive: true })
    await writeFile(absolutePath, buffer)
    return { key, absolutePath, size: buffer.length, sha256, mime }
  }

  /**
   * 按 key 取回原始字节（解析链路唯一读取入口）。
   *
   * @param key 数据库中存的相对路径；不合法（越界/绝对路径）直接抛错，绝不回落 cwd
   * @returns 文件字节，与 put 时完全一致
   * @throws Error 非法文件路径（key 越出存储根）/ ENOENT（文件被运维按日期清理策略删除）
   */
  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveSafe(key))
  }

  /**
   * key 是否已落盘。
   *
   * @param key 相对路径；非法 key 视为「不存在」而不抛错，因为此方法用于幂等探测，
   *        调用方拿到 false 后会继续走写入路径，由 resolveSafe 在真正使用前再拦截
   * @returns 存在且为普通文件时 true
   */
  async exists(key: string): Promise<boolean> {
    try {
      const info = await stat(this.resolveSafe(key))
      return info.isFile()
    } catch {
      return false
    }
  }

  /**
   * 把相对 key 解析成绝对路径，并阻断一切越界尝试。
   *
   * 判定方式：resolve 后必须以 `root + sep` 开头（等于 root 本身也拒绝——根目录不是文件）。
   * 这样能同时挡住 `../` 穿越、绝对路径入参，以及 Windows 下的 `..\\` 变体。
   *
   * @param key 待解析路径，期望为 put 生成的相对 key；来自数据库，属半可信输入
   * @returns root 内的绝对路径
   * @throws Error 非法文件路径：{key}——空 key 同样拒绝
   */
  resolveSafe(key: string): string {
    if (!key) {
      throw new Error('非法文件路径：key 为空')
    }
    // 绝对路径一律拒绝：本模块只接受相对 key，绝对入参是攻击面而非便利
    if (isAbsolute(key)) {
      throw new Error(`非法文件路径：${key}`)
    }
    const candidate = resolve(this.root, key)
    if (!candidate.startsWith(this.root + sep)) {
      throw new Error(`非法文件路径：${key}`)
    }
    return candidate
  }

  /**
   * kind → MIME。
   *
   * @param kind 'docx' | 'pdf'
   * @returns 标准 MIME 字符串，用于入库 fileMime 与预览响应头
   */
  static kindToMime(kind: ResumeFileKind): string {
    return KIND_TO_MIME[kind]
  }

  /** UTC 日期分桶名（yyyy-MM-dd）：用 UTC 而非本地时区，保证跨时区部署下同一时刻落到同一桶 */
  private dateBucket(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  /**
   * 生成相对 key：`{yyyy-MM-dd UTC}/{sha256 前 16 位}{.docx|.pdf}`。
   *
   * key 必须完全由内容决定（不含随机段、不含用户文件名）：只有确定性才能命中幂等探测，
   * 让重复上传的同一份简历复用同一个文件而不是堆积副本。
   *
   * @param date 分桶时间
   * @param sha256 全文哈希
   * @param kind 已判定的文件类型，决定后缀
   */
  private buildKey(date: Date, sha256: string, kind: ResumeFileKind): string {
    return `${this.dateBucket(date)}/${sha256.slice(0, KEY_HASH_PREFIX_LENGTH)}.${kind}`
  }
}
