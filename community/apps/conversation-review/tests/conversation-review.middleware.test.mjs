/**
 * Behaviour tests for the chat-attachment path of `conversation_review_import_conversations`.
 *
 * This is genuinely new, unvalidated platform integration — see README §六「已知限制」 and
 * TODO.md's item C. There is no live Xpert host here to drag a real file into, so these tests
 * exercise `wrapToolCall` directly with a fake `WorkspaceFilesApi`, covering exactly the contract
 * `resolveChatAttachmentImport` depends on: `runtime.context.humanInput.files` for the attachment
 * reference, `context.runtime.capabilities.get(WorkspaceFilesRuntimeCapability)` for the byte
 * reader. They do NOT prove the real platform actually populates these the way the source reading
 * (done as part of TODO item C) said it does — only that this plugin behaves correctly, including
 * degrading gracefully, given that contract.
 *
 *   node --test tests/conversation-review.middleware.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'

const require = createRequire(import.meta.url)
const { ConversationReviewMiddleware } = require('../dist/lib/conversation-review.middleware.js')
const {
  CONVERSATION_REVIEW_IMPORT_CONVERSATIONS_TOOL_NAME,
  CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGES,
  CONVERSATION_REVIEW_SCREENSHOT_PENDING_METADATA_KEY
} = require('../dist/lib/constants.js')
const { ToolMessage } = require('@langchain/core/messages')
const XLSX = require('xlsx')

/** A minimal-but-real PNG signature — the middleware only sniffs the first 8 magic bytes. */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

function workbookBuffer(rows) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

function fakeContext(workspaceFiles) {
  return {
    tenantId: 't1',
    organizationId: 'o1',
    userId: 'seller-a',
    xpertId: 'x1',
    conversationId: 'c1',
    runtime: {
      capabilities: { get: () => workspaceFiles }
    }
  }
}

function fakeService() {
  const calls = []
  return {
    calls,
    importConversations: async (scope, rows, source, skipped) => {
      calls.push({ scope, rows, source, skipped })
      return {
        imported: rows.length,
        duplicates: 0,
        skipped: skipped ?? [],
        recordIds: rows.map((_row, index) => `r${calls.length}-${index}`)
      }
    }
  }
}

async function createWrapToolCall(service, workspaceFiles) {
  const instance = new ConversationReviewMiddleware(service)
  const middleware = await instance.createMiddleware({}, fakeContext(workspaceFiles))
  return middleware.wrapToolCall
}

async function createMiddlewareTriad(service, workspaceFiles) {
  const instance = new ConversationReviewMiddleware(service)
  return instance.createMiddleware({}, fakeContext(workspaceFiles))
}

const REJECTING_HANDLER = async () => {
  throw new Error('handler must not run once an attachment result short-circuits the call')
}

function importCall(args, humanInputFiles) {
  return {
    toolCall: { name: CONVERSATION_REVIEW_IMPORT_CONVERSATIONS_TOOL_NAME, args, id: 'call-1' },
    runtime: { context: humanInputFiles ? { humanInput: { files: humanInputFiles } } : {} }
  }
}

