/**
 * 插件配置定义：zod 校验模式、管理端表单 JSON Schema、环境变量默认值读取
 *
 * 三份配置同源：schema 供插件装载时校验与补默认值，
 * formSchema 供管理端渲染配置表单，envDefaults 作为用户未配置时的兜底值。
 */
import { z } from 'zod/v3'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'

/**
 * 配置校验模式：每批最多 20 份简历用于约束单次解析负载（service 经插件安装上下文读取生效，
 * S7 审核 F2 接线），分数阈值仅作界面提示不参与自动推进。
 * 刻意无 `enabled` 开关：全链路与 spec 均无消费语义（功能启停归平台安装态与 feature
 * activation 通道），声明即死配置（S7 审核 F2 裁决移除）。
 */
export const ResumeScreenPluginConfigSchema = z.object({
  maxResumesPerBatch: z.number().int().min(1).max(20).default(10),
  scoreThreshold: z.number().int().min(0).max(100).default(60)
})

// 管理端配置表单：字段与 schema 一一对应，中英文标题说明各项配置的业务含义
export const ResumeScreenPluginConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {
    maxResumesPerBatch: {
      type: 'number',
      title: {
        en_US: 'Max resumes per batch',
        zh_Hans: '每批最多简历数'
      },
      minimum: 1,
      maximum: 20,
      default: 10
    },
    scoreThreshold: {
      type: 'number',
      title: {
        en_US: 'Score threshold (UI hint only)',
        zh_Hans: '分数提示阈值（仅界面提示，不自动推进）'
      },
      minimum: 0,
      maximum: 100,
      default: 60
    }
  }
}

/**
 * 将环境变量字符串安全地转换为受限区间内的整数
 *
 * @param raw 环境变量原始值（可能为 undefined 或非法文本），来源为部署环境注入
 * @param fallback 解析失败或越界时的兜底默认值
 * @param min 允许的最小值（含）
 * @param max 允许的最大值（含）
 * @returns 合法整数原值返回；非整数/越界一律返回 fallback，避免 NaN 污染配置
 */
function toInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw)
  // 非整数（含 NaN、小数、非数字文本）或越界时回退默认值，保证配置永远可用
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback
  }
  return value
}

/**
 * 读取插件环境变量默认值（部署态兜底配置）
 *
 * 约定：数值项非法或缺省时回退默认，保证插件在零配置下可启动。
 *
 * @returns maxResumesPerBatch/scoreThreshold 两项默认值
 */
export function readResumeScreenPluginEnvDefaults() {
  return {
    maxResumesPerBatch: toInt(process.env['RESUME_SCREEN_MAX_RESUMES_PER_BATCH'], 10, 1, 20),
    scoreThreshold: toInt(process.env['RESUME_SCREEN_SCORE_THRESHOLD'], 60, 0, 100)
  }
}
