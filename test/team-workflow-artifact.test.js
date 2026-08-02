import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import test from 'node:test'

const skillUrl = new URL('../deliverables/dev-002/team-workflow/SKILL.md', import.meta.url)
const cliUrl = new URL('../deliverables/dev-002/team-workflow/workflow.mjs', import.meta.url)
const projectSkillUrl = new URL('../.agents/skills/team-workflow/SKILL.md', import.meta.url)
const projectCliUrl = new URL('../.agents/skills/team-workflow/scripts/workflow.mjs', import.meta.url)
const runFile = promisify(execFile)

test('DEV-002 packages Codex Skill instructions and a deterministic CLI', async () => {
  const [skill, cli] = await Promise.all([readFile(skillUrl, 'utf8'), readFile(cliUrl, 'utf8')])
  assert.match(skill, /Organization.*Team.*Project.*Module.*Work Item/s)
  assert.match(skill, /claim.*policy.*start.*submit.*review/s)
  assert.match(skill, /TEAM_WORKFLOW_WORKSTATION_ID/)
  assert.match(skill, /TEAM_WORKFLOW_SESSION_ID/)
  assert.match(cli, /idempotency-key/)
  assert.match(cli, /whoami/)
  assert.match(cli, /submit/)
  assert.doesNotMatch(cli, /update\((?:config\.)?token\)/)
  execFileSync(process.execPath, ['--check', cliUrl.pathname])
})

test('a fresh Codex checkout discovers the executable team-workflow Skill', async () => {
  const [skill, cli] = await Promise.all([
    readFile(projectSkillUrl, 'utf8'),
    readFile(projectCliUrl, 'utf8')
  ])
  assert.match(skill, /disable-model-invocation: true/)
  assert.match(skill, /scripts\/workflow\.mjs/)
  assert.match(skill, /explicit approval immediately before pushing/)
  assert.match(cli, /TEAM_WORKFLOW_URL/)
  assert.match(cli, /TEAM_WORKFLOW_WORKSTATION_ID/)
  assert.match(cli, /TEAM_WORKFLOW_SESSION_ID/)
  assert.match(cli, /idempotency-key/)
  execFileSync(process.execPath, ['--check', projectCliUrl.pathname])
})

test('project CLI status resolves a Requirement through the unified status endpoint', async (t) => {
  let requestedUrl
  let requestedMethod
  let requestedBody
  let requestedIdempotencyKey
  let requestedHeaders
  const server = createServer(async (request, response) => {
    requestedUrl = request.url
    requestedMethod = request.method
    requestedIdempotencyKey = request.headers['idempotency-key']
    requestedHeaders = request.headers
    assert.equal(request.headers.authorization, 'Bearer account-token')
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    requestedBody = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({
      entityType: 'requirement',
      requirement: { id: 'REQ-001', status: 'in_progress' }
    }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const address = server.address()
  const childEnvironment = {
    ...process.env,
    TEAM_WORKFLOW_URL: `http://127.0.0.1:${address.port}`,
    TEAM_WORKFLOW_TOKEN: 'account-token',
    TEAM_WORKFLOW_WORKSTATION_ID: 'workstation-a',
    TEAM_WORKFLOW_SESSION_ID: 'session-cli-one'
  }
  const { stdout } = await runFile(process.execPath, [projectCliUrl.pathname, 'status', 'REQ-001'], {
    env: childEnvironment
  })

  assert.equal(requestedUrl, '/api/v1/status/REQ-001')
  assert.equal(requestedHeaders['x-workflow-agent-type'], 'codex')
  assert.equal(requestedHeaders['x-workflow-workstation-id'], 'workstation-a')
  assert.equal(requestedHeaders['x-workflow-session-id'], 'session-cli-one')
  assert.deepEqual(JSON.parse(stdout), {
    entityType: 'requirement',
    requirement: { id: 'REQ-001', status: 'in_progress' }
  })

  const identity = await runFile(process.execPath, [projectCliUrl.pathname, 'whoami'], { env: childEnvironment })
  assert.equal(requestedUrl, '/api/v1/me')
  assert.equal(JSON.parse(identity.stdout).entityType, 'requirement')

  const help = await runFile(process.execPath, [projectCliUrl.pathname, '--help'], { env: childEnvironment })
  assert.match(help.stdout, /status <requirement-or-work-item-id>/)

  await assert.rejects(
    runFile(process.execPath, [projectCliUrl.pathname, 'status'], { env: childEnvironment }),
    (error) => error.code === 1 && /status requires a Requirement or Work Item ID/.test(error.stderr)
  )

  await runFile(process.execPath, [
    projectCliUrl.pathname, 'split', 'DES-001',
    '--id', 'DES-001-A', '--title', 'Research one option', '--role', 'designer',
    '--reviewer', 'alice', '--assignee', 'bob', '--depends-on', 'DES-002'
  ], { env: childEnvironment })
  assert.equal(requestedUrl, '/api/v1/tasks/DES-001/subtasks')
  assert.equal(requestedMethod, 'POST')
  assert.deepEqual(requestedBody, {
    id: 'DES-001-A', title: 'Research one option', role: 'designer',
    reviewerId: 'alice', assigneeId: 'bob', dependencyIds: ['DES-002']
  })
  const firstSessionKey = requestedIdempotencyKey
  await runFile(process.execPath, [
    projectCliUrl.pathname, 'split', 'DES-001',
    '--id', 'DES-001-A', '--title', 'Research one option', '--role', 'designer',
    '--reviewer', 'alice', '--assignee', 'bob', '--depends-on', 'DES-002'
  ], { env: { ...childEnvironment, TEAM_WORKFLOW_SESSION_ID: 'session-cli-two' } })
  assert.notEqual(requestedIdempotencyKey, firstSessionKey)

  const missingSession = { ...childEnvironment }
  delete missingSession.TEAM_WORKFLOW_SESSION_ID
  await assert.rejects(
    runFile(process.execPath, [projectCliUrl.pathname, 'whoami'], { env: missingSession }),
    (error) => error.code === 1 && /TEAM_WORKFLOW_SESSION_ID is required/.test(error.stderr)
  )
})
