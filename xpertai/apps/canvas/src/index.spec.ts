jest.mock('./lib/canvas.plugin.js', () => ({
  CanvasPlugin: class CanvasPlugin {}
}))
jest.mock('./lib/types.js', () => ({}))
jest.mock('./lib/entities/index.js', () => ({}))
jest.mock('./lib/canvas.service.js', () => ({}))
jest.mock('./lib/canvas.middleware.js', () => ({}))
jest.mock('./lib/canvas-view.provider.js', () => ({}))
jest.mock('./lib/canvas-snapshot.validation.js', () => ({}))

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import plugin from './index.js'
import { CANVAS_MIDDLEWARE_NAME, CANVAS_WORKBENCH_VIEW_KEY } from './lib/constants.js'

describe('canvas plugin marketplace metadata', () => {
  it('folds Workbench view and Agent middleware under the Canvas app', () => {
    const contents = Object.values(plugin.meta.targetAppMeta ?? {}).flatMap(
      (metadata) => metadata.marketplace?.contents ?? []
    )
    const canvasApp = contents.find((content) => content.type === 'app' && content.name === 'canvas')
    const assistantTemplate = contents.find(
      (content) => content.type === 'assistant-template' && content.name === 'canvas-assistant'
    )
    const workbench = contents.find((content) => content.type === 'view' && content.name === CANVAS_WORKBENCH_VIEW_KEY)
    const middleware = contents.find(
      (content) => content.type === 'middleware' && content.name === CANVAS_MIDDLEWARE_NAME
    )

    expect(canvasApp?.operations?.map((operation) => operation.name)).toEqual([
      'create-canvas-documents',
      'save-canvas-versions',
      'review-canvas-workbench'
    ])
    expectI18nText(canvasApp?.description, 'Canvas Assistant', '创建')
    expectI18nText(assistantTemplate?.description, 'Prebuilt assistant template', '预置助手模板')
    expect(assistantTemplate?.metadata).toEqual({ app: 'canvas' })
    expect(workbench?.metadata).toEqual({ app: 'canvas' })
    expect(middleware?.metadata).toEqual({ app: 'canvas' })
    expect(contents.some((content) => content.type === 'tool' && content.name === CANVAS_MIDDLEWARE_NAME)).toBe(false)
  })

  it('does not declare a Canvas app bundle component', () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), '.xpertai-plugin/plugin.json'), 'utf8')) as Record<
      string,
      unknown
    >
    const contents = readManifestContents(manifest)
    const canvasApp = contents.find((content) => content.type === 'app' && content.name === 'canvas')
    const assistantTemplate = contents.find(
      (content) => content.type === 'assistant-template' && content.name === 'canvas-assistant'
    )
    const workbench = contents.find((content) => content.type === 'view' && content.name === CANVAS_WORKBENCH_VIEW_KEY)
    const middleware = contents.find(
      (content) => content.type === 'middleware' && content.name === CANVAS_MIDDLEWARE_NAME
    )

    expect(manifest.apps).toBeUndefined()
    expectI18nText(canvasApp?.description, 'Canvas Assistant', '管理 tldraw 画布')
    expectI18nText(assistantTemplate?.description, 'Assistant template', '助手模板')
    expect(assistantTemplate?.metadata).toEqual({ app: 'canvas' })
    expect(workbench?.metadata).toEqual({ app: 'canvas' })
    expect(middleware?.metadata).toEqual({ app: 'canvas' })
  })
})

function readManifestContents(manifest: Record<string, unknown>) {
  const targetAppMeta = isRecord(manifest.targetAppMeta) ? manifest.targetAppMeta : {}
  return Object.values(targetAppMeta).flatMap((metadata) => {
    if (!isRecord(metadata) || !isRecord(metadata.marketplace) || !Array.isArray(metadata.marketplace.contents)) {
      return []
    }
    return metadata.marketplace.contents.filter(isRecord)
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectI18nText(value: unknown, enText: string, zhText: string) {
  expect(isRecord(value)).toBe(true)
  if (!isRecord(value)) {
    return
  }
  expect(value.en_US).toEqual(expect.stringContaining(enText))
  expect(value.zh_Hans).toEqual(expect.stringContaining(zhText))
}
