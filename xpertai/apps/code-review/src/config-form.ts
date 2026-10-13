import type { JsonSchemaObjectType } from '@xpert-ai/contracts'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const configForm = {
  type: 'object', properties: {
    githubApp: { type: 'object', title: text('GitHub App for automatic reviews', '自动审查 GitHub App'), properties: {
      appId: { type: 'string', title: text('App ID', 'App ID') },
      slug: { type: 'string', title: text('App slug', 'App 名称（URL 中的标识）') },
      privateKey: { type: 'string', title: text('Private key (PEM)', '私钥（PEM）'), 'x-ui': { component: 'secretInput', revealable: false } },
      webhookSecret: { type: 'string', title: text('Webhook secret (32+ characters)', 'Webhook 密钥（至少 32 字符）'), 'x-ui': { component: 'secretInput', revealable: false } },
      publicBaseUrl: { type: 'string', title: text('Public API origin', '公网 API 地址'), description: text('GitHub must reach /api/code_review/github/webhook on this origin.', 'GitHub 需要能访问此地址下的 /api/code_review/github/webhook。') }
    } }
  }
} satisfies JsonSchemaObjectType
