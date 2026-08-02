export function workflowFixture() {
  const users = [
    { id: 'alice', name: 'Alice Product', role: 'designer', token: 'demo-alice' },
    { id: 'bob', name: 'Bob Product', role: 'designer', token: 'demo-bob' },
    { id: 'carol', name: 'Carol Developer', role: 'developer', token: 'demo-carol' },
    { id: 'dave', name: 'Dave Developer', role: 'developer', token: 'demo-dave' },
    { id: 'erin', name: 'Erin Tester', role: 'tester', token: 'demo-erin' },
    { id: 'frank', name: 'Frank Tester', role: 'tester', token: 'demo-frank' }
  ]
  const tasks = [
    {
      id: 'DES-001', requirementId: 'REQ-001', title: 'Design the workflow',
      role: 'designer', reviewerId: 'bob', status: 'ready', ownerId: null,
      dependencyIds: [], projectId: 'agent-workflow', moduleId: 'workflow-core'
    },
    {
      id: 'DEV-001', requirementId: 'REQ-001', title: 'Implement the workflow',
      role: 'developer', reviewerId: 'dave', status: 'blocked', ownerId: null,
      dependencyIds: ['DES-001'], projectId: 'agent-workflow', moduleId: 'workflow-core'
    },
    {
      id: 'TST-001', requirementId: 'REQ-001', title: 'Verify the workflow',
      role: 'tester', reviewerId: 'frank', status: 'blocked', ownerId: null,
      dependencyIds: ['DEV-001'], projectId: 'agent-workflow', moduleId: 'workflow-core'
    }
  ]
  const verifier = {
    async verify(evidence) {
      return { ...evidence, verified: true, verifiedAt: '2026-08-03T00:00:00.000Z' }
    }
  }
  return { users, tasks, verifier }
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
