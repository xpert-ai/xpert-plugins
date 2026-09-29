import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  TEST_CASE_GENERATOR_FEATURE,
  TEST_CASE_GENERATOR_PLUGIN_NAME,
  TEST_CASE_GENERATOR_PROVIDER_KEY,
  TEST_CASE_GENERATOR_TEMPLATE_PROVIDER_KEY
} from './constants'

const TEST_CASE_GENERATOR_TEMPLATE_KEY = 'test-case-generator-assistant'
const TEST_CASE_GENERATOR_TEMPLATE_FILE = 'xpert-test-case-generator-assistant.yaml'

function getTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', TEST_CASE_GENERATOR_TEMPLATE_FILE),
    join(runtimeDir, TEST_CASE_GENERATOR_TEMPLATE_FILE),
    join(process.cwd(), 'apps/test-case-generator/src', TEST_CASE_GENERATOR_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/test-case-generator/src', TEST_CASE_GENERATOR_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/test-case-generator', TEST_CASE_GENERATOR_TEMPLATE_FILE)
  ]
}

function readDsl() {
  const candidates = getTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Test Case Generator xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const testCaseGeneratorTemplates: XpertTemplateContribution[] = [
  {
    key: TEST_CASE_GENERATOR_TEMPLATE_KEY,
    name: 'Test Case Generator Assistant',
    title: '测试用例助手',
    description: '面向需求描述输入、AI 测试用例生成、用例编辑和历史项目管理的 data-xpert 业务助手模板。',
    category: 'Test Case Generator',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [TEST_CASE_GENERATOR_FEATURE],
        requiredPlugins: [TEST_CASE_GENERATOR_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'test-case-generator',
          managedBy: 'data-xpert',
          viewProvider: TEST_CASE_GENERATOR_PROVIDER_KEY
        }
      }
    },
    dslContent: readDsl(),
    order: 50,
    default: false,
    startPrompts: [
      '帮我生成登录功能的测试用例。',
      '根据以下需求描述生成测试用例：用户注册需要验证手机号、邮箱和密码强度。',
      '帮我查看已保存的测试用例项目列表。'
    ],
    releaseNotes: '创建测试用例智能生成业务助手。',
    xpertName: '测试用例助手',
    providerKey: TEST_CASE_GENERATOR_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
