import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse } from 'yaml'
import { z } from 'zod/v3'
import { appContribution, templates } from '../src/templates.js'
import { REVIEW_PROJECT_TYPE, PLUGIN } from '../src/domain.js'
import { ReviewPipelineContribution } from '../src/pipeline/configuration.js'

test('Code Review registers a direct Project type and uses the same identity in every pipeline and Assistant', () => {
  assert.equal(REVIEW_PROJECT_TYPE.applicationKey, `${PLUGIN}:${appContribution.name}`)
  assert.deepEqual(appContribution.projectTypes?.map(type => ({ key: type.key, binding: type.binding })),
    [{ key: REVIEW_PROJECT_TYPE.projectTypeKey, binding: { kind: 'project' } }])
  for (const configuration of new ReviewPipelineContribution().configurations)
    assert.deepEqual(configuration.template.projectTypes, [REVIEW_PROJECT_TYPE])
  const dsl = z.object({ team: z.object({ options: z.object({ workspaceScope: z.object({
    mode: z.literal('project-preferred'), projectType: z.object({ applicationKey: z.string(), projectTypeKey: z.string() })
  }) }) }) }).parse(parse(templates[0].dslContent!))
  assert.deepEqual(dsl.team.options.workspaceScope.projectType, REVIEW_PROJECT_TYPE)
})
