import assert from 'node:assert/strict'
import test from 'node:test'

import { GitHubEvidenceVerifier } from '../src/github.js'

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body } }
}

test('GitHub verifier confirms PR target, head branch, commit membership and artifact paths', async () => {
  const responses = new Map([
    ['https://api.github.com/repos/acme/widgets/pulls/42', response({
      html_url: 'https://github.com/acme/widgets/pull/42',
      head: { ref: 'work/DEV-001-widget', sha: 'head456', repo: { full_name: 'alice/widgets' } },
      base: { ref: 'main', repo: { full_name: 'acme/widgets' } }, merged: false
    })],
    ['https://api.github.com/repos/acme/widgets/pulls/42/commits?per_page=100', response([{ sha: 'abc123' }])],
    ['https://api.github.com/repos/acme/widgets/pulls/42/files?per_page=100', response([{ filename: 'src/widget.js' }, { filename: 'test/widget.test.js' }])]
  ])
  const verifier = new GitHubEvidenceVerifier({ fetch: async (url) => responses.get(url) ?? response({}, 404) })

  const result = await verifier.verify({
    repository: 'acme/widgets', baseBranch: 'main', branch: 'work/DEV-001-widget',
    commitSha: 'abc123', pullRequestUrl: 'https://github.com/acme/widgets/pull/42',
    artifacts: [{ kind: 'code', path: 'src/widget.js' }]
  })

  assert.equal(result.verified, true)
  assert.equal(result.pullRequestNumber, 42)
  assert.equal(result.headRepository, 'alice/widgets')
})

test('GitHub verifier rejects evidence not represented by the pull request', async () => {
  const fetch = async (url) => {
    if (url.endsWith('/pulls/42')) return response({ head: { ref: 'other', repo: { full_name: 'alice/widgets' } }, base: { ref: 'main', repo: { full_name: 'acme/widgets' } } })
    if (url.includes('/commits')) return response([{ sha: 'other' }])
    return response([])
  }
  const verifier = new GitHubEvidenceVerifier({ fetch })

  await assert.rejects(verifier.verify({
    repository: 'acme/widgets', baseBranch: 'main', branch: 'work/DEV-001-widget',
    commitSha: 'abc123', pullRequestUrl: 'https://github.com/acme/widgets/pull/42',
    artifacts: [{ kind: 'code', path: 'src/widget.js' }]
  }), /head branch does not match/)
})

test('GitHub verifier rejects artifact paths absent from changed files', async () => {
  const fetch = async (url) => {
    if (url.endsWith('/pulls/42')) return response({ head: { ref: 'work/DEV-001-widget', repo: { full_name: 'alice/widgets' } }, base: { ref: 'main', repo: { full_name: 'acme/widgets' } } })
    if (url.includes('/commits')) return response([{ sha: 'abc123' }])
    return response([{ filename: 'README.md' }])
  }
  const verifier = new GitHubEvidenceVerifier({ fetch })
  await assert.rejects(verifier.verify({
    repository: 'acme/widgets', baseBranch: 'main', branch: 'work/DEV-001-widget',
    commitSha: 'abc123', pullRequestUrl: 'https://github.com/acme/widgets/pull/42',
    artifacts: [{ kind: 'code', path: 'src/widget.js' }]
  }), /artifact is not changed by pull request/)
})
