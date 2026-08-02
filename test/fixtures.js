import { createHash } from 'node:crypto'

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function workflowFixture() {
  const organization = { id: 'northstar', name: 'Northstar Labs' }
  const team = { id: 'delivery', name: 'Product Delivery' }
  const users = [
    { id: 'alice', name: 'Alice Product', role: 'designer', tokenHash: tokenHash('demo-alice') },
    { id: 'bob', name: 'Bob Product', role: 'designer', tokenHash: tokenHash('demo-bob') },
    { id: 'carol', name: 'Carol Developer', role: 'developer', tokenHash: tokenHash('demo-carol') },
    { id: 'dave', name: 'Dave Developer', role: 'developer', tokenHash: tokenHash('demo-dave') },
    { id: 'erin', name: 'Erin Tester', role: 'tester', tokenHash: tokenHash('demo-erin') },
    { id: 'frank', name: 'Frank Tester', role: 'tester', tokenHash: tokenHash('demo-frank') }
  ]
  const tasks = [
    {
      id: 'DES-001', requirementId: 'REQ-001', title: 'Design the workflow',
      organizationId: organization.id, teamId: team.id,
      role: 'designer', reviewerId: 'bob', status: 'ready', ownerId: null,
      dependencyIds: [], projectId: 'agent-workflow', moduleId: 'workflow-core'
    },
    {
      id: 'DEV-001', requirementId: 'REQ-001', title: 'Implement the workflow',
      organizationId: organization.id, teamId: team.id,
      role: 'developer', reviewerId: 'dave', status: 'blocked', ownerId: null,
      dependencyIds: ['DES-001'], projectId: 'agent-workflow', moduleId: 'workflow-core'
    },
    {
      id: 'TST-001', requirementId: 'REQ-001', title: 'Verify the workflow',
      organizationId: organization.id, teamId: team.id,
      role: 'tester', reviewerId: 'frank', status: 'blocked', ownerId: null,
      dependencyIds: ['DEV-001'], projectId: 'agent-workflow', moduleId: 'workflow-core'
    }
  ]
  const verifier = {
    async verify(evidence) {
      return { ...evidence, verified: true, verifiedAt: '2026-08-03T00:00:00.000Z' }
    }
  }
  return { organization, team, users, tasks, verifier }
}

export function validEvidence(overrides = {}) {
  return {
    repository: 'zhangzimingmmz/local-agent-workflow-poc',
    branch: 'work/DES-001-design',
    commitSha: 'a'.repeat(40),
    pullRequestUrl: 'https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/1',
    artifacts: [{ kind: 'design', path: 'docs/design.md' }],
    ...overrides
  }
}
