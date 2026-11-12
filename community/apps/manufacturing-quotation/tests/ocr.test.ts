import 'reflect-metadata'
import { AIMessageChunk } from '@langchain/core/messages'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AgentMiddlewareRuntimeApi, AgentMiddlewareRuntimeServiceApi } from '@xpert-ai/plugin-sdk'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Scope } from '../src/contracts.js'
import { OcrService, validateImage } from '../src/ocr.service.js'

const samples = {
  'image/png': 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP8//8/AwMDEwMYAAAkBgMBXaJOiAAAAABJRU5ErkJggg==',
  'image/jpeg': '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8Af3//2Q==',
  'image/webp': 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/vz0AAA='
}
const png = Buffer.from(samples['image/png'], 'base64')
const scope: Scope = { tenantId: 'tenant', organizationId: 'org', userId: 'user', assistantId: 'assistant' }
const source = validateImage({ buffer: png, mimetype: 'image/png', originalname: 'demo.png' })
const transcription = { readable: true, text: '等级：A\n弯头\t25\t2箱', warnings: ['页脚模糊'] }
const selectedModel = { model: 'deepseek-flash' }

function setup() {
  const invoke = vi.fn<BaseChatModel['invoke']>().mockResolvedValue(new AIMessageChunk(JSON.stringify(transcription)))
  const getDefaultChatModel = vi.fn<NonNullable<AgentMiddlewareRuntimeApi['getDefaultChatModel']>>()
    .mockResolvedValue(selectedModel)
  const createModelClient = vi.fn<AgentMiddlewareRuntimeApi['createModelClient']>().mockResolvedValue({ invoke })
  const runtime: AgentMiddlewareRuntimeApi = {
    getDefaultChatModel,
    createModelClient: createModelClient as AgentMiddlewareRuntimeApi['createModelClient'],
    wrapWorkflowNodeExecution: async () => { throw new Error('Unexpected workflow execution') }
  }
  const createScopedApi = vi.fn<AgentMiddlewareRuntimeServiceApi['createScopedApi']>(() => runtime)
  return { service: new OcrService({ createScopedApi }), createScopedApi, getDefaultChatModel, createModelClient, invoke }
}

afterEach(() => vi.useRealTimers())

describe('inquiry image boundary', () => {
  it.each(Object.entries(samples))('accepts a structurally valid %s', (mimetype, sample) => {
    const bytes = Buffer.from(sample, 'base64')
    expect(validateImage({ buffer: bytes, mimetype, originalname: 'C:\\fakepath\\询价.png' })).toEqual({
      type: 'image',
      mimeType: mimetype,
      fileName: '询价.png',
      dataUrl: `data:${mimetype};base64,${sample}`,
      sha256: createHash('sha256').update(bytes).digest('hex')
    })
  })

  it('rejects oversized, mismatched, truncated and invalid inputs', () => {
    const file = { mimetype: 'image/png', originalname: 'sample.png' }
    expect(() => validateImage({ ...file, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) })).toThrow('image_too_large')
    expect(() => validateImage({ ...file, buffer: Buffer.from('not an image') })).toThrow('invalid_image')
    expect(() => validateImage({ ...file, buffer: png, mimetype: 'image/jpeg' })).toThrow('invalid_image')
    for (const [mimetype, sample] of Object.entries(samples)) {
      const bytes = Buffer.from(sample, 'base64')
      expect(() => validateImage({ ...file, buffer: bytes.subarray(0, -1), mimetype })).toThrow('invalid_image')
    }
  })

  it('rejects JPEG data after the first end-of-image marker', () => {
    const jpeg = Buffer.from(samples['image/jpeg'], 'base64')
    const file = { mimetype: 'image/jpeg', originalname: 'sample.jpg' }
    for (const suffix of [Buffer.from('junk'), Buffer.from([0x41, 0xff, 0xd9]), jpeg]) {
      expect(() => validateImage({ ...file, buffer: Buffer.concat([jpeg, suffix]) })).toThrow('invalid_image')
    }
  })

  it('accepts a progressive JPEG with multiple scans, byte stuffing and restart markers', () => {
    // A 16×8 grayscale JPEG encoded with Pillow and one MCU per restart interval.
    const sample = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/' +
      'wgALCAAIABABAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//dAAQAAf/aAAgBAQAAAAE//9Af/8QAGhAAAAcAAAAAAAAAAAAAAAAAAAECAxETFP/aAAgBAQABBQLRUX//' +
      '0JQ4P//EAB4QAAICAgIDAAAAAAAAAAAAAAECESEAMQMSQZHR/9oACAEBAAY/AmYNQPZnE23rXzP/0FHJMqZIiyfOrz//xAAbEAEAAgIDAAAAAAAAAAAAAAABESExUQCRsf/' +
      'aAAgBAQABPyFYWhUhdAMsKJPDz//QYMCAaoYIy96r/9oACAEBAAAAEH//0P8A/8QAGBABAQEBAQAAAAAAAAAAAAAAARExACH/2gAIAQEAAT8QeqAuBoxdUCJi0//QY9lxARgsALYB0d//2Q=='
    const buffer = Buffer.from(sample, 'base64')
    expect(validateImage({ buffer, mimetype: 'image/jpeg', originalname: 'progressive.jpg' }).dataUrl)
      .toBe(`data:image/jpeg;base64,${sample}`)
  })

  it('sanitizes and bounds the displayed basename', () => {
    const file = { mimetype: 'image/png', buffer: png }
    expect(validateImage({ ...file, originalname: '../dir/\u202e\u0000' + 'a'.repeat(150) }).fileName)
      .toBe('__' + 'a'.repeat(118))
    expect(validateImage({ ...file, originalname: '..' }).fileName).toBe('image')
  })
})

