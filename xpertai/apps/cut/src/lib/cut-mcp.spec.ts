import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendCutMediaClip, createStarterCutProject } from './cut-project.js'
import {
  CUT_MCP_SERVER_VERSION,
  CUT_MCP_TOOL_NAMES,
  buildCutIrApplyResult,
  buildCutIrCompareResult,
  compareCutIrDocuments,
  summarizeCutIrDocument
} from './cut-mcp.js'
import { createCutMcpServer } from '../mcp-server.js'

describe('Cut portable MCP surface', () => {
  it('keeps the MCP server version aligned with the plugin package', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
    const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
    expect(CUT_MCP_SERVER_VERSION).toBe(packageJson.version)
  })

  it('summarizes and compares Cut IR documents deterministically', () => {
    const before = createStarterCutProject({ width: 1280, height: 720, durationSeconds: 20 })
    const after = appendCutMediaClip(before, {
      id: 'video-1',
      name: 'Opening',
      type: 'video',
      mediaAssetId: 'asset-1',
      duration: 8
    })

    expect(summarizeCutIrDocument(after)).toMatchObject({
      width: 1280,
      height: 720,
      projectDurationSeconds: 20,
      contentDurationSeconds: 8,
      clipCount: 1,
      videoClipCount: 1
    })
    expect(compareCutIrDocuments(before, after)).toMatchObject({
      changed: true,
      settingsChanged: false,
      changedClipIds: ['video-1']
    })
  })

  it('applies a batch in memory and returns the canonical document plus diff', () => {
    const source = createStarterCutProject({ durationSeconds: 15 })
    const trackId = source.tracks[0]!.id
    const result = buildCutIrApplyResult(source, [
      {
        kind: 'add_clip',
        trackId,
        clip: { id: 'title-1', type: 'text', name: 'Title', text: 'Hello', start: 1, duration: 3 }
      },
      { kind: 'update_text', clipId: 'title-1', text: 'Hello Xpert', fontSize: 96 }
    ])

    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      kind: 'cut.ir.operations-applied',
      operationCount: 2,
      summary: { clipCount: 1, textClipCount: 1 },
      diff: { changedClipIds: ['title-1'] },
      document: {
        tracks: expect.arrayContaining([
          expect.objectContaining({
            clips: expect.arrayContaining([
              expect.objectContaining({ id: 'title-1', text: 'Hello Xpert', fontSize: 96 })
            ])
          })
        ])
      }
    })
  })

  it('rejects a partially invalid batch without returning a candidate document', () => {
    const source = createStarterCutProject({ durationSeconds: 10 })
    const trackId = source.tracks[0]!.id
    expect(() => buildCutIrApplyResult(source, [
      {
        kind: 'add_clip',
        trackId,
        clip: { id: 'title-1', type: 'text', name: 'Title', text: 'Hello', start: 1, duration: 3 }
      },
      { kind: 'move', clipId: 'title-1', start: 9 }
    ])).toThrow('project bounds')
  })

  it('returns an unchanged comparison for equivalent canonical documents', () => {
    const document = createStarterCutProject()
    expect(buildCutIrCompareResult(document, structuredClone(document)).structuredContent).toMatchObject({
      diff: { changed: false, changedClipIds: [], changedTrackIds: [] }
    })
  })

  it('reports order-only track moves and same-time cross-track clip moves', () => {
    const before = createStarterCutProject()
    before.tracks.splice(1, 0, {
      id: 'visual-2', name: 'Overlay', kind: 'visual', muted: false, hidden: false, clips: []
    })
    const withClip = appendCutMediaClip(before, {
      id: 'video-1', name: 'Opening', type: 'video', mediaAssetId: 'asset-1', duration: 5
    })
    const reordered = structuredClone(withClip)
    reordered.tracks = [reordered.tracks[1]!, reordered.tracks[0]!, reordered.tracks[2]!]
    const moved = structuredClone(reordered)
    const clip = moved.tracks[1]!.clips.pop()!
    moved.tracks[0]!.clips.push(clip)

    expect(compareCutIrDocuments(withClip, reordered).changedTrackIds).toEqual(expect.arrayContaining([
      withClip.tracks[0]!.id,
      'visual-2'
    ]))
    expect(compareCutIrDocuments(reordered, moved).changedClipIds).toEqual(['video-1'])
  })

  it('enforces the portable MCP clip-count boundary', () => {
    const document = createStarterCutProject()
    document.tracks[0]!.clips = Array.from({ length: 2_001 }, (_, index) => ({
      id: `text-${index}`,
      type: 'text' as const,
      name: `Text ${index}`,
      start: 0,
      duration: 1,
      trimIn: 0,
      trimOut: 1,
      text: 'Bounded'
    }))
    expect(() => summarizeCutIrDocument(document)).toThrow('at most 2000 clips')
  })

  it('serves exactly the four bounded Cut IR tools over the MCP protocol', async () => {
    const server = await createCutMcpServer()
    const client = new Client({ name: 'cut-mcp-test', version: '0.1.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    try {
      await server.connect(serverTransport)
      await client.connect(clientTransport)
      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name)).toEqual(CUT_MCP_TOOL_NAMES)
      expect(listed.tools[2]!.inputSchema).toMatchObject({
        type: 'object',
        required: expect.arrayContaining(['document', 'operations']),
        properties: {
          document: { type: 'object' },
          operations: { type: 'array', minItems: 1, maxItems: 100 }
        }
      })

      const result = await client.callTool({
        name: CUT_MCP_TOOL_NAMES[0],
        arguments: { width: 640, height: 360, fps: 24, durationSeconds: 12 }
      })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toMatchObject({
        kind: 'cut.ir.project-created',
        summary: { width: 640, height: 360, fps: 24, projectDurationSeconds: 12 }
      })
    } finally {
      await client.close()
      await server.close()
    }
  })
})
