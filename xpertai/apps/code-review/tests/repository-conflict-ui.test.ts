import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RepositoryConflictNotice, conflictFromError } from '../remote-components/code-review/src/repository-conflict.js'
import { ActionError } from '../remote-components/code-review/src/bridge.js'
import { eventI18n } from '../remote-components/code-review/src/event-i18n.js'
import { repositoryConflictSchema, type RepositoryConflict } from '../src/repository-conflict-contract.js'

const details: RepositoryConflict = { kind: 'other_organization', repository: { owner: 'fixture', name: 'repo' },
  organization: { id: 'org', label: 'Organization A' }, configuredBy: { id: 'creator', label: 'Creator A' },
  maintainer: { id: 'maintainer', label: 'Maintainer B' }, assistant: null,
  enabled: false, createdAt: '2026-11-04T00:00:00.000Z', updatedAt: '2026-11-04T00:00:00.000Z' }

test('ownership notice translates complete messages, escapes labels and distinguishes missing identities', () => {
  for (const locale of ['zh-Hans', 'en']) {
    eventI18n.setLocale(locale)
    const html = renderToStaticMarkup(React.createElement(RepositoryConflictNotice, { conflict: details }))
    assert.match(html, /Organization A/); assert.match(html, /Creator A/); assert.match(html, /Maintainer B/)
    assert.doesNotMatch(html, /automation\.conflict\.|Bound Assistant|绑定助手/)
    assert.match(html, locale === 'en' ? /another organization/ : /其他组织/)
    assert.match(html, locale === 'en' ? /Paused|paused/ : /暂停/)
  }
  eventI18n.setLocale('zh-Hans')
  const sameOrg = { ...details, kind: 'other_assistant' as const, configuredBy: { id: 'legacy-user', label: null },
    maintainer: null, assistant: { id: 'assistant', label: '<script>untrusted</script>' } }
  const html = renderToStaticMarkup(React.createElement(RepositoryConflictNotice, { conflict: sameOrg }))
  assert.match(html, /当前组织的另一个助手/); assert.match(html, /legacy-user/); assert.match(html, /名称未记录/)
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/)
})

test('cross-tenant contract rejects extra ownership details and the notice only provides escalation guidance', () => {
  const conflict = { kind: 'other_tenant' as const, repository: details.repository }
  assert.equal(repositoryConflictSchema.safeParse({ ...conflict, organization: details.organization }).success, false)
  const html = renderToStaticMarkup(React.createElement(RepositoryConflictNotice, { conflict }))
  assert.match(html, /fixture\/repo/); assert.match(html, /平台管理员/)
  assert.doesNotMatch(html, /Organization A|Creator A|Maintainer B|首次配置时间|绑定助手/)
  assert.deepEqual(conflictFromError(new ActionError('repository_owned_elsewhere', { conflict })), conflict)
  assert.equal(conflictFromError(new Error('repository_owned_elsewhere')), null)
  assert.equal(conflictFromError(new ActionError('forbidden', { conflict })), null)
  assert.equal(conflictFromError(new ActionError('repository_owned_elsewhere', { conflict: { ...conflict, organization: 'private' } })), null)
})
