#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

function configuration() {
  const url = process.env.TEAM_WORKFLOW_URL?.replace(/\/$/, '')
  const token = process.env.TEAM_WORKFLOW_TOKEN
  if (!url || !token) throw new Error('TEAM_WORKFLOW_URL and TEAM_WORKFLOW_TOKEN are required')
  return { url, token, baseBranch: process.env.TEAM_WORKFLOW_BASE_BRANCH || 'main' }
}

function operationKey(command, id, body = {}) {
  const operation = createHash('sha256').update(JSON.stringify({ command, id, body })).digest('hex').slice(0, 24)
  return `workflow:${command}:${id}:${operation}`
}

async function request(path, { method = 'GET', body, key } = {}) {
  const { url, token } = configuration()
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(key ? { 'idempotency-key': key } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(`${data.error || 'HTTP_ERROR'}: ${data.message || response.statusText}`)
  return data
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function repository() {
  const remote = git('config', '--get', 'remote.origin.url')
  const match = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)
  if (!match) throw new Error('origin must reference a GitHub repository')
  return match[1]
}

function values(args, name) {
  const result = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`${name} requires a value`)
    result.push(args[index + 1])
    index += 1
  }
  return result
}

function one(args, name) {
  const result = values(args, name)
  if (result.length !== 1) throw new Error(`${name} must be provided exactly once`)
  return result[0]
}

function optional(args, name) {
  const result = values(args, name)
  if (result.length > 1) throw new Error(`${name} may be provided at most once`)
  return result[0]
}

function artifacts(args) {
  return values(args, '--artifact').map((entry) => {
    const separator = entry.indexOf(':')
    if (separator < 1 || separator === entry.length - 1) throw new Error(`Invalid artifact: ${entry}`)
    return { kind: entry.slice(0, separator), path: entry.slice(separator + 1) }
  })
}

function usage() {
  return 'workflow whoami|list|show|status|policy|claim|split|start|submit|review [work-item-id]'
}

async function main([command, id, ...args]) {
  if (!command || ['help', '--help', '-h'].includes(command)) return { usage: usage() }
  if (command === 'whoami') return request('/api/v1/me')
  if (command === 'list') return request('/api/v1/tasks')
  if (!id) throw new Error(`${command} requires a Requirement or Work Item ID`)
  const encoded = encodeURIComponent(id)
  if (command === 'show') return request(`/api/v1/tasks/${encoded}`)
  if (command === 'status') return request(`/api/v1/status/${encoded}`)
  if (command === 'policy') return request(`/api/v1/tasks/${encoded}/guidance`)
  if (command === 'claim') {
    const body = {}
    return request(`/api/v1/tasks/${encoded}/claim`, { method: 'POST', body, key: operationKey(command, id, body) })
  }
  if (command === 'split') {
    const body = {
      id: one(args, '--id'), title: one(args, '--title'), role: one(args, '--role'),
      reviewerId: one(args, '--reviewer'), assigneeId: optional(args, '--assignee'),
      dependencyIds: values(args, '--depends-on')
    }
    return request(`/api/v1/tasks/${encoded}/subtasks`, { method: 'POST', body, key: operationKey(command, id, body) })
  }
  if (command === 'start') {
    const body = { agentType: 'codex', repository: repository(), branch: git('branch', '--show-current') }
    return request(`/api/v1/tasks/${encoded}/start`, { method: 'POST', body, key: operationKey(command, id, body) })
  }
  if (command === 'submit') {
    const declared = artifacts(args)
    if (declared.length === 0) throw new Error('submit requires --artifact <kind:path>')
    const { baseBranch } = configuration()
    const body = {
      repository: repository(), baseBranch, branch: git('branch', '--show-current'),
      commitSha: git('rev-parse', 'HEAD'), pullRequestUrl: one(args, '--pr'), artifacts: declared
    }
    return request(`/api/v1/tasks/${encoded}/submit`, { method: 'POST', body, key: operationKey(command, id, body) })
  }
  if (command === 'review') {
    const accept = args.includes('--accept')
    const reject = args.includes('--reject')
    if (accept === reject) throw new Error('review requires exactly one of --accept or --reject')
    const body = { decision: accept ? 'accept' : 'reject', note: one(args, '--note') }
    return request(`/api/v1/tasks/${encoded}/review`, { method: 'POST', body, key: operationKey(command, id, body) })
  }
  throw new Error(`Unknown command: ${command}`)
}

main(process.argv.slice(2)).then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
