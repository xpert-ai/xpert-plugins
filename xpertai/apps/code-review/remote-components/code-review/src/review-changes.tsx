import React from 'react'
import { Check, FileCode2, MessageSquare } from 'lucide-react'
import {
  Button,
  Badge,
  Checkbox,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@xpert-ai/plugin-shadcn-ui'
import { diffLines, type Snapshot, type Finding } from '../../../src/domain'
import { i18n } from './i18n'
export function ReviewChanges({
  snapshot,
  findings,
  viewed,
  path,
  onPath,
  onViewed,
  onAsk,
  busy,
  locale
}: {
  snapshot: Snapshot
  findings: Finding[]
  viewed: string[]
  path: string
  onPath: (path: string) => void
  onViewed: (viewed: string[]) => void
  onAsk: (finding: Finding) => void
  busy: boolean
  locale: string
}) {
  const { t } = i18n(locale),
    file = snapshot.files.find((item) => item.filename === path)
  if (!file) return <p className="p-5 text-sm text-muted-foreground">{t('noChangedFiles')}</p>
  return (
    <div className="min-w-0 p-5">
      <div className="overflow-hidden rounded-lg border">
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2">
          <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
          <Select value={path} onValueChange={onPath}>
            <SelectTrigger className="min-w-0 flex-1" aria-label={t('changedFile')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {snapshot.files.map((item) => (
                <SelectItem key={item.filename} value={item.filename}>
                  {item.filename}
                  {viewed.includes(item.filename) && <Check className="size-3" />}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs tabular-nums text-muted-foreground">
            +{file.additions} −{file.deletions}
          </span>
          <label className="flex shrink-0 items-center gap-2 text-xs">
            <Checkbox
              checked={viewed.includes(path)}
              disabled={busy}
              onCheckedChange={(value) =>
                onViewed(value ? [...new Set([...viewed, path])] : viewed.filter((p) => p !== path))
              }
            />
            {t('viewed')}
          </label>
        </div>
        <div className="overflow-auto font-mono text-xs">
          <table className="w-full border-collapse">
            <tbody>
              {file.patch ? (
                diffLines(file.patch).map((line, index) => (
                  <React.Fragment key={index}>
                    <tr
                      className={
                        line.kind === 'added'
                          ? 'diff-added'
                          : line.kind === 'removed'
                          ? 'diff-removed'
                          : 'text-muted-foreground'
                      }
                    >
                      <td className="w-10 select-none border-r px-2 text-right text-muted-foreground">{line.left}</td>
                      <td className="w-10 select-none border-r px-2 text-right text-muted-foreground">{line.right}</td>
                      <td className="whitespace-pre px-3 py-1">{line.text}</td>
                    </tr>
                    {findings
                      .filter((f) => f.path === path && (f.side === 'RIGHT' ? line.right : line.left) === f.line)
                      .map((finding, n) => (
                        <tr key={n}>
                          <td colSpan={3} className="px-4 py-3 font-sans">
                            <article className="rounded-lg border bg-muted/60 p-4">
                              <div className="flex items-center gap-2 font-medium">
                                <Badge variant="outline">{finding.priority}</Badge>
                                {finding.title}
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{finding.body}</p>
                              <Button variant="ghost" size="sm" onClick={() => onAsk(finding)}>
                                <MessageSquare className="size-4" />
                                {t('askInChat')}
                              </Button>
                            </article>
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td className="p-4">{t('diffUnavailableOpenGithubToInspectThisFile')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
