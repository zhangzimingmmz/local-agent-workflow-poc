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

function signature(value) {
  return JSON.stringify(value)
}

export class WorkflowService {
  constructor({
    users, tasks, requirements = [], events = [], agentRuns = [], commandRecords = [], verifier,
    clock = () => new Date()
  }) {
    this.users = new Map(users.map((user) => [user.id, copy(user)]))
    this.tasks = new Map(tasks.map((task) => [task.id, copy(task)]))
    this.verifier = verifier
    this.clock = clock
    this.events = events.map(copy)
    this.agentRuns = agentRuns.map(copy)
    this.commandRecords = new Map(commandRecords.map((record) => [record.idempotencyKey, copy(record)]))
    this.requirements = new Map(requirements.map((requirement) => [requirement.id, copy(requirement)]))
    this.revision = 0
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

  listAgentRuns() {
    return this.agentRuns.map(copy)
  }

  getAgentRunForTask(taskId, actorId) {
    const run = this.agentRuns.findLast((candidate) => candidate.taskId === taskId && candidate.actorId === actorId)
    return run ? copy(run) : null
  }

  mutationRevision() {
    return this.revision
  }

  exportState() {
    return {
      users: [...this.users.values()].map(copy),
      tasks: [...this.tasks.values()].map(copy),
      requirements: [...this.requirements.values()].map(copy),
      events: this.listEvents(),
      agentRuns: this.listAgentRuns(),
      commandRecords: [...this.commandRecords.values()].map(copy)
    }
  }

  claim(taskId, actorId, options = {}) {
    return this.#runCommand('claim', taskId, actorId, {}, options, () => {
      const task = this.#task(taskId)
      const actor = this.#user(actorId)
      if (task.status === 'claimed' && task.ownerId === actorId) return copy(task)
      if (task.status !== 'ready') throw new WorkflowError('INVALID_STATE', `${taskId} is ${task.status}, not ready`)
      if (task.role !== actor.role) throw new WorkflowError('ROLE_MISMATCH', `${actorId} cannot claim ${task.role} work`)
      task.ownerId = actorId
      this.#transition(task, 'claimed', 'TaskClaimed', actorId, {}, options.idempotencyKey)
      return copy(task)
    })
  }

  start(taskId, actorId, agentRun = {}, options = {}) {
    return this.#runCommand('start', taskId, actorId, agentRun, options, () => {
      const task = this.#ownedTask(taskId, actorId)
      if (task.status === 'in_progress') return copy(task)
      if (task.status !== 'claimed') throw new WorkflowError('INVALID_STATE', `${taskId} is ${task.status}, not claimed`)
      const run = {
        id: `run-${this.agentRuns.length + 1}`,
        taskId,
        actorId,
        agentType: agentRun.agentType ?? 'codex',
        repository: agentRun.repository ?? null,
        branch: agentRun.branch ?? null,
        guidanceSnapshot: copy(agentRun.guidanceSnapshot ?? null),
        startedAt: this.clock().toISOString()
      }
      this.agentRuns.push(run)
      this.revision += 1
      this.#transition(task, 'in_progress', 'TaskStarted', actorId, { agentRunId: run.id }, options.idempotencyKey)
      return copy(task)
    })
  }

  async submit(taskId, actorId, evidence, options = {}) {
    return this.#runCommandAsync('submit', taskId, actorId, evidence, options, async () => {
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
      const run = this.getAgentRunForTask(taskId, actorId)
      this.#transition(task, 'submitted', 'TaskSubmitted', actorId, {
        evidence: task.evidence,
        agentRunId: run?.id,
        guidanceSnapshot: run?.guidanceSnapshot
      }, options.idempotencyKey)
      return copy(task)
    })
  }

  review(taskId, actorId, decision, note = '', options = {}) {
    return this.#runCommand('review', taskId, actorId, { decision, note }, options, () => {
      const task = this.#task(taskId)
      this.#user(actorId)
      if (task.ownerId === actorId) throw new WorkflowError('SELF_REVIEW', 'An owner cannot review their own submission')
      if (task.reviewerId !== actorId) throw new WorkflowError('NOT_REVIEWER', `${actorId} is not the configured reviewer`)
      if (task.status !== 'submitted') throw new WorkflowError('INVALID_STATE', `${taskId} is ${task.status}, not submitted`)
      if (!['accept', 'reject'].includes(decision)) throw new WorkflowError('INVALID_DECISION', `Unknown review decision: ${decision}`)

      if (decision === 'reject') {
        this.#transition(task, 'in_progress', 'TaskRejected', actorId, { note }, options.idempotencyKey)
        return copy(task)
      }

      this.#transition(task, 'accepted', 'TaskAccepted', actorId, { note }, options.idempotencyKey)
      this.#unblockDependents(actorId, options.idempotencyKey)
      return copy(task)
    })
  }

  integrateByPullRequest(pullRequestUrl, mergeSha, options = {}) {
    const task = [...this.tasks.values()].find((candidate) => candidate.evidence?.pullRequestUrl === pullRequestUrl)
    if (!task) throw new WorkflowError('NOT_FOUND', `No submission references ${pullRequestUrl}`)
    return this.#runCommand('integrate', task.id, 'github', { pullRequestUrl, mergeSha }, options, () => {
      if (task.status === 'integrated') return copy(task)
      if (task.status !== 'accepted') throw new WorkflowError('INVALID_STATE', `${task.id} is ${task.status}, not accepted`)
      task.mergeSha = mergeSha
      this.#transition(task, 'integrated', 'TaskIntegrated', 'github', { mergeSha }, options.idempotencyKey)
      this.#refreshRequirement(task.requirementId, options.idempotencyKey)
      return copy(task)
    })
  }

  dashboard() {
    const byStatus = {}
    for (const task of this.tasks.values()) byStatus[task.status] = (byStatus[task.status] ?? 0) + 1
    return {
      organization: { id: 'northstar', name: 'Northstar Labs' },
      requirements: [...this.requirements.values()].map(copy),
      tasks: [...this.tasks.values()].map(copy),
      agentRuns: this.listAgentRuns(),
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

  #runCommand(command, taskId, actorId, payload, options, action) {
    const context = this.#commandContext(command, taskId, actorId, payload, options)
    if (context.replay) {
      if (context.error) throw context.error
      return context.result
    }
    try {
      const result = action()
      this.#recordCommand(context, 'succeeded', result)
      return result
    } catch (error) {
      this.#recordRejected(context, error)
      throw error
    }
  }

  async #runCommandAsync(command, taskId, actorId, payload, options, action) {
    const context = this.#commandContext(command, taskId, actorId, payload, options)
    if (context.replay) {
      if (context.error) throw context.error
      return context.result
    }
    try {
      const result = await action()
      this.#recordCommand(context, 'succeeded', result)
      return result
    } catch (error) {
      this.#recordRejected(context, error)
      throw error
    }
  }

  #commandContext(command, taskId, actorId, payload, options) {
    const idempotencyKey = options?.idempotencyKey
    if (!idempotencyKey) return { command, taskId, actorId, idempotencyKey: null }
    const commandSignature = signature({ command, taskId, actorId, payload })
    const previous = this.commandRecords.get(idempotencyKey)
    if (!previous) return { command, taskId, actorId, idempotencyKey, commandSignature }
    if (previous.signature !== commandSignature) {
      throw new WorkflowError('IDEMPOTENCY_CONFLICT', `Idempotency key ${idempotencyKey} was already used for another command`)
    }
    if (previous.outcome === 'rejected') {
      return {
        replay: true,
        error: new WorkflowError(previous.error.code, previous.error.message),
        command, taskId, actorId, idempotencyKey, commandSignature
      }
    }
    return { replay: true, result: copy(previous.result), command, taskId, actorId, idempotencyKey, commandSignature }
  }

  #recordCommand(context, outcome, result, error) {
    if (!context.idempotencyKey) return
    this.commandRecords.set(context.idempotencyKey, {
      idempotencyKey: context.idempotencyKey,
      signature: context.commandSignature,
      outcome,
      ...(result === undefined ? {} : { result: copy(result) }),
      ...(error ? { error: copy(error) } : {})
    })
    this.revision += 1
  }

  #recordRejected(context, error) {
    if (!context.idempotencyKey || !(error instanceof WorkflowError)) return
    const task = this.tasks.get(context.taskId)
    this.events.push({
      id: `evt-${this.events.length + 1}`,
      correlationId: context.idempotencyKey,
      type: 'ActionRejected',
      command: context.command,
      actorId: context.actorId,
      taskId: context.taskId,
      requirementId: task?.requirementId,
      previousStatus: task?.status,
      status: task?.status,
      outcome: 'rejected',
      reasonCode: error.code,
      reason: error.message,
      occurredAt: this.clock().toISOString()
    })
    this.revision += 1
    this.#recordCommand(context, 'rejected', undefined, { code: error.code, message: error.message })
  }

  #transition(task, status, type, actorId, data = {}, correlationId) {
    const previousStatus = task.status
    task.status = status
    this.events.push({
      id: `evt-${this.events.length + 1}`,
      ...(correlationId ? { correlationId } : {}),
      type,
      actorId,
      taskId: task.id,
      requirementId: task.requirementId,
      previousStatus,
      status,
      outcome: 'succeeded',
      occurredAt: this.clock().toISOString(),
      ...copy(data)
    })
    this.revision += 1
  }

  #unblockDependents(actorId, correlationId) {
    for (const task of this.tasks.values()) {
      if (task.status !== 'blocked') continue
      const satisfied = task.dependencyIds.every((id) => ['accepted', 'integrated'].includes(this.#task(id).status))
      if (satisfied) this.#transition(task, 'ready', 'TaskUnblocked', actorId, {}, correlationId)
    }
  }

  #refreshRequirement(requirementId, correlationId) {
    const tasks = [...this.tasks.values()].filter((task) => task.requirementId === requirementId)
    const requirement = this.requirements.get(requirementId)
    if (tasks.length > 0 && tasks.every((task) => task.status === 'integrated') && requirement.status !== 'completed') {
      const previousStatus = requirement.status
      requirement.status = 'completed'
      this.events.push({
        id: `evt-${this.events.length + 1}`,
        ...(correlationId ? { correlationId } : {}),
        type: 'RequirementCompleted', actorId: 'github', requirementId,
        previousStatus, status: 'completed', outcome: 'succeeded', occurredAt: this.clock().toISOString()
      })
      this.revision += 1
    }
  }
}
