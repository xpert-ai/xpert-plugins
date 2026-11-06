import { Badge, Button, Input } from '@xpert-ai/plugin-shadcn-ui'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { React } from '../vendor'
import type { Catalog } from '../i18n'
import type { TaskSummary } from '../types'
import { STATUS_LABEL, type BatchProgress } from '../workbench-utils'

type TaskListProps = {
  t: Catalog
  tasks: TaskSummary[]
  selectedId: string | null
  search: string
  batch: BatchProgress | null
  pendingCount: number
  isBusy: boolean
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onBatchParse: () => void
  onSelect: (id: string) => void
}

export function TaskList({
  t,
  tasks,
  selectedId,
  search,
  batch,
  pendingCount,
  isBusy,
  onSearchChange,
  onSearchSubmit,
  onBatchParse,
  onSelect
}: TaskListProps) {
  return (
    <>
      <div className="la-sidebar-head">
        <div className="la-sidebar-title">
          <span>{t.taskList}</span>
          <span>{tasks.length}</span>
        </div>
        <Input
          value={search}
          placeholder={t.searchPlaceholder}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchChange(event.target.value)}
          onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') onSearchSubmit()
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={onBatchParse}
          disabled={isBusy || (!batch && pendingCount === 0)}
          title={t.batchParseHint}
        >
          {batch ? `${t.batchParsing} ${batch.done}/${batch.total}` : `${t.batchParse} (${pendingCount})`}
        </Button>
        {batch ? (
          <div
            className="la-batch-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={batch.total}
            aria-valuenow={batch.done}
          >
            <span style={{ width: `${batch.total ? Math.round((batch.done / batch.total) * 100) : 0}%` }} />
          </div>
        ) : null}
      </div>
      <div className="la-task-list">
        {tasks.length === 0 ? (
          <div className="la-empty" style={{ padding: '24px 8px' }}>
            <h3>{t.noTasks}</h3>
            <p>{t.noTasksHint}</p>
          </div>
        ) : (
          tasks.map((task) => (
            <button
              key={task.id}
              className={`la-task${task.id === selectedId ? ' la-task--active' : ''}`}
              onClick={() => onSelect(task.id)}
            >
              <span className="la-task-title">{task.title || t.untitledTask}</span>
              <span className="la-task-preview">{task.sourcePreview}</span>
              <span className="la-task-meta">
                <Badge variant="outline" className={`la-status--${task.status}`}>
                  {t[STATUS_LABEL[task.status]]}
                </Badge>
                {task.price ? <span>{task.price}</span> : null}
                {task.attemptCount ? <span>{`${t.attemptPrefix} ${task.attemptCount}`}</span> : null}
              </span>
            </button>
          ))
        )}
      </div>
    </>
  )
}
