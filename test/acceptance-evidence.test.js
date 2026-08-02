import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function artifact(name) {
  return JSON.parse(await readFile(new URL(`../deliverables/test/${name}`, import.meta.url), 'utf8'))
}

test('TST-001 evidence separates automated observations from conclusions', async () => {
  const [results, manifest] = await Promise.all([
    artifact('automated-results.json'), artifact('evidence-manifest.json')
  ])
  assert.equal(results.outcome, 'passed')
  assert.equal(results.tests.failed, 0)
  assert.equal(results.coverage.thresholdsMet, true)
  assert.equal(manifest.requirementId, 'REQ-001')
  assert.equal(manifest.observations.every((entry) => entry.source && entry.result), true)
  assert.equal(manifest.conclusions.every((entry) => entry.basedOn.length > 0), true)
  assert.deepEqual(manifest.gitHubPullRequests, [1, 2, 3, 4])
})
