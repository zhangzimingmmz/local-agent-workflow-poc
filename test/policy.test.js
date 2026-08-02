import assert from 'node:assert/strict'
import test from 'node:test'

import { PolicyError, resolveEffectiveGuidance } from '../src/policy.js'

test('guidance merges five scopes and role-specific rules in deterministic order', () => {
  const policies = [
    { id: 'company', scope: 'organization', scopeId: 'northstar', role: '*', version: 1, rules: { branchPrefix: 'work/', minCoverage: 70 } },
    { id: 'team-dev', scope: 'team', scopeId: 'delivery', role: 'developer', version: 2, rules: { requiresTests: true } },
    { id: 'project-dev', scope: 'project', scopeId: 'agent-workflow', role: 'developer', version: 4, rules: { minCoverage: 80 } },
    { id: 'module', scope: 'module', scopeId: 'workflow-core', role: '*', version: 1, rules: { requiredReviewers: 1 } },
    { id: 'task-dev', scope: 'work_item', scopeId: 'DEV-001', role: 'developer', version: 3, rules: { minCoverage: 90 } },
    { id: 'task-test', scope: 'work_item', scopeId: 'DEV-001', role: 'tester', version: 9, rules: { minCoverage: 100 } }
  ]

  const result = resolveEffectiveGuidance(policies, {
    organizationId: 'northstar', teamId: 'delivery', projectId: 'agent-workflow',
    moduleId: 'workflow-core', workItemId: 'DEV-001', role: 'developer'
  })

  assert.deepEqual(result.rules, {
    branchPrefix: 'work/', minCoverage: 90, requiresTests: true, requiredReviewers: 1
  })
  assert.deepEqual(result.sources.map(({ id, version }) => ({ id, version })), [
    { id: 'company', version: 1 }, { id: 'team-dev', version: 2 },
    { id: 'project-dev', version: 4 }, { id: 'module', version: 1 },
    { id: 'task-dev', version: 3 }
  ])
  assert.match(result.snapshotHash, /^[a-f0-9]{64}$/)
})

test('a mandatory broader rule cannot be weakened by a narrower scope', () => {
  const policies = [
    { id: 'org', scope: 'organization', scopeId: 'northstar', role: '*', version: 1, mandatory: ['publicEvidence'], rules: { publicEvidence: true } },
    { id: 'task', scope: 'work_item', scopeId: 'DEV-001', role: 'developer', version: 1, rules: { publicEvidence: false } }
  ]
  assert.throws(() => resolveEffectiveGuidance(policies, {
    organizationId: 'northstar', teamId: 'delivery', projectId: 'agent-workflow',
    moduleId: 'workflow-core', workItemId: 'DEV-001', role: 'developer'
  }), (error) => error instanceof PolicyError && error.code === 'MANDATORY_OVERRIDE')
})
