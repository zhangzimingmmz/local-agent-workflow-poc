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
  dashboard() { return this.domain.dashboard() }

  async claim(taskId, actorId) {
    const result = this.domain.claim(taskId, actorId)
    await this.#persist()
    return result
  }

  async start(taskId, actorId) {
    const result = this.domain.start(taskId, actorId)
    await this.#persist()
    return result
  }

  async submit(taskId, actorId, evidence) {
    const result = await this.domain.submit(taskId, actorId, evidence)
    await this.#persist()
    return result
  }

  async review(taskId, actorId, decision, note) {
    const result = this.domain.review(taskId, actorId, decision, note)
    await this.#persist()
    return result
  }

  async integrateByPullRequest(url, sha) {
    const result = this.domain.integrateByPullRequest(url, sha)
    await this.#persist()
    return result
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
