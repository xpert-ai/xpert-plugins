import { buildGeminiInvocationParams } from './model-parameters.js'

describe('Gemini model parameters', () => {
  it('maps thinking options into generation config', () => {
    expect(
      buildGeminiInvocationParams({}, {
        temperature: 1,
        max_output_tokens: 8192,
        thinking_mode: true,
        thinking_budget: 4096,
        thinking_level: 'High',
        include_thoughts: true
      })
    ).toMatchObject({
      generationConfig: {
        temperature: 1,
        maxOutputTokens: 8192,
        thinkingConfig: {
          thinkingBudget: 4096,
          thinkingLevel: 'HIGH',
          includeThoughts: true
        }
      }
    })
  })

  it('uses a zero budget when thinking is disabled', () => {
    expect(buildGeminiInvocationParams({}, { thinking_mode: false, thinking_budget: 4096 })).toMatchObject({
      generationConfig: {
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    })
  })

  it('adds enabled built-in tools without dropping function tools', () => {
    const functionTool = { functionDeclarations: [{ name: 'lookup' }] }
    const params = buildGeminiInvocationParams(
      { tools: [functionTool] },
      { grounding: true, url_context: true, code_execution: true }
    )

    expect(params.tools).toEqual([
      functionTool,
      { googleSearch: {} },
      { urlContext: {} },
      { codeExecution: {} }
    ])
  })
})
