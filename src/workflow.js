export class WorkflowError extends Error {
  constructor(code, message, cause) {
    super(message, { cause })
    this.name = 'WorkflowError'
    this.code = code
  }
}

function copy(value) {
  return structuredClone(value)
}

export class WorkflowService {
  constructor({ users, tasks, requirements = [], events = [], verifier, clock = () => new Date() }) {
    this.users = new Map(users.map((user) => [user.id, copy(user)]))
    this.tasks = new Map(tasks.map((task) => [task.id, copy(task)]))
    this.verifier = verifier
    this.clock = clock
    this.events = events.map(copy)
    this.requirements = new Map(requirements.map((requirement) => [requirement.id, copy(requirement)]))
    for (const task of this.tasks.values()) {
      if (!this.requirements.has(task.requirementId)) {
        this.requirements.set(task.requirementId, { id: task.requirementId, status: 'in_progress' })
      }
    }
  }

  getTask(taskId) {
    return copy(this.#task(taskId))
  }

  getRequirement(requirementId) {
    const requirement = this.requirements.get(requirementId)
    if (!requirement) throw new WorkflowError('NOT_FOUND', `Requirement ${requirementId} was not found`)
    return copy(requirement)
  }

  listTasks(actorId) {
    const actor = this.#user(actorId)
    return [...this.tasks.values()].filter((task) => task.role === actor.role).map(copy)
  }

  listEvents() {
    return this.events.map(copy)
  }

  exportState() {
    return {
      users: [...this.users.values()].map(copy),
      tasks: [...this.tasks.values()].map(copy),
      requirements: [...this.requirements.values()].map(copy),
      events: this.listEvents()
    }
  }

  claim(taskId, actorId) {
    const task = this.#task(taskId)
    const actor = this.#user(actorId)
    if (task.status === 'claimed' && task.ownerId === actorId) return copy(task)
    if (task.status !== 'ready') throw new WorkflowError('INVALID_STATE', `${taskId} is ${task.status}, not ready`)
    if (task.role !== actor.role) throw new WorkflowError('ROLE_MISMATCH', `${actorId} cannot claim ${task.role} work`)
    task.ownerId = actorId
    this.#transition(task, 'claimed', 'TaskClaimed', actorId)
    return copy(task)
  }

  start(taskId, actorId) {
    const task = this.#ownedTask(taskId, actorId)
    if (task.status === 'in_progress') return copy(task)
    if (task.status !== 'claimed') throw new WorkflowError('INVALID_STATE', `${taskId} is ${task.status}, not claimed`)
    this.#transition(task, 'in_progress', 'TaskStarted', actorId)
    return copy(task)
  }

  async submit(taskId, actorId, evidence) {
    const task = this.#ownedTask(taskId, actorId)
    if (task.status !== 'in_progress') throw new WorkflowError('INVALID_STATE', `${taskId} is ${task.status}, not in progress`)
    if (!Array.isArray(evidence?.artifacts) || evidence.artifacts.length === 0) {
      throw new WorkflowError('INVALID_EVIDENCE', 'At least one repository artifact is required')
    }
    try {
      task.evidence = await this.verifier.verify(evidence)
    } catch (error) {
      throw new WorkflowError('INVALID_EVIDENCE', error.message, error)
    }
    this.#transition(task, 'submitted', 'TaskSubmitted', actorId, { evidence: task.evidence })
    return copy(task)
  }

  review(taskId, actorId, decision, note = '') {
    const task = this.#task(taskId)
    this.#user(actorId)
    if (task.ownerId === actorId) throw new WorkflowError('SELF_REVIEW', 'An owner cannot review their own submission')
    if (task.reviewerId !== actorId) throw new WorkflowError('NOT_REVIEWER', `${actorId} is not the configured reviewer`)
    if (task.status !== 'submitted') throw new WorkflowError('INVALID_STATE', `${taskId} is ${task.status}, not submitted`)
    if (!['accept', 'reject'].includes(decision)) throw new WorkflowError('INVALID_DECISION', `Unknown review decision: ${decision}`)

    if (decision === 'reject') {
      this.#transition(task, 'in_progress', 'TaskRejected', actorId, { note })
      return copy(task)
    }

    this.#transition(task, 'accepted', 'TaskAccepted', actorId, { note })
    this.#unblockDependents(actorId)
    return copy(task)
  }

  integrateByPullRequest(pullRequestUrl, mergeSha) {
    const task = [...this.tasks.values()].find((candidate) => candidate.evidence?.pullRequestUrl === pullRequestUrl)
    if (!task) throw new WorkflowError('NOT_FOUND', `No submission references ${pullRequestUrl}`)
    if (task.status === 'integrated') return copy(task)
    if (task.status !== 'accepted') throw new WorkflowError('INVALID_STATE', `${task.id} is ${task.status}, not accepted`)
    task.mergeSha = mergeSha
    this.#transition(task, 'integrated', 'TaskIntegrated', 'github', { mergeSha })
    this.#refreshRequirement(task.requirementId)
    return copy(task)
  }

  dashboard() {
    const byStatus = {}
    for (const task of this.tasks.values()) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1
    return {
      organization: { id: 'northstar', name: 'Northstar Labs' },
      requirements: [...this.requirements.values()].map(copy),
      tasks: [...this.tasks.values()].map(copy),
      events: this.listEvents(),
      metrics: { events: this.events.length, tasksByStatus: byStatus }
    }
  }

  #task(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) throw new WorkflowError('NOT_FOUND', `Work item ${taskId} was not found`)
    return task
  }

  #user(userId) {
    const user = this.users.get(userId)
    if (!user) throw new WorkflowError('UNAUTHORIZED', 'Unknown account')
    return user
  }

  #ownedTask(taskId, actorId) {
    const task = this.#task(taskId)
    this.#user(actorId)
    if (task.ownerId !== actorId) throw new WorkflowError('NOT_OWNER', `${actorId} does not own ${taskId}`)
    return task
  }

  #transition(task, status, type, actorId, data = {}) {
    const previousStatus = task.status
    task.status = status
    this.events.push({
      id: `evt-${this.events.length + 1}`,
      type,
      actorId,
      taskId: task.id,
      requirementId: task.requirementId,
      previousStatus,
      status,
      occurredAt: this.clock().toISOString(),
      ...copy(data)
    })
  }

  #unblockDependents(actorId) {
    for (const task of this.tasks.values()) {
      if (task.status !== 'blocked') continue
      const satisfied = task.dependencyIds.every((id) => ['accepted', 'integrated'].includes(this.#task(id).status))
      if (satisfied) this.#transition(task, 'ready', 'TaskUnblocked', actorId)
    }
  }

  #refreshRequirement(requirementId) {
    const tasks = [...this.tasks.values()].filter((task) => task.requirementId === requirementId)
    if (tasks.length > 0 && tasks.every((task) => task.status === 'integrated')) {
      this.requirements.get(requirementId).status = 'completed'
    }
  }
}
