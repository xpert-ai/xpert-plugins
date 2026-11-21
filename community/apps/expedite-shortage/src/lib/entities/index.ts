/** 汇总导出本插件的全部实体，模块注册和单测都从这里取 */
import { AnalysisJobEntity, ANALYSIS_JOB_TABLE } from './analysis-job.entity.js'
import { ExpediteRequestEntity, REQUEST_TABLE } from './expedite-request.entity.js'
import { RequestLogEntity, LOG_TABLE } from './request-log.entity.js'
import { ShortageFindingEntity, FINDING_TABLE } from './shortage-finding.entity.js'

export { AnalysisJobEntity, ExpediteRequestEntity, RequestLogEntity, ShortageFindingEntity }

export const ENTITIES = [ExpediteRequestEntity, AnalysisJobEntity, ShortageFindingEntity, RequestLogEntity]

export const TABLE_NAMES = [REQUEST_TABLE, ANALYSIS_JOB_TABLE, FINDING_TABLE, LOG_TABLE] as const
