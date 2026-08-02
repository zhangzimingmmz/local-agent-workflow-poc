import { WorkflowService } from './workflow.js'

class PersistentWorkflowService {
  constructor(domain, store, version) {
    this.domain = domain
    this.store = store
    this.version = version
    this.commandQueue = Promise.resolve()
  }

  getTask(taskId) { return this.domain.getTask(taskId) }
  getRequirement(requirementId) { return this.domain.getRequirement(requirementId) }
  getStatus(id) { return this.domain.getStatus(id) }
  getAccount(actorId) { return this.domain.getAccount(actorId) }
  getRoleAssignment(taskId, actorId) { return this.domain.getRoleAssignment(taskId, actorId) }
  listTasks(actorId) { return this.domain.listTasks(actorId) }
  listEvents() { return this.domain.listEvents() }
  listAgentRuns() { return this.domain.listAgentRuns() }
  getAgentRunForTask(taskId, actorId) { return this.domain.getAgentRunForTask(taskId, actorId) }
  dashboard() { return this.domain.dashboard() }

  async claim(taskId, actorId, options) {
    return this.#enqueue(() => this.domain.claim(taskId, actorId, options))
  }

  async start(taskId, actorId, agentRun, options) {
    return this.#enqueue(() => this.domain.start(taskId, actorId, agentRun, options))
  }

  async createSubtask(parentTaskId, actorId, input, options) {
    return this.#enqueue(() => this.domain.createSubtask(parentTaskId, actorId, input, options))
  }

  async rejectAction(command, taskId, actorId, error, options) {
    return this.#enqueue(() => this.domain.rejectAction(command, taskId, actorId, error, options))
  }

  async submit(taskId, actorId, evidence, options) {
    return this.#enqueue(() => this.domain.submit(taskId, actorId, evidence, options))
  }

  async review(taskId, actorId, decision, note, options) {
    return this.#enqueue(() => this.domain.review(taskId, actorId, decision, note, options))
  }

  async integrateByPullRequest(url, sha, options) {
    return this.#enqueue(() => this.domain.integrateByPullRequest(url, sha, options))
  }

  #enqueue(action) {
    const result = this.commandQueue.then(() => this.#execute(action))
    this.commandQueue = result.then(() => undefined, () => undefined)
    return result
  }

  async #execute(action) {
    const revision = this.domain.mutationRevision()
    try {
      const result = await action()
      if (this.domain.mutationRevision() !== revision) await this.#persist()
      return result
    } catch (error) {
      if (this.domain.mutationRevision() !== revision) await this.#persist()
      throw error
    }
  }

  async #persist() {
    this.version = await this.store.save(this.domain.exportState(), this.version)
  }
}

export async function loadWorkflow({ store, seed, verifier }) {
  const stored = await store.load()
  if (stored) {
    const seedTasks = new Map(seed.tasks.map((task) => [task.id, task]))
    const seedUsers = new Map(seed.users.map((user) => [user.id, user]))
    return new PersistentWorkflowService(new WorkflowService({
      ...stored.snapshot,
      organization: stored.snapshot.organization ?? seed.organization,
      team: stored.snapshot.team ?? seed.team,
      repository: stored.snapshot.repository ?? seed.repository,
      users: stored.snapshot.users.map((user) => ({
        workstationId: seedUsers.get(user.id)?.workstationId,
        ...user
      })),
      tasks: stored.snapshot.tasks.map((task) => ({
        organizationId: seed.organization.id,
        teamId: seed.team.id,
        createdAt: seedTasks.get(task.id)?.createdAt,
        initialStatus: seedTasks.get(task.id)?.initialStatus,
        ...task,
        parentId: task.parentId === task.requirementId ? null : task.parentId
      })),
      verifier
    }), store, stored.version)
  }
  const domain = new WorkflowService({ ...seed, verifier })
  const version = await store.save(domain.exportState(), 0)
  return new PersistentWorkflowService(domain, store, version)
}
