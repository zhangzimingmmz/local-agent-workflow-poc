import { createHash } from 'node:crypto'

const scopeOrder = ['organization', 'team', 'project', 'module', 'work_item']
const contextKeys = {
  organization: 'organizationId',
  team: 'teamId',
  project: 'projectId',
  module: 'moduleId',
  work_item: 'workItemId'
}

export class PolicyError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PolicyError'
    this.code = code
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

function applies(policy, context) {
  const key = contextKeys[policy.scope]
  return context[key] === policy.scopeId && (policy.role === '*' || policy.role === context.role)
}

export function resolveEffectiveGuidance(policies, context) {
  const selected = policies.filter((policy) => applies(policy, context)).sort((left, right) => {
    const scope = scopeOrder.indexOf(left.scope) - scopeOrder.indexOf(right.scope)
    if (scope !== 0) return scope
    if (left.role === right.role) return left.id.localeCompare(right.id)
    return left.role === '*' ? -1 : 1
  })
  const rules = {}
  const mandatory = new Map()
  const sources = []

  for (const policy of selected) {
    for (const [name, value] of Object.entries(policy.rules ?? {})) {
      if (mandatory.has(name) && JSON.stringify(rules[name]) !== JSON.stringify(value)) {
        throw new PolicyError('MANDATORY_OVERRIDE', `${policy.id} cannot override mandatory rule ${name} from ${mandatory.get(name)}`)
      }
      rules[name] = structuredClone(value)
    }
    for (const name of policy.mandatory ?? []) mandatory.set(name, policy.id)
    sources.push({ id: policy.id, version: policy.version, scope: policy.scope, role: policy.role })
  }

  const snapshotHash = createHash('sha256').update(JSON.stringify(stable({ rules, sources }))).digest('hex')
  return { rules, sources, snapshotHash }
}