describe('chat-attached file import (wrapToolCall)', () => {
  it('falls through to the tool handler when there is no chat attachment', async () => {
    const wrapToolCall = await createWrapToolCall(fakeService(), undefined)
    let handlerCalled = false
    const result = await wrapToolCall(importCall({}), async () => {
      handlerCalled = true
      return 'handler-result'
    })
    assert.equal(handlerCalled, true, 'with nothing to resolve, the tool handler runs and reports its own missing-content error')
    assert.equal(result, 'handler-result')
  })

  it('does not intercept the call when the model already supplied content itself', async () => {
    const service = fakeService()
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async () => {
        throw new Error('must not be called when content was supplied explicitly')
      }
    })
    let handlerCalled = false
    const result = await wrapToolCall(importCall({ content: '[]', format: 'json' }, [{ name: 'ignored.json' }]), async () => {
      handlerCalled = true
      return 'handler-result'
    })
    assert.equal(handlerCalled, true, 'explicit content always wins over any attachment')
    assert.equal(result, 'handler-result')
  })

  it('reports a graceful error when an attachment exists but the capability is unavailable', async () => {
    const wrapToolCall = await createWrapToolCall(fakeService(), undefined)
    const result = await wrapToolCall(
      importCall({}, [{ name: 'conversations.json', workspacePath: '/workspace/a.json' }]),
      REJECTING_HANDLER
    )
    const payload = JSON.parse(result.content)
    assert.equal(payload.success, false)
    assert.equal(result.status, 'error')
    assert.match(payload.message, /not available in this environment/)
  })

  it('imports a single json chat attachment by reading its bytes through the capability', async () => {
    const service = fakeService()
    const jsonContent = JSON.stringify([{ customerName: '华东制造', conversation: '客户问交付。', externalId: 'wecom-100' }])
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async (locator) => ({ name: locator.name, buffer: Buffer.from(jsonContent, 'utf8') })
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'conversations.json' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, true)
    assert.equal(result.status, 'success')
    assert.equal(payload.data.imported, 1)
    assert.equal(service.calls.length, 1)
    assert.equal(service.calls[0].source, 'import:json')
    assert.equal(service.calls[0].rows[0].customerName, '华东制造')
  })

  it('imports several attachments of different formats in one call and merges the results', async () => {
    const service = fakeService()
    const jsonContent = JSON.stringify([{ customerName: 'A', conversation: 'x', externalId: 'ext-1' }])
    const excelBuffer = workbookBuffer([
      ['customerName', 'conversation', 'externalId'],
      ['B', 'y', 'ext-2']
    ])
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async (locator) => {
        if (locator.name === 'a.json') return { name: 'a.json', buffer: Buffer.from(jsonContent, 'utf8') }
        if (locator.name === 'b.xlsx') return { name: 'b.xlsx', buffer: excelBuffer }
        throw new Error(`unexpected locator ${locator.name}`)
      }
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'a.json' }, { name: 'b.xlsx' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, true)
    assert.equal(payload.data.imported, 2, 'multiple attachments, even of different formats, are imported in one call')
    assert.equal(service.calls.length, 2)
    assert.deepEqual(service.calls.map((call) => call.source).sort(), ['import:excel', 'import:json'])
  })

  it('imports the readable attachments and reports which ones failed, instead of failing the whole call', async () => {
    const service = fakeService()
    const jsonContent = JSON.stringify([{ customerName: 'A', conversation: 'x' }])
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async (locator) => {
        if (locator.name === 'good.json') return { name: 'good.json', buffer: Buffer.from(jsonContent, 'utf8') }
        throw new Error('storage unavailable')
      }
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'good.json' }, { name: 'broken.json' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, true, 'the readable attachment still imports even though the other one failed')
    assert.equal(payload.data.imported, 1)
    assert.match(payload.message, /broken\.json: storage unavailable/)
  })

  it('reports failure without importing anything when every attachment fails to read', async () => {
    const service = fakeService()
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async () => {
        throw new Error('storage unavailable')
      }
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'broken.json' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, false)
    assert.equal(service.calls.length, 0, 'nothing is imported when nothing could be read')
    assert.match(payload.message, /storage unavailable/)
  })

  it('skips an attachment whose extension it cannot recognise instead of failing the whole call', async () => {
    const service = fakeService()
    const jsonContent = JSON.stringify([{ customerName: 'A', conversation: 'x' }])
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async (locator) => {
        if (locator.name === 'good.json') return { name: 'good.json', buffer: Buffer.from(jsonContent, 'utf8') }
        return { name: 'notes.pdf', buffer: Buffer.from('%PDF-1.4') }
      }
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'good.json' }, { name: 'notes.pdf' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, true)
    assert.equal(payload.data.imported, 1)
    assert.match(payload.message, /notes\.pdf: unrecognized file type/)
  })
})

// ------------------------------------------------- WeChat screenshot import (TODO.md item D)
//
// Same "no live Xpert host" caveat as the block above: these prove the plugin's own contract
// (queue-then-inject, gated by a ToolMessage metadata marker) given a faked `WorkspaceFilesApi`,
// not that the real platform's `humanInput.files` and vision-capable model behave this way.

function pendingScreenshotAck() {
  return new ToolMessage({
    content: '{}',
    tool_call_id: 'call-1',
    name: CONVERSATION_REVIEW_IMPORT_CONVERSATIONS_TOOL_NAME,
    status: 'success',
    metadata: { [CONVERSATION_REVIEW_SCREENSHOT_PENDING_METADATA_KEY]: true }
  })
}

