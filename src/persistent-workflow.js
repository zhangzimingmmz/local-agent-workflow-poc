import { WorkflowService } from './workflow.js'

class PersistentWorkflowService {
  constructor(domain, store, version) {
    this.domain = domain
    this.store = store
    this.version = version
  }

  getTask(taskId) { return this.domain.getTask(taskId) }
  getRequirement(requirementId) { return this.domain.getRequirement(requirementId) }
  listTasks(actorId) { return this.domain.listTasks(actorId) }
  listEvents() { return this.domain.listEvents() }
  listAgentRuns() { return this.domain.listAgentRuns() }
  getAgentRunForTask(taskId, actorId) { return this.domain.getAgentRunForTask(taskId, actorId) }
  dashboard() { return this.domain.dashboard() }

  async claim(taskId, actorId, options) {
    return this.#execute(() => this.domain.claim(taskId, actorId, options))
  }

  async start(taskId, actorId, agentRun, options) {
    return this.#execute(() => this.domain.start(taskId, actorId, agentRun, options))
  }

  async submit(taskId, actorId, evidence, options) {
    return this.#execute(() => this.domain.submit(taskId, actorId, evidence, options))
  }

  async review(taskId, actorId, decision, note, options) {
    return this.#execute(() => this.domain.review(taskId, actorId, decision, note, options))
  }

  async integrateByPullRequest(url, sha, options) {
    return this.#execute(() => this.domain.integrateByPullRequest(url, sha, options))
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
    return new PersistentWorkflowService(new WorkflowService({ ...stored.snapshot, verifier }), store, stored.version)
  }
  const domain = new WorkflowService({ ...seed, verifier })
  const version = await store.save(domain.exportState(), 0)
  return new PersistentWorkflowService(domain, store, version)
}
