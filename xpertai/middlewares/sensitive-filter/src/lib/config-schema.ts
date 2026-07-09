import type { TAgentMiddlewareMeta } from '@metad/contracts'

export const sensitiveFilterMiddlewareConfigSchema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      title: {
        en_US: 'Filter Mode',
        zh_Hans: '过滤模式',
      },
      description: {
        en_US: 'Choose exactly one mode: Rule or LLM.',
        zh_Hans: '二选一：规则模式或 LLM 模式。',
      },
      enum: ['rule', 'llm'],
      default: 'rule',
      'x-ui': {
        enumLabels: {
          rule: { en_US: 'Rule Mode', zh_Hans: '规则模式' },
          llm: { en_US: 'LLM Mode', zh_Hans: 'LLM 模式' },
        },
      },
    },
    rules: {
      type: 'array',
      'x-ui': {
        span: 2,
      },
      title: {
        en_US: 'Business Rules',
        zh_Hans: '业务规则',
      },
      description: {
        en_US:
          'Used in rule mode. Draft rows are allowed during editing. Runtime requires valid fields.',
        zh_Hans: '规则模式使用。编辑阶段允许草稿行，运行阶段要求有效规则字段。',
      },
      items: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            title: { en_US: 'Rule ID', zh_Hans: '规则标识' },
            description: {
              en_US: 'Optional. Auto-generated when empty.',
              zh_Hans: '可选。留空时系统自动生成。',
            },
          },
          pattern: {
            type: 'string',
            title: { en_US: 'Pattern', zh_Hans: '匹配内容' },
          },
          type: {
            type: 'string',
            title: { en_US: 'Type', zh_Hans: '匹配类型' },
            enum: ['keyword', 'regex'],
            'x-ui': {
              enumLabels: {
                keyword: { en_US: 'Keyword', zh_Hans: '关键词' },
                regex: { en_US: 'Regex', zh_Hans: '正则表达式' },
              },
            },
          },
          scope: {
            type: 'string',
            title: { en_US: 'Scope', zh_Hans: '生效范围' },
            enum: ['input', 'output', 'both'],
            'x-ui': {
              enumLabels: {
                input: { en_US: 'Input', zh_Hans: '仅输入' },
                output: { en_US: 'Output', zh_Hans: '仅输出' },
                both: { en_US: 'Both', zh_Hans: '输入和输出' },
              },
            },
          },
          severity: {
            type: 'string',
            title: { en_US: 'Severity', zh_Hans: '优先级' },
            enum: ['high', 'medium'],
            'x-ui': {
              enumLabels: {
                high: { en_US: 'High', zh_Hans: '高' },
                medium: { en_US: 'Medium', zh_Hans: '中' },
              },
            },
          },
          action: {
            type: 'string',
            title: { en_US: 'Action', zh_Hans: '命中动作' },
            enum: ['block', 'rewrite'],
            'x-ui': {
              enumLabels: {
                block: { en_US: 'Block', zh_Hans: '拦截' },
                rewrite: { en_US: 'Rewrite', zh_Hans: '整句替换' },
              },
            },
          },
          replacementText: {
            type: 'string',
            title: { en_US: 'Replacement Text', zh_Hans: '替换文本（可选）' },
          },
        },
        required: ['pattern', 'type', 'action', 'scope', 'severity'],
      },
    },
    caseSensitive: {
      type: 'boolean',
      default: false,
      title: { en_US: 'Case Sensitive', zh_Hans: '区分大小写' },
      'x-ui': {
        span: 2,
      },
    },
    normalize: {
      type: 'boolean',
      default: true,
      title: { en_US: 'Normalize Text', zh_Hans: '文本标准化' },
      'x-ui': {
        span: 2,
      },
    },
    llm: {
      type: 'object',
      'x-ui': {
        span: 2,
      },
      title: {
        en_US: 'LLM Filter Config',
        zh_Hans: 'LLM 过滤配置',
      },
      description: {
        en_US: 'Used only when mode=llm.',
        zh_Hans: '仅在 mode=llm 时生效。',
      },
      properties: {
        model: {
          type: 'object',
          title: {
            en_US: 'Filter Model',
            zh_Hans: '过滤模型',
          },
          'x-ui': {
            component: 'ai-model-select',
            span: 2,
            inputs: {
              modelType: 'llm',
              hiddenLabel: true,
            },
          },
        },
        scope: {
          type: 'string',
          title: { en_US: 'Scope', zh_Hans: '生效范围' },
          enum: ['input', 'output', 'both'],
          'x-ui': {
            enumLabels: {
              input: { en_US: 'Input', zh_Hans: '仅输入' },
              output: { en_US: 'Output', zh_Hans: '仅输出' },
              both: { en_US: 'Both', zh_Hans: '输入和输出' },
            },
          },
        },
        rulePrompt: {
          type: 'string',
          title: { en_US: 'Rule Prompt', zh_Hans: '审核规则说明' },
          description: {
            en_US:
              'Describe your moderation rules in natural language. No JSON format is required.',
            zh_Hans: '用自然语言描述审核规则，无需手写 JSON 格式。',
          },
          'x-ui': {
            component: 'textarea',
            span: 2,
            placeholder: {
              en_US: 'e.g. Rewrite violent/privacy-sensitive content into a safe neutral response.',
              zh_Hans: '例如：涉及暴力或隐私泄露内容时，改写为安全中性表达。',
            },
          },
        },
        rewriteFallbackText: {
          type: 'string',
          title: { en_US: 'Rewrite Fallback Text', zh_Hans: '改写兜底文本' },
        },
        timeoutMs: {
          type: 'number',
          title: { en_US: 'Timeout (ms)', zh_Hans: '超时毫秒' },
        },
      },
      required: ['model', 'scope', 'rulePrompt'],
    },
    wecom: {
      type: 'object',
      'x-ui': {
        span: 2,
      },
      title: {
        en_US: 'WeCom Notify',
        zh_Hans: '企业微信群通知',
      },
      description: {
        en_US: 'When sensitive content is matched, send alerts to configured WeCom group webhooks.',
        zh_Hans: '敏感内容命中后，发送告警到已配置的企业微信群 webhook。',
      },
      properties: {
        enabled: {
          type: 'boolean',
          default: true,
          title: { en_US: 'Enabled', zh_Hans: '启用通知' },
        },
        timeoutMs: {
          type: 'number',
          title: { en_US: 'Timeout (ms)', zh_Hans: '请求超时(毫秒)' },
        },
        groups: {
          type: 'array',
          title: { en_US: 'Group Webhooks', zh_Hans: '群聊 Webhook 配置' },
          items: {
            type: 'object',
            properties: {
              webhookUrl: {
                type: 'string',
                title: { en_US: 'Webhook URL', zh_Hans: 'Webhook 地址' },
              },
            },
          },
        },
      },
    },
  },
  required: ['mode'],
  allOf: [
    {
      if: {
        properties: {
          mode: {
            const: 'llm',
          },
        },
      },
      then: {
        required: ['llm'],
      },
    },
  ],
} as TAgentMiddlewareMeta['configSchema']
