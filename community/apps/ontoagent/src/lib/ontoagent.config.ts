import { join } from 'path'
import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
import { z } from 'zod'

const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

export const OntoAgentPluginConfigSchema = z.object({
  autoOntology: z
    .object({
      apiUrl: z.string().optional(),
      apiToken: z.string().optional(),
      /** 逗号分隔的 Auto 数据库 ID；空 = Auto 默认库 */
      databaseIds: z.string().optional(),
      source: z.string().optional()
    })
    .optional(),
  /** 镜像根目录；实际按 tenant/organization 分子目录 */
  storeDir: z.string().optional(),
  budget: z
    .object({
      maxTerms: z.number().int().positive().optional(),
      maxAssertions: z.number().int().positive().optional(),
      maxChars: z.number().int().positive().optional()
    })
    .optional(),
  gate: z
    .object({
      autoGateThreshold: z.number().min(0).max(1).optional(),
      autoGateVersion: z.string().optional(),
      gateOn: z.enum(['dense', 'jev']).optional(),
      denseLimit: z.number().int().positive().optional(),
      rerankLimit: z.number().int().positive().optional()
    })
    .optional(),
  models: z
    .object({
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      chatModel: z.string().optional(),
      embedBaseUrl: z.string().optional(),
      embedModel: z.string().optional()
    })
    .optional()
})

export type OntoAgentPluginConfig = z.infer<typeof OntoAgentPluginConfigSchema>

export interface ResolvedOntoAgentPluginConfig {
  apiUrl?: string
  apiToken?: string
  databaseIds: string[]
  source: string
  storeDir: string
  budget: { maxTerms?: number; maxAssertions?: number; maxChars?: number }
  gate: {
    threshold: number
    thresholdVersion: string
    gateOn?: 'dense' | 'jev'
    denseLimit?: number
    rerankLimit?: number
  }
  models: {
    baseUrl?: string
    apiKey?: string
    chatModel?: string
    embedBaseUrl?: string
    embedModel?: string
  }
}

export function readOntoAgentPluginEnvDefaults(): OntoAgentPluginConfig {
  return {
    autoOntology: {
      apiUrl: readOptionalString(process.env['ONTOAGENT_AUTO_API_URL']),
      apiToken: readOptionalString(process.env['ONTOAGENT_AUTO_API_TOKEN']),
      databaseIds: readOptionalString(process.env['ONTOAGENT_AUTO_DATABASE_IDS']),
      source: readOptionalString(process.env['ONTOAGENT_AUTO_SOURCE'])
    },
    storeDir: readOptionalString(process.env['ONTOAGENT_STORE_DIR']),
    gate: {
      autoGateThreshold: readOptionalNumber(process.env['ONTOAGENT_GATE_THRESHOLD']),
      autoGateVersion: readOptionalString(process.env['ONTOAGENT_GATE_VERSION'])
    },
    models: {
      baseUrl: readOptionalString(process.env['ONTOAGENT_MODEL_BASE_URL']),
      apiKey: readOptionalString(process.env['ONTOAGENT_MODEL_API_KEY']),
      chatModel: readOptionalString(process.env['ONTOAGENT_CHAT_MODEL']),
      embedBaseUrl: readOptionalString(process.env['ONTOAGENT_EMBED_BASE_URL']),
      embedModel: readOptionalString(process.env['ONTOAGENT_EMBED_MODEL'])
    }
  }
}

export function resolveOntoAgentPluginConfig(input: OntoAgentPluginConfig | undefined): ResolvedOntoAgentPluginConfig {
  const env = readOntoAgentPluginEnvDefaults()
  const auto = input?.autoOntology ?? {}
  const models = input?.models ?? {}
  return {
    apiUrl: readOptionalString(auto.apiUrl) ?? env.autoOntology?.apiUrl,
    apiToken: readOptionalString(auto.apiToken) ?? env.autoOntology?.apiToken,
    databaseIds: (readOptionalString(auto.databaseIds) ?? env.autoOntology?.databaseIds ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    source: readOptionalString(auto.source) ?? env.autoOntology?.source ?? 'default',
    storeDir: readOptionalString(input?.storeDir) ?? env.storeDir ?? join(process.cwd(), 'data', 'ontoagent'),
    budget: {
      maxTerms: input?.budget?.maxTerms,
      maxAssertions: input?.budget?.maxAssertions,
      maxChars: input?.budget?.maxChars
    },
    gate: {
      threshold: input?.gate?.autoGateThreshold ?? env.gate?.autoGateThreshold ?? 0,
      thresholdVersion: input?.gate?.autoGateVersion ?? env.gate?.autoGateVersion ?? 'auto-gate-v1',
      gateOn: input?.gate?.gateOn,
      denseLimit: input?.gate?.denseLimit,
      rerankLimit: input?.gate?.rerankLimit
    },
    models: {
      baseUrl: readOptionalString(models.baseUrl) ?? env.models?.baseUrl,
      apiKey: readOptionalString(models.apiKey) ?? env.models?.apiKey,
      chatModel: readOptionalString(models.chatModel) ?? env.models?.chatModel,
      embedBaseUrl: readOptionalString(models.embedBaseUrl) ?? env.models?.embedBaseUrl,
      embedModel: readOptionalString(models.embedModel) ?? env.models?.embedModel
    }
  }
}

export const OntoAgentPluginConfigFormSchema = {
  type: 'object',
  properties: {
    autoOntology: {
      type: 'object',
      title: text('Auto-Ontology API', 'Auto-Ontology API'),
      properties: {
        apiUrl: {
          type: 'string',
          title: text('API Base URL', 'API 地址'),
          description: text('Example: http://localhost:3000', '例如：http://localhost:3000')
        },
        apiToken: {
          type: 'string',
          title: text('API Token', 'API 令牌'),
          description: text('Minted in Auto-Ontology user menu → API Tokens. Stored as plugin credential.', '在 Auto-Ontology 用户菜单 → API Tokens 生成，作为插件凭证保存。')
        },
        databaseIds: {
          type: 'string',
          title: text('Database IDs', '数据库 ID'),
          description: text('Comma separated Auto database ids; empty = default.', '逗号分隔的 Auto 数据库 ID；留空为默认库。')
        }
      }
    },
    storeDir: {
      type: 'string',
      title: text('Mirror Store Directory', '镜像存储目录'),
      description: text('Server-side directory for append-only mirrors, partitioned per tenant/organization.', '服务端 append-only 镜像根目录，按租户/组织隔离。')
    },
    models: {
      type: 'object',
      title: text('Retrieval Models (optional)', '检索模型（可选）'),
      properties: {
        embedBaseUrl: {
          type: 'string',
          title: text('Embedding Base URL', '嵌入服务地址'),
          description: text('OpenAI-compatible base URL, e.g. http://ollama:11434/v1. Empty = lexical retrieval only.', 'OpenAI 兼容地址，例如 http://ollama:11434/v1；留空则仅词法检索。')
        },
        embedModel: {
          type: 'string',
          title: text('Embedding Model', '嵌入模型'),
          description: text('Example: bge-m3. Enables dense retrieval when set with embedBaseUrl.', '例如 bge-m3；与嵌入地址同时配置后启用 dense 检索。')
        },
        baseUrl: { type: 'string', title: text('Chat Base URL', '对话模型地址') },
        apiKey: { type: 'string', title: text('Chat API Key', '对话模型密钥') },
        chatModel: { type: 'string', title: text('Chat Model', '对话模型') }
      }
    }
  }
} satisfies JsonSchemaObjectType

function readOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function readOptionalNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}
