import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { DEGREE_RANK } from './types.js'
import { uniqueSkills } from './candidate-evidence.js'
import type { ScreeningEditFields } from './types.js'

export function screeningEditFields(input: ScreeningEditFields): ScreeningEditFields {
  if (!input.title?.trim() || !input.jobTitle?.trim() || !input.jdText?.trim()
    || input.title.length > 200 || input.jobTitle.length > 200 || input.jdText.length > 20000) {
    throw new BadRequestException('Title, job title and JD are required and must fit the text limits.')
  }
  if (!Number.isInteger(input.minYears) || input.minYears < 0 || input.minYears > 50
    || !Object.hasOwn(DEGREE_RANK, input.minDegree)) {
    throw new BadRequestException('Invalid minimum years or degree.')
  }
  if (!Array.isArray(input.requiredSkills) || input.requiredSkills.length < 1 || input.requiredSkills.length > 20
    || input.requiredSkills.some((skill) => typeof skill !== 'string' || !skill.trim() || skill.length > 100)) {
    throw new BadRequestException('Provide 1-20 nonempty required skills of at most 100 characters each.')
  }
  return { title: input.title.trim(), jobTitle: input.jobTitle.trim(), jdText: input.jdText.trim(),
    minYears: input.minYears, minDegree: input.minDegree, requiredSkills: uniqueSkills(input.requiredSkills) }
}

export function screeningEditVersion(input: ScreeningEditFields): string {
  // Hash explicit saved fields; unrelated status/score writes do not create edit conflicts.
  return createHash('sha256').update(JSON.stringify([input.title, input.jobTitle, input.jdText,
    input.minYears, input.minDegree, input.requiredSkills])).digest('hex')
}

export function sameScreeningCriteria(a: ScreeningEditFields, b: ScreeningEditFields): boolean {
  return a.jobTitle === b.jobTitle && a.jdText === b.jdText && a.minYears === b.minYears
    && a.minDegree === b.minDegree && JSON.stringify(a.requiredSkills) === JSON.stringify(b.requiredSkills)
}
