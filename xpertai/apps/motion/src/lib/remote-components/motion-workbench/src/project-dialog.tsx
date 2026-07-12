import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@xpert-ai/plugin-shadcn-ui'
import { Input } from '@xpert-ai/plugin-shadcn-ui'
import { Textarea } from '@xpert-ai/plugin-shadcn-ui'
import type { MotionSurface, ProjectSummary } from './motion-types'
import { labelForStatus, type Translator } from './i18n'
import { Button, h } from './ui'

export function ProjectDialog(props: {
  open: boolean
  projects: ProjectSummary[]
  selectedProjectId: string | null
  title: string
  brief: string
  saving: boolean
  t: Translator
  onOpenChange: (open: boolean) => void
  onTitleChange: (value: string) => void
  onBriefChange: (value: string) => void
  onCreate: (surface: MotionSurface) => Promise<void>
  onSelect: (projectId: string) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="motion-project-dialog">
        <DialogHeader>
          <DialogTitle>{props.t('projectDialogTitle')}</DialogTitle>
          <DialogDescription>{props.t('projectDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="project-dialog-layout">
          <section className="project-dialog-create">
            <h3>{props.t('newProject')}</h3>
            <label>
              <span>{props.t('title')}</span>
              <Input value={props.title} onChange={(event) => props.onTitleChange(event.target.value)} />
            </label>
            <label>
              <span>{props.t('brief')}</span>
              <Textarea value={props.brief} onChange={(event) => props.onBriefChange(event.target.value)} rows={5} />
            </label>
            <div className="motion-button-row">
              <Button onClick={() => void props.onCreate('web')} disabled={props.saving}>
                {props.t('newWeb')}
              </Button>
              <Button variant="secondary" onClick={() => void props.onCreate('video')} disabled={props.saving}>
                {props.t('newVideo')}
              </Button>
            </div>
          </section>
          <section className="project-dialog-list">
            <h3>{props.t('currentProject')}</h3>
            <div className="motion-list">
              {props.projects.map((project) => (
                <Button
                  key={project.id}
                  variant={project.id === props.selectedProjectId ? 'secondary' : 'outline'}
                  className={`motion-list-item ${project.id === props.selectedProjectId ? 'active' : ''}`}
                  onClick={() => {
                    props.onSelect(project.id)
                    props.onOpenChange(false)
                  }}
                >
                  <strong>{project.title}</strong>
                  <span>{props.t('projectSummary', { surface: projectSurfaceLabel(project.surface, props.t), version: project.currentVersionNumber || 0, status: labelForStatus(project.status, props.t) })}</span>
                </Button>
              ))}
              {props.projects.length === 0 ? <div className="motion-empty">{props.t('noProjects')}</div> : null}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function projectSurfaceLabel(surface: ProjectSummary['surface'], t: Translator) {
  if (surface === 'video') return t('createVideo')
  return t('createWeb')
}
