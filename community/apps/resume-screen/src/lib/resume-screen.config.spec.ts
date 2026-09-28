/**
 * 插件配置模式与环境变量默认值单元测试
 *
 * 覆盖三类场景：schema 默认值解析、越界批量数拒绝、
 * 环境变量缺省/非法时回退默认值、合法环境变量正确读取。
 * S7 审核 F2 裁决：`enabled` 无消费语义已从配置面整体移除，用例不再断言该项。
 */
import { readResumeScreenPluginEnvDefaults, ResumeScreenPluginConfigSchema } from './resume-screen.config'

describe('ResumeScreenPluginConfigSchema', () => {
  it('parses defaults', () => {
    const config = ResumeScreenPluginConfigSchema.parse({})
    expect(config).toEqual({ maxResumesPerBatch: 10, scoreThreshold: 60 })
  })

  it('rejects out-of-range batch size', () => {
    expect(() => ResumeScreenPluginConfigSchema.parse({ maxResumesPerBatch: 21 })).toThrow()
    expect(() => ResumeScreenPluginConfigSchema.parse({ maxResumesPerBatch: 0 })).toThrow()
  })

  // 已声明无 enabled 配置：历史安装残留的 enabled 字段应被 zod 静默剥离而不是报错
  it('strips the retired enabled key instead of failing validation', () => {
    expect(ResumeScreenPluginConfigSchema.parse({ enabled: false })).toEqual({
      maxResumesPerBatch: 10,
      scoreThreshold: 60
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
    expect(readResumeScreenPluginEnvDefaults()).toEqual({
      maxResumesPerBatch: 10,
      scoreThreshold: 60
    })

    // 非数字的批量数必须被拒绝并回退默认值，而不是让 NaN 进入配置
    process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH'] = 'not-a-number'
    expect(readResumeScreenPluginEnvDefaults().maxResumesPerBatch).toBe(10)
  })

  it('reads valid env values', () => {
    process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH'] = '5'
    process.env['RESUME_SCREEN_SCORE_THRESHOLD'] = '75'
    expect(readResumeScreenPluginEnvDefaults()).toEqual({
      maxResumesPerBatch: 5,
      scoreThreshold: 75
    })
  })
})
