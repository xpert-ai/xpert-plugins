import * as React from 'react'
import { Button } from '@xpert-ai/plugin-shadcn-ui'
import type { messages } from './i18n'

export function DashboardStarter({ t, onStart }: {
  t: ReturnType<typeof messages>; onStart: (text: string) => Promise<void>
}) {
  return <section className="mx-auto grid max-w-2xl gap-5 p-6" aria-label={t.starterTitle}>
    <div><h2>{t.starterTitle}</h2><p className="text-sm text-muted-foreground">{t.starterHint}</p></div>
    <div className="grid gap-3">
      {([
        ['regionalTitle', 'regionalDescription', 'regionalPrompt'],
        ['salesTitle', 'salesDescription', 'salesPrompt'],
        ['qualityTitle', 'qualityDescription', 'qualityPrompt'],
        ['superstoreTitle', 'superstoreDescription', 'superstorePrompt']
      ] as const).map(([title, description, prompt]) => <div key={title} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div><p>{t[title]}</p><p className="text-sm text-muted-foreground">{t[description]}</p></div>
        <Button variant="outline" onClick={() => void onStart(t[prompt])} aria-label={`${t.tryExample}: ${t[title]}`}>{t.tryExample}</Button>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{t.realDataHint}</p><Button onClick={() => void onStart(t.realDataPrompt)}>{t.realDataTitle}</Button></div>
  </section>
}
