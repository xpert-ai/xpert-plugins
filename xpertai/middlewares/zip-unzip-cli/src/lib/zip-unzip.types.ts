import { JsonSchemaObjectType } from '@metad/contracts'
import { z } from 'zod'

export const ZIP_UNZIP_SKILL_MIDDLEWARE_NAME = 'ZipUnzipCLISkill'
export const DEFAULT_ZIP_UNZIP_SKILLS_DIR = '/workspace/.xpert/skills/zip-unzip'
export const DEFAULT_ZIP_UNZIP_STAMP_PATH = '/workspace/.xpert/.zip-unzip-bootstrap.json'
export const ZIP_UNZIP_BOOTSTRAP_SCHEMA_VERSION = 1

export const ZipUnzipConfigSchema = z.object({})

export type ZipUnzipConfig = z.infer<typeof ZipUnzipConfigSchema>

export const ZipUnzipConfigFormSchema: JsonSchemaObjectType = {
  type: 'object',
  properties: {}
}
