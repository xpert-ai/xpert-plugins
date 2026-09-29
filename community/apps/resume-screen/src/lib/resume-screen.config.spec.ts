/**
 * 插件配置模式、环境变量默认值与存储目录解析单元测试
 *
 * 覆盖四类场景：schema 默认值解析、越界批量数与空白存储目录拒绝、
 * 环境变量缺省/非法时回退默认值、合法环境变量正确读取，
 * 以及 resolveFileStorageDir 把配置目录解析为绝对路径（v5 简历字节落盘根目录）。
 * S7 审核 F2 裁决：`enabled` 无消费语义已从配置面整体移除，用例不再断言该项。
 */
import { join } from 'node:path'
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
})
