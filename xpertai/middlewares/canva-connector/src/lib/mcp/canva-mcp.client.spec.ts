import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { CanvaConnectorError } from '../errors.js'
import {
  describeMcpToolFailure,
  normalizeMcpError,
  normalizeToolArguments,
  requestOptions,
  validateToolArguments,
  type CanvaToolInputSchema
} from './canva-mcp.client.js'

describe('Canva MCP client boundaries', () => {
  const schema: CanvaToolInputSchema = {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      design_type: { type: 'string', enum: ['presentation', 'poster'] },
      language: { type: 'string' }
    },
    required: ['prompt'],
    additionalProperties: false
  }

  it('reports the actual upstream code and message without exposing credentials', () => {
    const result = describeMcpToolFailure('generate-design', {
      error: { code: 'invalid_arguments', message: 'access_token=secret-value is invalid' }
    })

    expect(result).toEqual({
      code: 'CANVA_INPUT_INVALID',
      message: "Canva MCP tool 'generate-design' failed (invalid_arguments): access_token=[redacted] is invalid",
      upstreamCode: 'invalid_arguments',
      retryable: false
    })
  })

  it('marks rate-limit failures as retryable', () => {
    expect(describeMcpToolFailure('generate-design', { error_code: 'rate_limited' })).toMatchObject({
      code: 'CANVA_RATE_LIMITED',
      retryable: true
    })
  })

  it('maps SDK timeouts without allowing an automatic generation retry', () => {
    expect(
      normalizeMcpError(new McpError(ErrorCode.RequestTimeout, 'Request timed out'), 'generate-design')
    ).toMatchObject({
      code: 'CANVA_JOB_TIMEOUT',
      message:
        'Canva design generation exceeded 120 seconds. The outcome is unknown, so it was not retried automatically.',
      retryable: false,
      upstreamCode: '-32001'
    })
  })

  it('uses a longer timeout only for design generation', () => {
    expect(requestOptions('generate-design')).toEqual({ timeout: 120_000, maxTotalTimeout: 120_000 })
    expect(requestOptions('search-designs')).toEqual({ timeout: 60_000, maxTotalTimeout: 60_000 })
    expect(requestOptions()).toEqual({ timeout: 60_000, maxTotalTimeout: 60_000 })
  })

  it('maps Canva monthly AI quota exhaustion to a stable non-retryable error', () => {
    const result = describeMcpToolFailure('generate-design', {
      message:
        'Display this message to the user exactly as written, do not paraphrase it: <verbatim>你本月的AI额度已用完，该额度会在下个月重置。请[查看方案](https://www.canva.cn/pro/#pricing)。</verbatim>'
    })

    expect(result).toEqual({
      code: 'CANVA_AI_QUOTA_EXHAUSTED',
      message:
        'Canva AI generation quota is exhausted for the current account. Wait for the monthly reset or review the Canva plan.',
      retryable: false
    })
    expect(JSON.stringify(result)).not.toContain('Display this message')
    expect(JSON.stringify(result)).not.toContain('<verbatim>')
  })

  it('removes provider control wrappers from ordinary failure messages', () => {
    expect(
      describeMcpToolFailure('generate-design', {
        message: 'Display this message to the user exactly as written: <verbatim>服务暂时不可用</verbatim>'
      })
    ).toMatchObject({
      message: "Canva MCP tool 'generate-design' failed: 服务暂时不可用"
    })
  })

  it('maps permission failures to a scope error instead of pretending the token expired', () => {
    expect(describeMcpToolFailure('generate-design', { code: 'forbidden' })).toMatchObject({
      code: 'CANVA_SCOPE_MISSING',
      retryable: false
    })
  })

  it('keeps a text error when structured content is empty', () => {
    expect(describeMcpToolFailure('generate-design', { message: 'generation rejected by Canva' })).toMatchObject({
      message: "Canva MCP tool 'generate-design' failed: generation rejected by Canva"
    })
  })

  it('rejects arguments that do not match the live MCP schema', () => {
    expect(() => validateToolArguments('generate-design', { prompt: 'test', design_type: 'banner' }, schema)).toThrow(
      CanvaConnectorError
    )
    expect(() => validateToolArguments('generate-design', { prompt: 'test', unsupported: true }, schema)).toThrow(
      "does not accept argument 'unsupported'"
    )
    expect(() => validateToolArguments('generate-design', { design_type: 'poster' }, schema)).toThrow(
      "requires argument 'prompt'"
    )
  })

  it('omits unsupported search pagination fields from strict live schemas', () => {
    const liveSchema: CanvaToolInputSchema = {
      type: 'object',
      properties: { query: { type: 'string' } },
      additionalProperties: false
    }

    expect(normalizeToolArguments('search-designs', { query: '测试', page: 1, page_size: 5 }, liveSchema)).toEqual({
      query: '测试'
    })
    expect(
      normalizeToolArguments(
        'search-designs',
        { query: '测试', page: 2, page_size: 5 },
        {
          ...liveSchema,
          properties: { query: { type: 'string' }, page: { type: 'integer' }, page_size: { type: 'integer' } }
        }
      )
    ).toEqual({ query: '测试', page: 2, page_size: 5 })
    expect(normalizeToolArguments('get-design', { prompt: '测试', page: 1 }, liveSchema)).toEqual({
      prompt: '测试',
      page: 1
    })
  })

  it('maps prompt to query for generate-design deployments using the renamed field', () => {
    const liveSchema: CanvaToolInputSchema = {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false
    }

    expect(
      normalizeToolArguments(
        'generate-design',
        {
          prompt: '生成一张测试海报',
          design_type: 'poster',
          language: 'zh-CN',
          user_intent: '生成活动海报'
        },
        liveSchema
      )
    ).toEqual({ query: '生成一张测试海报' })
  })
})
