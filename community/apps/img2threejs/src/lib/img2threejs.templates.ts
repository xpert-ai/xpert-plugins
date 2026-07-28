import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  IMG2THREEJS_FEATURE,
  IMG2THREEJS_PLUGIN_NAME,
  IMG2THREEJS_PROVIDER_KEY,
  IMG2THREEJS_TEMPLATE_PROVIDER_KEY
} from './constants.js'

const TEMPLATE_FILE = 'xpert-img2threejs-assistant.yaml'
const moduleDir = dirname(fileURLToPath(import.meta.url))
const IMG2THREEJS_AGENT_KEY = 'Agent_Img2ThreeJs'
const IMG2THREEJS_SKILL_KEY = 'img2threejs-semantic-modeling'

function readDsl(): string {
  const candidates = [
    join(moduleDir, '..', TEMPLATE_FILE),
    join(moduleDir, TEMPLATE_FILE),
    join(process.cwd(), 'apps/img2threejs/src', TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/img2threejs/src', TEMPLATE_FILE)
  ]
  const path = candidates.find((candidate) => existsSync(candidate))
  if (!path) throw new Error(`Image to Three.js Assistant DSL not found: ${candidates.join(', ')}`)
  return readFileSync(path, 'utf8')
}

export const img2ThreeJsTemplates: XpertTemplateContribution[] = [{
  key: 'img2threejs-modeling-assistant',
  name: 'Image to Three.js Modeling Assistant',
  title: '图片转 Three.js 建模助手',
  description: '从参考图片创建质量门控、可动画、程序化 Three.js TypeScript 模型。',
  category: 'Design',
  type: XpertTypeEnum.Agent,
  targetApps: ['data-xpert', 'xpert'],
  targetAppMeta: {
    'data-xpert': {
      types: ['business-assistant'],
      capabilities: [IMG2THREEJS_FEATURE, 'img2threejs.review-workbench'],
      requiredPlugins: [IMG2THREEJS_PLUGIN_NAME],
      defaultConfig: {
        assistantKind: 'business-assistant',
        businessDomain: 'procedural-3d-modeling',
        managedBy: 'data-xpert',
        viewProvider: IMG2THREEJS_PROVIDER_KEY
      }
    },
    xpert: {
      types: ['assistant-template'],
      capabilities: [IMG2THREEJS_FEATURE, 'img2threejs.review-workbench'],
      requiredPlugins: [IMG2THREEJS_PLUGIN_NAME]
    }
  },
  dependencies: {
    plugins: [IMG2THREEJS_PLUGIN_NAME],
    skills: [{
      componentKey: IMG2THREEJS_SKILL_KEY,
      targetAgentKey: IMG2THREEJS_AGENT_KEY
    }]
  },
  dslContent: readDsl(),
  order: 45,
  default: false,
  startPrompts: [
    'Create an object modeling project from my reference images and guide it through every quality gate.',
    'Create a character Sculpt Spec with animation pivots, sockets, colliders, and a strict quality contract.',
    'Show the current pass timeline, deterministic evidence, visual review status, and the exact next decision.'
  ],
  releaseNotes: 'Initial quality-gated Image to Three.js Agentic App.',
  xpertName: 'Image to Three.js Modeling Assistant',
  providerKey: IMG2THREEJS_TEMPLATE_PROVIDER_KEY
} as XpertTemplateContribution]
