import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveEffectiveGuidance } from '../src/policy.js'
import { createSeed } from '../src/seed.js'

test('seed creates six virtual accounts, six dependency-linked work items and five policy scopes', () => {
  const seed = createSeed({
    alice: 'token-a', bob: 'token-b', carol: 'token-c',
    dave: 'token-d', erin: 'token-e', frank: 'token-f'
  }, { createdAt: '2026-08-03T00:00:00.000Z' })
  assert.equal(seed.users.length, 6)
  assert.equal(seed.users.every((user) => !('role' in user)), true)
  assert.deepEqual(
    seed.users.flatMap((user) => user.roleAssignments.map((assignment) => assignment.role)).sort(),
    ['designer', 'designer', 'developer', 'developer', 'tester', 'tester'].sort()
  )
  assert.equal(seed.users.every((user) => user.roleAssignments.every((assignment) => (
    assignment.accountId === user.id
    && assignment.scope === 'project'
    && assignment.scopeId === 'agent-workflow'
  ))), true)
  assert.equal(seed.users.every((user) => !('token' in user) && /^[a-f0-9]{64}$/.test(user.tokenHash)), true)
  assert.equal(seed.tasks.length, 6)
  assert.equal(seed.tasks.every((task) => task.parentId === null), true)
  assert.deepEqual(seed.organization, { id: 'northstar', name: 'Northstar Labs' })
  assert.deepEqual(seed.team, { id: 'delivery', name: 'Product Delivery' })
  assert.equal(seed.tasks.every((task) => task.organizationId === seed.organization.id && task.teamId === seed.team.id), true)
  assert.equal(seed.tasks.every((task) => task.createdAt === '2026-08-03T00:00:00.000Z'), true)
  assert.equal(seed.tasks.every((task) => task.initialStatus === task.status), true)
  assert.deepEqual(seed.tasks.find((task) => task.id === 'DEV-001').dependencyIds, ['DES-001', 'DES-002'])
  assert.deepEqual(new Set(seed.policies.map((policy) => policy.scope)), new Set(['organization', 'team', 'project', 'module', 'work_item']))
})

test('every seeded work item resolves guidance from all five scope levels', () => {
  const seed = createSeed({
    alice: 'token-a', bob: 'token-b', carol: 'token-c',
    dave: 'token-d', erin: 'token-e', frank: 'token-f'
  })

  for (const task of seed.tasks) {
    const guidance = resolveEffectiveGuidance(seed.policies, {
      organizationId: 'northstar', teamId: 'delivery', projectId: task.projectId,
      moduleId: task.moduleId, workItemId: task.id, role: task.role
    })
    assert.deepEqual([...new Set(guidance.sources.map((source) => source.scope))], [
      'organization', 'team', 'project', 'module', 'work_item'
    ])
  }
})

test('seed uses the configured Project repository instead of a product constant', () => {
  const seed = createSeed({
    alice: 'token-a', bob: 'token-b', carol: 'token-c',
    dave: 'token-d', erin: 'token-e', frank: 'token-f'
  }, { repository: { name: 'acme/widgets', baseBranch: 'release' } })

  assert.deepEqual(seed.repository, { name: 'acme/widgets', baseBranch: 'release' })
})
