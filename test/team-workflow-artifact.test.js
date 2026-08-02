import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const skillUrl = new URL('../deliverables/dev-002/team-workflow/SKILL.md', import.meta.url)
const cliUrl = new URL('../deliverables/dev-002/team-workflow/workflow.mjs', import.meta.url)

test('DEV-002 packages Codex Skill instructions and a deterministic CLI', async () => {
  const [skill, cli] = await Promise.all([readFile(skillUrl, 'utf8'), readFile(cliUrl, 'utf8')])
  assert.match(skill, /Organization.*Team.*Project.*Module.*Work Item/s)
  assert.match(skill, /claim.*policy.*start.*submit.*review/s)
  assert.match(cli, /idempotency-key/)
  assert.match(cli, /whoami/)
  assert.match(cli, /submit/)
  execFileSync(process.execPath, ['--check', cliUrl.pathname])
})