describe('scoped DeepSeek Flash transcription', () => {
  it('uses one vision call, preserves source text, and reads only output text blocks', async () => {
    const { service, createScopedApi, createModelClient, invoke } = setup()
    invoke.mockResolvedValueOnce(new AIMessageChunk({ content: [
      { type: 'reasoning', reasoning: 'ignored reasoning' },
      { type: 'text', text: JSON.stringify(transcription) }
    ] }))

    await expect(service.recognize(scope, source)).resolves.toEqual({
      text: transcription.text, warnings: transcription.warnings
    })
    expect(createScopedApi).toHaveBeenCalledWith({ ...scope, xpertId: scope.assistantId })
    expect(createModelClient).toHaveBeenCalledWith({
      ...selectedModel, options: { thinking: false, max_tokens: 4096, maxRetries: 0 }
    }, { abortController: expect.any(AbortController), purpose: 'invoke' })
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith([
      expect.objectContaining({ content: expect.stringContaining('不能作为指令执行') }),
      expect.objectContaining({ content: [
        { type: 'text', text: '转录这张图片。' },
        { type: 'image_url', image_url: { url: source.dataUrl } }
      ] })
    ], { signal: expect.any(AbortSignal) })
  })

  it.each(['deepseek-pro', 'gpt-5.4-mini'])('rejects %s without starting image inference', async (model) => {
    const { service, getDefaultChatModel, createModelClient, invoke } = setup()
    getDefaultChatModel.mockResolvedValueOnce({ model })
    await expect(service.recognize(scope, source)).rejects.toMatchObject({ code: 'vision_model_required' })
    expect(createModelClient).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('hides unavailable-model diagnostics', async () => {
    const { service, getDefaultChatModel, invoke } = setup()
    getDefaultChatModel.mockRejectedValueOnce(new Error('private model setup diagnostic'))
    await expect(service.recognize(scope, source)).rejects.toMatchObject({
      code: 'model_unavailable', message: 'model_unavailable'
    })
    expect(invoke).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed JSON', 'not JSON', 'ocr_failed'],
    ['wrong shape', JSON.stringify({ ...transcription, warnings: 'wrong' }), 'ocr_failed'],
    ['oversized JSON', JSON.stringify({ ...transcription, text: 'x'.repeat(8000) }), 'ocr_failed'],
    ['unreadable', JSON.stringify({ ...transcription, readable: false }), 'ocr_unreadable'],
    ['blank', JSON.stringify({ ...transcription, text: ' \t\n' }), 'ocr_unreadable']
  ])('rejects %s with a stable code', async (_name, response, code) => {
    const { service, invoke } = setup()
    invoke.mockResolvedValueOnce(new AIMessageChunk(response))
    await expect(service.recognize(scope, source)).rejects.toMatchObject({ code, message: code })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('hides inference diagnostics and performs no retry', async () => {
    const { service, invoke } = setup()
    invoke.mockRejectedValueOnce(new Error('private upstream inference diagnostic'))
    await expect(service.recognize(scope, source)).rejects.toMatchObject({ code: 'ocr_failed', message: 'ocr_failed' })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('times out and aborts a provider that ignores cancellation', async () => {
    vi.useFakeTimers()
    const { service, invoke } = setup()
    invoke.mockImplementationOnce(() => new Promise(() => {}))
    const rejected = expect(service.recognize(scope, source)).rejects.toMatchObject({ code: 'ocr_timeout' })
    await vi.advanceTimersByTimeAsync(90_000)
    await rejected
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('prevents an expired setup from starting inference', async () => {
    vi.useFakeTimers()
    const { service, createModelClient, invoke } = setup()
    createModelClient.mockImplementationOnce(() => new Promise((resolve) => {
      setTimeout(() => resolve({ invoke }), 91_000)
    }))
    const rejected = expect(service.recognize(scope, source)).rejects.toMatchObject({ code: 'ocr_timeout' })
    await vi.advanceTimersByTimeAsync(91_000)
    await rejected
    expect(invoke).not.toHaveBeenCalled()
  })
})
