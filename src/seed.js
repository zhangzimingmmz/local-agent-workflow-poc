import { createHash } from 'node:crypto'

function account(id, name, role, tokens) {
  const token = tokens[id]
  if (!token) throw new Error(`Missing demo token for ${id}`)
  return {
    id,
    name,
    roleAssignments: [{
      id: `ra:${id}:${role}:project:agent-workflow`,
      accountId: id,
      role,
      scope: 'project',
      scopeId: 'agent-workflow'
    }],
    tokenHash: createHash('sha256').update(token).digest('hex')
  }
}

export function createSeed(tokens, {
  repository = { name: 'zhangzimingmmz/local-agent-workflow-poc', baseBranch: 'main' },
  createdAt = new Date().toISOString()
} = {}) {
  const organization = { id: 'northstar', name: 'Northstar Labs' }
  const team = { id: 'delivery', name: 'Product Delivery' }
  const users = [
    account('alice', 'Alice Product', 'designer', tokens),
    account('bob', 'Bob Product', 'designer', tokens),
    account('carol', 'Carol Developer', 'developer', tokens),
    account('dave', 'Dave Developer', 'developer', tokens),
    account('erin', 'Erin Tester', 'tester', tokens),
    account('frank', 'Frank Tester', 'tester', tokens)
  ]
  const common = {
    organizationId: organization.id, teamId: team.id,
    requirementId: 'REQ-001', parentId: null, projectId: 'agent-workflow',
    moduleId: 'workflow-core', ownerId: null, createdAt
  }
  const tasks = [
    { ...common, id: 'DES-001', title: 'Problem and solution design', role: 'designer', reviewerId: 'bob', status: 'ready', initialStatus: 'ready', dependencyIds: [] },
    { ...common, id: 'DES-002', title: 'Executable acceptance criteria', role: 'designer', reviewerId: 'alice', status: 'ready', initialStatus: 'ready', dependencyIds: [] },
    { ...common, id: 'DEV-001', title: 'Central workflow capability', role: 'developer', reviewerId: 'dave', status: 'blocked', initialStatus: 'blocked', dependencyIds: ['DES-001', 'DES-002'] },
    { ...common, id: 'DEV-002', title: 'Codex Skill and CLI', role: 'developer', reviewerId: 'carol', status: 'blocked', initialStatus: 'blocked', dependencyIds: ['DES-001', 'DES-002'] },
    { ...common, id: 'TST-001', title: 'End-to-end workflow verification', role: 'tester', reviewerId: 'frank', status: 'blocked', initialStatus: 'blocked', dependencyIds: ['DEV-001', 'DEV-002'] },
    { ...common, id: 'TST-002', title: 'Independent acceptance report', role: 'tester', reviewerId: 'erin', status: 'blocked', initialStatus: 'blocked', dependencyIds: ['TST-001'] }
  ]
  const policies = [
    { id: 'org-common', scope: 'organization', scopeId: 'northstar', role: '*', version: 1, mandatory: ['publicEvidence'], rules: { publicEvidence: true } },
    { id: 'team-common', scope: 'team', scopeId: 'delivery', role: '*', version: 1, rules: { branchPrefix: 'work/' } },
    { id: 'project-design', scope: 'project', scopeId: 'agent-workflow', role: 'designer', version: 1, rules: { requiredSections: ['problem', 'solution', 'risks', 'acceptance'] } },
    { id: 'project-dev', scope: 'project', scopeId: 'agent-workflow', role: 'developer', version: 1, rules: { requiresTests: true, minCoverage: 80 } },
    { id: 'project-test', scope: 'project', scopeId: 'agent-workflow', role: 'tester', version: 1, rules: { separateEvidenceFromConclusion: true } },
    { id: 'module-common', scope: 'module', scopeId: 'workflow-core', role: '*', version: 1, rules: { artifactRoot: 'deliverables/' } },
    { id: 'module-events', scope: 'module', scopeId: 'workflow-core', role: 'developer', version: 1, rules: { appendOnlyEvents: true } },
    { id: 'task-des-001', scope: 'work_item', scopeId: 'DES-001', role: 'designer', version: 1, rules: { requiredArtifacts: ['design'] } },
    { id: 'task-des-002', scope: 'work_item', scopeId: 'DES-002', role: 'designer', version: 1, rules: { requiredArtifacts: ['acceptance-scenarios'] } },
    { id: 'task-dev-001', scope: 'work_item', scopeId: 'DEV-001', role: 'developer', version: 1, rules: { requiredArtifacts: ['source', 'migration', 'tests'] } },
    { id: 'task-dev-002', scope: 'work_item', scopeId: 'DEV-002', role: 'developer', version: 1, rules: { requiredArtifacts: ['skill', 'cli'] } },
    { id: 'task-tst-001', scope: 'work_item', scopeId: 'TST-001', role: 'tester', version: 1, rules: { requiredArtifacts: ['automated-results', 'evidence-manifest'] } },
    { id: 'task-tst-002', scope: 'work_item', scopeId: 'TST-002', role: 'tester', version: 1, rules: { requiredArtifacts: ['acceptance-report'] } }
  ]
  return {
    organization,
    team,
    users,
    requirements: [{ id: 'REQ-001', title: 'Observable local-agent delivery workflow', status: 'in_progress' }],
    tasks,
    policies,
    repository
  }
}
