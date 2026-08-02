import assert from 'node:assert/strict'
import test from 'node:test'

import { createGitHubEventHandler, reconcileAccepted } from '../src/github-event.js'

test('a merged pull request delivery is reverified before integration', async () => {
  const calls = []
  const github = { async confirmMerged(url) { calls.push(['verify', url]); return { merged: true, mergeCommitSha: 'merge-123' } } }
  const workflow = { async integrateByPullRequest(url, sha) { calls.push(['integrate', url, sha]) } }
  const handle = createGitHubEventHandler({ github, workflow })
  await handle({
    event: 'pull_request',
    payload: { action: 'closed', pull_request: { merged: true, html_url: 'https://github.com/acme/widgets/pull/42' } }
  })
  assert.deepEqual(calls, [
    ['verify', 'https://github.com/acme/widgets/pull/42'],
    ['integrate', 'https://github.com/acme/widgets/pull/42', 'merge-123']
  ])
})

test('non-merge deliveries are recorded without changing workflow state', async () => {
  let integrated = false
  const handle = createGitHubEventHandler({
    github: { async confirmMerged() { throw new Error('should not run') } },
    workflow: { async integrateByPullRequest() { integrated = true } }
  })
  await handle({ event: 'pull_request', payload: { action: 'opened', pull_request: { merged: false } } })
  await handle({ event: 'ping', payload: { zen: 'hello' } })
  assert.equal(integrated, false)
})

test('reconciliation recovers a missed merge event for accepted work', async () => {
  const calls = []
  const workflow = {
    dashboard() {
      return { tasks: [
        { id: 'DEV-001', status: 'accepted', evidence: { pullRequestUrl: 'https://github.com/acme/widgets/pull/42' } },
        { id: 'DES-001', status: 'integrated', evidence: { pullRequestUrl: 'https://github.com/acme/widgets/pull/40' } }
      ] }
    },
    async integrateByPullRequest(url, sha) { calls.push([url, sha]) }
  }
  const github = { async confirmMerged() { return { merged: true, mergeCommitSha: 'merge-123' } } }
  assert.equal(await reconcileAccepted({ github, workflow }), 1)
  assert.deepEqual(calls, [['https://github.com/acme/widgets/pull/42', 'merge-123']])
})
