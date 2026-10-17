import { test } from "node:test";
import assert from "node:assert/strict";
import { appContribution, templates } from "../src/templates.js";

test("Meetings activation requires a speech model before publishing the Assistant", () => {
  assert.deepEqual(appContribution.appConfig?.modelRequirements, {
    primary: true,
    speechToText: true,
  });
  assert.match(templates[0].dslContent!, /speechToText:\s+enabled: true/);
  // Deployment-specific provider IDs must be selected by the host, never embedded in the template.
  assert.doesNotMatch(templates[0].dslContent!, /copilotId:/);
});
