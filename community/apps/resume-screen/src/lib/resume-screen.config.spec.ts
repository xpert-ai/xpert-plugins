/**
 * 插件配置模式、环境变量默认值与存储目录解析单元测试
 *
 * 覆盖四类场景：schema 默认值解析、越界批量数与空白存储目录拒绝、
 * 环境变量缺省/非法时回退默认值（含「已设置但为空白」的告警可观测性）、合法环境变量正确读取，
 * 以及 resolveFileStorageDir 把配置目录解析为绝对路径（v5 简历字节落盘根目录）。
 * S7 审核 F2 裁决：`enabled` 无消费语义已从配置面整体移除，用例不再断言该项。
 */
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  readResumeScreenPluginEnvDefaults,
  RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR,
  resolveFileStorageDir,
  ResumeScreenPluginConfigFormSchema,
  ResumeScreenPluginConfigSchema
} from './resume-screen.config'

describe('ResumeScreenPluginConfigSchema', () => {
  it('parses defaults', () => {
    const config = ResumeScreenPluginConfigSchema.parse({})
    expect(config).toEqual({
      maxResumesPerBatch: 10,
      scoreThreshold: 60,
      fileStorageDir: RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR
    })
  })

  it('rejects out-of-range batch size', () => {
    expect(() => ResumeScreenPluginConfigSchema.parse({ maxResumesPerBatch: 21 })).toThrow()
    expect(() => ResumeScreenPluginConfigSchema.parse({ maxResumesPerBatch: 0 })).toThrow()
  })

  // 已声明无 enabled 配置：历史安装残留的 enabled 字段应被 zod 静默剥离而不是报错
  it('strips the retired enabled key instead of failing validation', () => {
    expect(ResumeScreenPluginConfigSchema.parse({ enabled: false })).toEqual({
      maxResumesPerBatch: 10,
      scoreThreshold: 60,
      fileStorageDir: RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR
    })
  })
})

