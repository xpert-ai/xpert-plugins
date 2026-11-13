import { ConflictException } from '@nestjs/common'
import { RESUME_REVISION_CONFLICT, RESUME_CRITERIA_LOCKED } from './action-contract.js'

export class ResumeRevisionConflictError extends ConflictException {
  readonly errorCode = RESUME_REVISION_CONFLICT
}

export class ResumeCriteriaLockedError extends ConflictException {
  readonly errorCode = RESUME_CRITERIA_LOCKED
}
