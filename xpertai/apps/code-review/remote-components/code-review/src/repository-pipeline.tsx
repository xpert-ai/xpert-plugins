import React from 'react'
import { WORKBENCH_NAVIGATION_OPEN_COMMAND, WORKBENCH_ASSISTANT_PROJECT_TARGET } from '@xpert-ai/contracts'
import { command, type Host } from './bridge'
import { i18n } from './i18n'
import { PipelineSetup } from './pipeline-setup'
import type { PipelineTarget } from '../../../src/automation-contract'
import type { ReviewPipelineChoice } from '../../../src/pipeline/setup-contract'

export function openPipeline(projectId: string, pipelineInstanceId?: string | null, pipelineRoundId?: string | null) {
  return command(WORKBENCH_NAVIGATION_OPEN_COMMAND, { target: WORKBENCH_ASSISTANT_PROJECT_TARGET,
    projectId, viewKey: 'platform.project-tasks__timeline',
    // Workbench view focus is passed through parameters; top-level pipeline IDs are web route hints.
    parameters: { initialTab: 'pipeline', ...(pipelineInstanceId ? { pipelineInstanceId } : {}),
      ...(pipelineRoundId ? { pipelineRoundId } : {}) } })
}
export function RepositoryPipeline({ host, target, disabled, onChange }: { host: Host | null; target: PipelineTarget | null;
  disabled: boolean; onChange: (choice: ReviewPipelineChoice | null) => void }) {
  const { t } = i18n(host?.locale)
  return <section className="space-y-3 border-t pt-4">
    <h3 className="text-sm font-medium">{t('repositoryPipeline')}</h3>
    <p className="text-sm text-muted-foreground">{t('repositoryPipelineHelp')}</p>
    <PipelineSetup host={host} sourceKind="github" initialTarget={target} disabled={disabled} onChange={onChange}/>
  </section>
}
