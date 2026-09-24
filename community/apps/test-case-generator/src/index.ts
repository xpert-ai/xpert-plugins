import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import {
  TestCaseGeneratorPluginConfigFormSchema,
  TestCaseGeneratorPluginConfigSchema,
  readTestCaseGeneratorPluginEnvDefaults
} from './lib/test-case-generator.config'
import { TestCaseGeneratorPlugin } from './lib/test-case-generator.plugin'
import {
  TEST_CASE_GENERATOR_FEATURE,
  TEST_CASE_GENERATOR_ICON,
  TEST_CASE_GENERATOR_MIDDLEWARE_NAME,
  TEST_CASE_GENERATOR_PROVIDER_KEY,
  TEST_CASE_GENERATOR_TEMPLATE_PROVIDER_KEY,
  TEST_CASE_GENERATOR_WORKBENCH_VIEW_KEY
} from './lib/constants'
import { testCaseGeneratorTemplates } from './lib/test-case-generator.templates'

const moduleDir = __dirname

const packageJson = JSON.parse(readFileSync(join(moduleDir, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = TestCaseGeneratorPluginConfigSchema

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    level: 'organization',
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['workbench-view', 'assistant-tool', 'business-app'],
        capabilities: [
          TEST_CASE_GENERATOR_FEATURE,
          'test-case-generator-workbench',
          'test-case-generator-assistant-template'
        ],
        marketplace: {
          contents: [
            {
              type: 'app',
              name: 'test-case-generator',
              displayName: 'Test Case Generator',
              description:
                'Generate AI-assisted structured test cases from requirement descriptions, edit them in a workbench, and save to a persistent test case library.',
              icon: {
                type: 'svg',
                value: TEST_CASE_GENERATOR_ICON,
                color: '#1D4ED8'
              },
              operations: [
                {
                  name: 'generate-test-cases',
                  displayName: 'Generate test cases',
                  description: 'Generate structured test cases covering normal, abnormal and boundary scenarios.',
                  access: 'write'
                },
                {
                  name: 'save-test-case-project',
                  displayName: 'Save test case project',
                  description: 'Save a generated test case project and its cases to the library.',
                  access: 'write'
                },
                {
                  name: 'list-test-case-projects',
                  displayName: 'List test case projects',
                  description: 'Browse saved test case projects and their case counts.',
                  access: 'read'
                }
              ]
            },
            {
              type: 'view',
              name: TEST_CASE_GENERATOR_WORKBENCH_VIEW_KEY,
              displayName: 'Test Case Generator Workbench',
              description: 'Workbench view for requirement input, AI case generation, editing, saving and history browsing.'
            },
            {
              type: 'tool',
              name: TEST_CASE_GENERATOR_MIDDLEWARE_NAME,
              displayName: 'Test Case Generator Tools',
              description:
                'Assistant middleware tools for generating structured test cases, saving projects, listing and deleting projects.'
            },
            {
              type: 'assistant-template',
              name: 'test-case-generator-assistant',
              displayName: 'Test Case Generator Assistant Template',
              description:
                'Prebuilt assistant workflow template for requirement input, AI test case generation, case editing and history management.'
            }
          ]
        },
        runtime: {
          middlewareProviders: [TEST_CASE_GENERATOR_MIDDLEWARE_NAME],
          viewProviders: [TEST_CASE_GENERATOR_PROVIDER_KEY],
          templateProviders: [TEST_CASE_GENERATOR_TEMPLATE_PROVIDER_KEY]
        }
      }
    },
    category: 'middleware',
    icon: {
      type: 'svg',
      value: TEST_CASE_GENERATOR_ICON,
      color: '#1D4ED8'
    },
    displayName: 'Test Case Generator',
    description: 'Generate AI-assisted structured test cases from natural-language requirement descriptions.',
    keywords: ['test-case', 'generator', 'view-extension', 'remote-component', 'agent-tool', 'assistant-template'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema,
    formSchema: TestCaseGeneratorPluginConfigFormSchema,
    defaults: readTestCaseGeneratorPluginEnvDefaults()
  },
  templates: testCaseGeneratorTemplates,
  register(ctx) {
    ctx.logger.log('register test-case-generator plugin')
    return { module: TestCaseGeneratorPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('test-case-generator plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('test-case-generator plugin stopped')
  }
}

export default plugin
