import { buildZhipuCogVideoTools } from './tools.js'
import type { WorkspaceFilesApi } from './types.js'

describe('ZhipuAI CogVideo tool schema', () => {
  it('declares duration and fps as integer parameters', () => {
    const workspaceFiles: WorkspaceFilesApi = {
      uploadBuffer: async () => {
        throw new Error('Workspace upload is not used by this schema test')
      },
      readBuffer: async () => {
        throw new Error('Workspace reads are not used by this schema test')
      }
    }
    const submit = buildZhipuCogVideoTools({ workspaceFiles }).find(
      (item) => item.name === 'zhipu_cogvideo_submit'
    )

    expect(submit?.schema).toMatchObject({
      properties: {
        duration: { type: 'integer', enum: [5, 10] },
        fps: { type: 'integer', enum: [30, 60] }
      }
    })
  })
})
