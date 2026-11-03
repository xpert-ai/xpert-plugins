import React from 'react'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@xpert-ai/plugin-shadcn-ui'
import { RemoteI18nProvider, useRemoteLocale } from '@xpert-ai/plugin-shadcn-ui/i18n'
import { eventI18n } from './event-i18n'

type Props = { app: { configured: boolean; webhookUrl: string | null } }

export function GitHubSetupGuide({ app }: Props) {
  useRemoteLocale(eventI18n)
  const t = eventI18n.t
  return <RemoteI18nProvider i18n={eventI18n}>
    <section className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('setup.title')}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('setup.intro')}</p>
      </div>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">{t('setup.events.title')}</h3>
        <Table className="table-fixed">
          <TableHeader><TableRow>
            <TableHead className="w-2/5">{t('setup.events.event')}</TableHead>
            <TableHead>{t('setup.events.behavior')}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {([
              ['pull_request · opened / reopened', 'setup.events.opened'],
              ['pull_request · ready_for_review', 'setup.events.ready'],
              ['pull_request · synchronize', 'setup.events.synchronize'],
              ['workflow_run · completed · failure', 'setup.events.failure'],
              ['workflow_run · completed · timed_out', 'setup.events.timeout']
            ] as const).map(([event, message]) => <TableRow key={message}>
              <TableCell className="align-top whitespace-normal"><code className="break-words text-xs">{event}</code></TableCell>
              <TableCell className="align-top whitespace-normal">{t(message)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.events.filters')}</p>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.events.unsupported')}</p>
      </section>
      <section className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{t('setup.app.title')}</h3>
          <Badge variant="secondary">{t(app.configured ? 'setup.app.configured' : 'setup.app.required')}</Badge>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.app.statusHelp')}</p>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          <li>{t('setup.app.permissions')}</li>
          <li>{t('setup.app.integration')}</li>
          <li>{t('setup.app.credentials')}</li>
          <li>{t('setup.app.install')}</li>
        </ol>
        <p className="text-sm">{t('setup.app.webhookLabel')}</p>
        <code className="block break-all rounded-md bg-muted p-3 text-xs">
          {app.webhookUrl ?? 'https://YOUR-API-DOMAIN/api/code_review/github/webhook'}
        </code>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.app.webhookHelp')}</p>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.app.oauthHelp')}</p>
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">{t('setup.account.title')}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.account.connect')}</p>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.account.access')}</p>
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">{t('setup.rules.title')}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.rules.repository')}</p>
        <ul className="list-disc space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          <li>{t('setup.rules.assistant')}</li>
          <li>{t('setup.rules.pipeline')}</li>
        </ul>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.rules.runtime')}</p>
      </section>
      <section className="space-y-3 border-t pt-4">
        <h3 className="font-medium">{t('setup.verify.title')}</h3>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6 text-muted-foreground">
          <li>{t('setup.verify.trial')}</li>
          <li>{t('setup.verify.pr')}</li>
          <li>{t('setup.verify.workflow')}</li>
        </ol>
        <p className="text-sm leading-6 text-muted-foreground">{t('setup.verify.delivery')}</p>
      </section>
    </section>
  </RemoteI18nProvider>
}