describe('readResumeScreenPluginEnvDefaults', () => {
  // 保存原始 process.env，用例结束后整体还原，避免污染其他测试进程的全局环境
  const ORIGINAL_ENV = process.env

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('falls back to defaults when env is unset or invalid', () => {
    delete process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH']
    delete process.env['RESUME_SCREEN_SCORE_THRESHOLD']
    delete process.env['RESUME_SCREEN_FILE_STORAGE_DIR']
    expect(readResumeScreenPluginEnvDefaults()).toEqual({
      maxResumesPerBatch: 10,
      scoreThreshold: 60,
      fileStorageDir: RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR
    })

    // 非数字的批量数必须被拒绝并回退默认值，而不是让 NaN 进入配置
    process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH'] = 'not-a-number'
    expect(readResumeScreenPluginEnvDefaults().maxResumesPerBatch).toBe(10)
  })

  it('reads valid env values', () => {
    process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH'] = '5'
    process.env['RESUME_SCREEN_SCORE_THRESHOLD'] = '75'
    delete process.env['RESUME_SCREEN_FILE_STORAGE_DIR']
    expect(readResumeScreenPluginEnvDefaults()).toEqual({
      maxResumesPerBatch: 5,
      scoreThreshold: 75,
      fileStorageDir: RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR
    })
  })

  // 运维把存储目录误设为空白时仍会回退默认值（零配置可启动的兜底不变），
  // 但必须留下告警，否则「简历落在哪个目录」在线上无从查证
  it('存储目录被设为空白时回退默认并告警一次，未设置或合法值都不告警', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      delete process.env['RESUME_SCREEN_FILE_STORAGE_DIR']
      expect(readResumeScreenPluginEnvDefaults().fileStorageDir).toBe(RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR)
      expect(warnSpy).not.toHaveBeenCalled()

      process.env['RESUME_SCREEN_FILE_STORAGE_DIR'] = ' \t '
      expect(readResumeScreenPluginEnvDefaults().fileStorageDir).toBe(RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR)
      expect(warnSpy).toHaveBeenCalledTimes(1)
      expect(warnSpy.mock.calls[0][0]).toContain('RESUME_SCREEN_FILE_STORAGE_DIR 为空白、已回退默认目录')

      // 合法值与数值项非法都不属于本告警的范围：只针对「已设置但空白的目录」这一种降级
      warnSpy.mockClear()
      process.env['RESUME_SCREEN_FILE_STORAGE_DIR'] = '/srv/rs-resume'
      process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH'] = 'not-a-number'
      expect(readResumeScreenPluginEnvDefaults().fileStorageDir).toBe('/srv/rs-resume')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('fileStorageDir', () => {
  // 本组用例同样改写 process.env：整体还原，避免污染同文件其它用例与后续测试进程
  const ORIGINAL_ENV = process.env

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  // 空白目录会把简历字节写到进程 cwd 根，属于必须拒绝的非法配置
  it('拒绝空或全空白的存储目录', () => {
    expect(() => ResumeScreenPluginConfigSchema.parse({ fileStorageDir: '' })).toThrow()
    expect(() => ResumeScreenPluginConfigSchema.parse({ fileStorageDir: '   ' })).toThrow()
  })

  // 管理端表单必须与 schema 同源：标题中英文齐备、默认值一致，否则配置页出现空标签项
  it('管理端表单与 schema 同源：默认值与中英文标题齐备', () => {
    const properties = ResumeScreenPluginConfigFormSchema.properties as Record<
      string,
      { type?: string; default?: string; title?: Record<string, string> }
    >
    expect(properties.fileStorageDir.type).toBe('string')
    expect(properties.fileStorageDir.default).toBe(RESUME_SCREEN_DEFAULT_FILE_STORAGE_DIR)
    expect(properties.fileStorageDir.title).toEqual({
      en_US: 'Resume file storage directory',
      zh_Hans: '简历文件存储目录'
    })
  })

  it('环境变量缺省与全空白都回退默认目录，合法值原样采纳', () => {
    // 数值项一并清空：整对象断言要求 10/60，不能依赖其它用例残留的环境变量
    delete process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH']
    delete process.env['RESUME_SCREEN_SCORE_THRESHOLD']
    delete process.env['RESUME_SCREEN_FILE_STORAGE_DIR']
    expect(readResumeScreenPluginEnvDefaults().fileStorageDir).toBe('data/resume-screen')

    process.env['RESUME_SCREEN_FILE_STORAGE_DIR'] = '   '
    expect(readResumeScreenPluginEnvDefaults().fileStorageDir).toBe('data/resume-screen')

    process.env['RESUME_SCREEN_FILE_STORAGE_DIR'] = '/srv/rs-resume'
    expect(readResumeScreenPluginEnvDefaults()).toEqual({
      maxResumesPerBatch: 10,
      scoreThreshold: 60,
      fileStorageDir: '/srv/rs-resume'
    })
  })
})

describe('resolveFileStorageDir', () => {
  it('相对路径按 process.cwd() 解析，绝对路径原样返回（跨平台）', () => {
    expect(resolveFileStorageDir('data/resume-screen')).toBe(join(process.cwd(), 'data', 'resume-screen'))
    const absolute = join(process.cwd(), 'srv', 'resume')
    expect(resolveFileStorageDir(absolute)).toBe(absolute)
    expect(resolveFileStorageDir('  data/resume-screen  ')).toBe(join(process.cwd(), 'data', 'resume-screen'))
  })

  /**
   * isAbsolute 短路的负向/透传用例：本分支存在的意义就是「不要把已定锚的路径再喂给 resolve」。
   *
   * 两类候选都跑（`/` 根与本机 join 出的绝对路径），但不写只在本机成立的 OS 分支：
   * 期望全部由 node:path 推导——isAbsolute 为真要求逐字透传、为假要求被定锚，
   * 于是同一条业务规则在 win32 与 POSIX 上都能表达；改形与否决定负向断言是否生效。
   */
  it('isAbsolute 判真的路径必须逐字透传，不被重新定锚（含 / 根与本机绝对路径两类）', () => {
    let mutatedByResolve = false
    for (const input of ['/srv/rs-resume', join(process.cwd(), 'srv', 'resume')]) {
      const reanchored = resolve(process.cwd(), input)
      if (reanchored !== input) {
        mutatedByResolve = true
        // 这条断言绑定「按 isAbsolute 决定」的规则本身：实现退化为无条件 resolve 即红
        expect(resolveFileStorageDir(input)).not.toBe(reanchored)
      }
      expect(resolveFileStorageDir(input)).toBe(isAbsolute(input) ? input : reanchored)
      expect(resolveFileStorageDir(`  ${input}  `)).toBe(isAbsolute(input) ? input : reanchored)
    }
    // 兜底防「空跑」：至少一个候选必须真的会被重新定锚改形，否则上面的负向断言毫无鉴别力
    expect(mutatedByResolve).toBe(true)
  })

  // 绝对路径的结果不能受服务端工作目录影响，否则落盘根目录会随启动目录漂移
  it('绝对路径结果与 process.cwd() 无关，相对路径才跟随 cwd', () => {
    const originalCwd = process.cwd()
    const absolute = join(originalCwd, 'srv', 'resume')
    // 切到一定存在的上层目录：dirname(cwd) 无需依赖 tmpdir 之类额外 import，跨平台都可 chdir
    const otherCwd = dirname(originalCwd)
    process.chdir(otherCwd)
    try {
      expect(resolveFileStorageDir(absolute)).toBe(absolute)
      expect(resolveFileStorageDir('data/resume-screen')).toBe(join(otherCwd, 'data', 'resume-screen'))
    } finally {
      process.chdir(originalCwd)
    }
    expect(process.cwd()).toBe(originalCwd)
  })
})
