import { readFileSync } from 'node:fs'
import { XpertTypeEnum, type PluginMarketplaceContribution } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { FEATURE, PLUGIN, PROVIDER, REVIEW_PROJECT_TYPE } from './domain.js'
import { icon } from './view.js'
const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const templates: XpertTemplateContribution[] = [{
  key: 'code-review-assistant', name: 'Code Review Assistant', title: '代码审查', icon,
  description: '检查 Pull Request，核对差异与问题依据，确认后提交审查。', type: XpertTypeEnum.Agent, category: 'Development',
  targetApps: ['xpert', 'data-xpert'], targetAppMeta: { xpert: { types: ['business-assistant'], capabilities: [FEATURE], requiredPlugins: [PLUGIN], defaultConfig: { viewProvider: PROVIDER } } },
  dslContent: readFileSync(new URL('./code-review-assistant.yaml', import.meta.url), 'utf8'),
  startPrompts: ['如何开始审查一个 Pull Request？', '如何连接 GitHub 查看待审查列表？'], providerKey: 'code_review.templates', default: false, order: 35
}]
export const appContribution: PluginMarketplaceContribution = {
  type: 'app', name: 'code-review', displayName: label('Code Review', '代码审查'), icon,
  projectTypes: [{ key: REVIEW_PROJECT_TYPE.projectTypeKey, title: label('Code Review Project', '代码审查项目'), icon,
    binding: { kind: 'project' } }],
  description: label('Review pull requests with commit-bound evidence.', '对照提交版本审查代码，在确认后提交到 GitHub。'),
  appConfig: { scope: 'organization', assistantTemplateKey: 'code-review-assistant', workspace: { mode: 'dedicated', name: label('Code Review', '代码审查工作空间'), sharing: 'organization' }, knowledgebases: [], modelRequirements: { primary: true }, entry: { type: 'assistant-chat' },
    presentation: { tagline: label('Read the change. Verify the finding.', '读懂变更，核实问题。'), developer: 'XpertAI', screenshots: ['./assets/brand/code-review-overview-zh-v1.png'], features: [
      { key: 'inbox', title: label('Pull request inbox', 'PR 收件箱'), description: label('Open a public URL, or use your connected GitHub account for requested and authored pull requests.', '输入公开 PR 地址，或通过已连接的 GitHub 查看待审查和自己创建的 PR。') },
      { key: 'review', title: label('Evidence-based review', '带依据的审查'), description: label('Browse diffs, checks and model findings tied to an immutable commit.', '浏览文件差异、检查结果与固定提交版本上的模型发现。') },
      { key: 'submit', title: label('Confirm before submitting', '确认后提交'), description: label('Choose findings and submit after a fresh commit check.', '选择要提交的问题，校验最新提交后再发送。') }
    ], dataScope: label('Unbound drafts stay private. Explicitly bound pipeline reviews are visible in their Project; historical private reviews are not migrated. GitHub credentials stay in host integrations.', '未绑定的草稿保持私有；明确绑定流水线后的审查在所属项目中可见，历史私有记录不自动迁移。GitHub 凭据由平台集成管理。'), initializationSummary: label('Creates a workspace and Assistant. Select an existing primary model. Connect GitHub for private repositories and submission.', '创建工作空间及助手。选择现有主模型；私有仓库及提交审查需要连接 GitHub。') }
  }
}
