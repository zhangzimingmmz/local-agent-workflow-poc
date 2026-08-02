import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const bootstrap = new URL('../deploy/bootstrap-env.sh', import.meta.url)

test('bootstrap configures an isolated port and trusted Project repository without exposing tokens', async (t) => {
  const target = await mkdtemp(join(tmpdir(), 'workflow-bootstrap-'))
  t.after(() => rm(target, { recursive: true, force: true }))

  execFileSync(bootstrap.pathname, [target, 'acme/widgets', '8099', 'release'], {
    stdio: ['ignore', 'ignore', 'pipe']
  })
  const environment = await readFile(join(target, '.env'), 'utf8')
  const alice = await readFile(join(target, 'accounts/alice.env'), 'utf8')

  assert.match(environment, /^APP_PORT=8099$/m)
  assert.match(environment, /^WORKFLOW_REPOSITORY=acme\/widgets$/m)
  assert.match(environment, /^WORKFLOW_BASE_BRANCH=release$/m)
  assert.match(alice, /^TEAM_WORKFLOW_URL=http:\/\/100\.64\.0\.5:8099$/m)
  assert.match(alice, /^TEAM_WORKFLOW_BASE_BRANCH=release$/m)
  assert.doesNotMatch(environment, /<github-owner\/repository>/)
})