describe('WeChat screenshot import — queueing (wrapToolCall)', () => {
  it('acks a screenshot attachment without importing, and tags the ToolMessage for wrapModelCall', async () => {
    const service = fakeService()
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async () => ({ name: 'chat.png', buffer: PNG_BYTES })
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'chat.png' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, true)
    assert.equal(payload.pendingScreenshot, true)
    assert.equal(result.status, 'success')
    assert.equal(result.metadata?.[CONVERSATION_REVIEW_SCREENSHOT_PENDING_METADATA_KEY], true)
    assert.equal(service.calls.length, 0, 'nothing is imported yet — the model still has to look at the image')
    assert.match(payload.message, /重建/)
  })

  it('rejects more than the per-call image cap with a clear count, before reading any bytes', async () => {
    const service = fakeService()
    let readCount = 0
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async () => {
        readCount += 1
        return { name: 'chat.png', buffer: PNG_BYTES }
      }
    })
    const files = Array.from({ length: CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGES + 1 }, (_, i) => ({ name: `chat${i}.png` }))

    const result = await wrapToolCall(importCall({}, files), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, false)
    assert.equal(payload.pendingScreenshot, undefined)
    assert.match(payload.message, new RegExp(`最多支持 ${CONVERSATION_REVIEW_SCREENSHOT_MAX_IMAGES}`))
    assert.equal(readCount, 0)
  })

  it('rejects an oversized screenshot without importing or crashing', async () => {
    const service = fakeService()
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(11 * 1024 * 1024)])
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async () => ({ name: 'huge.png', buffer: oversized })
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'huge.png' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, false)
    assert.match(payload.message, /大小上限/)
  })

  it('rejects a file with a screenshot extension but the wrong magic bytes', async () => {
    const service = fakeService()
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async () => ({ name: 'fake.png', buffer: Buffer.from('not actually a png') })
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'fake.png' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, false)
    assert.match(payload.message, /不是受支持的图片格式/)
  })

  it('only handles the screenshot when a screenshot and a non-image file are attached together', async () => {
    const service = fakeService()
    const wrapToolCall = await createWrapToolCall(service, {
      readRuntimeBuffer: async (locator) => {
        if (locator.name === 'chat.png') return { name: 'chat.png', buffer: PNG_BYTES }
        return { name: 'conversations.json', buffer: Buffer.from('[]', 'utf8') }
      }
    })

    const result = await wrapToolCall(importCall({}, [{ name: 'chat.png' }, { name: 'conversations.json' }]), REJECTING_HANDLER)
    const payload = JSON.parse(result.content)

    assert.equal(payload.success, true)
    assert.equal(payload.pendingScreenshot, true)
    assert.equal(service.calls.length, 0, 'the json attachment is not imported in the same call as a screenshot')
    assert.match(payload.message, /1 个非图片附件未处理/)
  })
})

describe('WeChat screenshot import — injection (wrapModelCall)', () => {
  it('injects the image and the reconstruction instructions when the previous ToolMessage is a pending screenshot ack', async () => {
    const middleware = await createMiddlewareTriad(fakeService(), {
      readRuntimeBuffer: async () => ({ name: 'chat.png', buffer: PNG_BYTES })
    })

    const request = {
      messages: [pendingScreenshotAck()],
      systemMessage: null,
      runtime: { context: { humanInput: { files: [{ name: 'chat.png' }] } } }
    }
    let handledRequest
    await middleware.wrapModelCall(request, async (req) => {
      handledRequest = req
      return 'handler-result'
    })

    assert.equal(handledRequest.messages.length, 2, 'the image is appended as one extra message, not persisted in place')
    const injected = handledRequest.messages[1]
    const imageBlock = injected.content.find((block) => block.type === 'image_url')
    assert.ok(imageBlock, 'a HumanMessage with an image_url content block was appended')
    assert.match(imageBlock.image_url.url, /^data:image\/png;base64,/)
    assert.match(handledRequest.systemMessage.content, /单聊/)
  })

  it('does not touch messages or systemMessage when there is no pending screenshot marker', async () => {
    const middleware = await createMiddlewareTriad(fakeService(), undefined)
    const request = { messages: [], systemMessage: null, runtime: { context: {} } }

    let handlerCalledWith
    const result = await middleware.wrapModelCall(request, async (req) => {
      handlerCalledWith = req
      return 'handler-result'
    })

    assert.equal(result, 'handler-result')
    assert.equal(handlerCalledWith, request, 'falls straight through to the handler, exactly as before this feature existed')
  })

  it('falls through when the marker is present but the capability is unavailable', async () => {
    const middleware = await createMiddlewareTriad(fakeService(), undefined)
    const request = {
      messages: [pendingScreenshotAck()],
      systemMessage: null,
      runtime: { context: { humanInput: { files: [{ name: 'chat.png' }] } } }
    }

    let handlerCalledWith
    await middleware.wrapModelCall(request, async (req) => {
      handlerCalledWith = req
      return 'handler-result'
    })

    assert.equal(handlerCalledWith, request, 'no capability to re-read the image, so the model call proceeds without it')
  })
})
