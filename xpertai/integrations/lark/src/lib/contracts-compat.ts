import contracts from '@metad/contracts'

const runtimeContracts = contracts as Record<string, any>

export const LanguagesEnum = runtimeContracts.LanguagesEnum
export const RolesEnum = runtimeContracts.RolesEnum
export const XpertAgentExecutionStatusEnum = runtimeContracts.XpertAgentExecutionStatusEnum
export const DocumentSourceProviderCategoryEnum = runtimeContracts.DocumentSourceProviderCategoryEnum
export const getToolCallIdFromConfig = runtimeContracts.getToolCallIdFromConfig as (
  config: unknown
) => string | undefined
export const messageContentText = runtimeContracts.messageContentText as (content: any) => string
export const STATE_VARIABLE_HUMAN = 'human' as const
