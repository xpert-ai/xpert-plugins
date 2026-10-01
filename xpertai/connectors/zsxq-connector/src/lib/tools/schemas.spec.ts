import { createTopicSchema, listTopicsSchema, setTopicStateSchema, workspaceFileSchema } from './schemas.js'

describe('Knowledge Planet tool schemas', () => {
  it('applies bounded defaults and exact numeric IDs', () => {
    expect(listTopicsSchema.parse({ groupId: '12' })).toMatchObject({ groupId: '12', limit: 20 })
    expect(() => listTopicsSchema.parse({ groupId: 'group-12' })).toThrow()
    expect(() => listTopicsSchema.parse({ groupId: '12', limit: 31 })).toThrow()
  })

  it('requires matching confirmation fields for writes', () => {
    expect(() => setTopicStateSchema.parse({ topicId: '12', digested: true, confirmed: true })).toThrow()
    expect(setTopicStateSchema.parse({ topicId: '12', digested: true })).toEqual({ topicId: '12', digested: true })
  })

  it('rejects ambiguous question and vote or unsafe attachment input', () => {
    expect(() =>
      createTopicSchema.parse({
        groupId: '12',
        askUserId: '7',
        text: 'Question',
        vote: { title: 'x', options: ['a', 'b'] }
      })
    ).toThrow()
    expect(() => workspaceFileSchema.parse({ path: '/etc/passwd' })).toThrow()
    expect(() => workspaceFileSchema.parse({ path: '/workspace/../secret.txt' })).toThrow()
    expect(workspaceFileSchema.parse({ workspacePath: 'workspace/file.txt', originalName: 'file.txt' })).toMatchObject({
      workspacePath: 'workspace/file.txt'
    })
    expect(
      workspaceFileSchema.parse({
        fileRef: {
          source: 'platform.workspace.files',
          filePath: 'reports/file.txt',
          workspacePath: '/workspace/reports/file.txt',
          catalog: 'projects',
          projectId: 'project-1',
          originalName: 'file.txt'
        }
      })
    ).toMatchObject({ fileRef: { filePath: 'reports/file.txt', catalog: 'projects' } })
  })
})
