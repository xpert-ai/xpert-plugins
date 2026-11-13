import { parseSkillInput } from './skill-input'

export interface ScreeningFormDraft {
  title: string
  jobTitle: string
  jdText: string
  minYears: string
  skills: string
}

export function screeningFormErrors(draft: ScreeningFormDraft) {
  return {
    title: !draft.title.trim() ? 'fieldTitleRequired' : draft.title.length > 200 ? 'fieldTitleLimit' : null,
    jobTitle: !draft.jobTitle.trim() ? 'fieldJobRequired' : draft.jobTitle.length > 200 ? 'fieldJobLimit' : null,
    jdText: !draft.jdText.trim() ? 'fieldJdRequired' : draft.jdText.length > 20000 ? 'fieldJdLimit' : null,
    minYears: !draft.minYears.trim() || !Number.isInteger(Number(draft.minYears))
      || Number(draft.minYears) < 0 || Number(draft.minYears) > 50 ? 'fieldYearsInvalid' : null,
    skills: parseSkillInput(draft.skills).length === 0 ? 'fieldSkillsRequired' : null
  } as const
}
