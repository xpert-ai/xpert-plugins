export * from './scoped.entity.js'
export * from './model-project.entity.js'
export * from './image-evidence.entity.js'
export * from './sculpt-spec-version.entity.js'
export * from './code-version.entity.js'
export * from './pipeline-run.entity.js'

import { CodeVersionEntity } from './code-version.entity.js'
import { ImageEvidenceEntity } from './image-evidence.entity.js'
import { ModelProjectEntity } from './model-project.entity.js'
import { PipelineRunEntity } from './pipeline-run.entity.js'
import { SculptSpecVersionEntity } from './sculpt-spec-version.entity.js'

export const IMG2THREEJS_ENTITIES = [
  ModelProjectEntity,
  ImageEvidenceEntity,
  SculptSpecVersionEntity,
  CodeVersionEntity,
  PipelineRunEntity
] as const
