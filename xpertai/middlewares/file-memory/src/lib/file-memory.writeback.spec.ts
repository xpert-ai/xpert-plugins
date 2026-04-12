const mockLongTermMemoryTypeEnum = {
  PROFILE: 'profile',
  QA: 'qa'
}

jest.mock('@xpert-ai/contracts', () => ({
  __esModule: true,
  LongTermMemoryTypeEnum: {
    PROFILE: 'profile',
    QA: 'qa'
  },
  MEMORY_PROFILE_PROMPT: 'PROFILE_PROMPT',
  MEMORY_QA_PROMPT: 'QA_PROMPT'
}))

import { HumanMessage } from '@langchain/core/messages'
import { decideMemoryWriteback } from './file-memory.writeback.js'
import { createInternalRunnableConfig } from './internal-runnable-config.js'

describe('decideMemoryWriteback', () => {
  it('invokes the writeback selector as an internal nostream runnable', async () => {
    const invoke = jest.fn().mockResolvedValue({
      action: 'upsert',
      semanticKind: 'user',
      kind: mockLongTermMemoryTypeEnum.PROFILE,
      audience: 'user',
      memoryId: null,
      title: 'Response style',
      content: 'Keep answers concise.',
      context: null,
      tags: ['style'],
      reason: null
    })
    const withConfig = jest.fn().mockReturnValue({
      invoke
    })
    const model = {
      withStructuredOutput: jest.fn().mockReturnValue({
        withConfig
      })
    }

    const decision = await decideMemoryWriteback(
      model as any,
      'user' as any,
      [new HumanMessage('Please remember that I prefer concise answers.')],
      [],
      undefined
    )

    expect(withConfig).toHaveBeenCalledWith(createInternalRunnableConfig('file-memory-writeback-decision'))
    expect(invoke).toHaveBeenCalledTimes(1)
    const promptMessages = invoke.mock.calls[0][0]
    expect(String(promptMessages[promptMessages.length - 1].content)).toContain(
      'Write title, content, context, tags, and reason in Simplified Chinese by default.'
    )
    expect(String(promptMessages[promptMessages.length - 1].content)).toContain(
      'Do not mix English prose into an otherwise Chinese sentence.'
    )
    expect(decision).toEqual({
      action: 'upsert',
      kind: mockLongTermMemoryTypeEnum.PROFILE,
      semanticKind: 'user',
      audience: 'user',
      memoryId: null,
      title: 'Response style',
      content: 'Keep answers concise.',
      context: undefined,
      tags: ['style']
    })
  })
})
