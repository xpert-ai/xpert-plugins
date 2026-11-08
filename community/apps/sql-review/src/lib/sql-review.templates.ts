import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { SQL_REVIEW_PROVIDER_KEY, SQL_REVIEW_TEMPLATE_PROVIDER_KEY } from './constants'

const SQL_REVIEW_TEMPLATE_KEY = 'sql-review-assistant'
const SQL_REVIEW_TEMPLATE_FILE = 'xpert-sql-review-assistant.yaml'

function getSqlReviewTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', SQL_REVIEW_TEMPLATE_FILE),
    join(runtimeDir, SQL_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'apps/sql-review/src', SQL_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/sql-review/src', SQL_REVIEW_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/sql-review', SQL_REVIEW_TEMPLATE_FILE)
  ]
}

function readSqlReviewDsl() {
  const candidates = getSqlReviewTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`SQL Review xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const sqlReviewTemplates: XpertTemplateContribution[] = [
  {
    key: SQL_REVIEW_TEMPLATE_KEY,
    name: 'SQL Review Assistant',
    title: 'SQL 质量审查助手',
    description: '确定性规则扫描 + AI 结构化审查：提交 SQL，获得带证据引用的审查报告，人工逐条确认后归档。',
    icon: { type: 'font', value: 'ri-file-list-3-line', color: '#0f766e' },
    type: XpertTypeEnum.Agent,
    tags: ['sql-review', 'database', 'code-quality'],
    provider: SQL_REVIEW_PROVIDER_KEY,
    providerKey: SQL_REVIEW_TEMPLATE_PROVIDER_KEY,
    version: '0.1.0',
    dslContent: readSqlReviewDsl()
  }
]
