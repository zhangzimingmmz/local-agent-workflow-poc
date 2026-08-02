export class GitHubEvidenceError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GitHubEvidenceError'
  }
}

function parsePullRequestUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new GitHubEvidenceError('pull request URL is malformed')
  }
  const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !match) {
    throw new GitHubEvidenceError('pull request URL must be an https://github.com/<owner>/<repo>/pull/<number> URL')
  }
  return { repository: `${match[1]}/${match[2]}`, number: Number(match[3]) }
}

export class GitHubEvidenceVerifier {
  constructor({ fetch = globalThis.fetch, token } = {}) {
    this.fetch = fetch
    this.token = token
  }

  async verify(evidence) {
    if (!Array.isArray(evidence.artifacts) || evidence.artifacts.length === 0) {
      throw new GitHubEvidenceError('at least one artifact is required')
    }
    const reference = parsePullRequestUrl(evidence.pullRequestUrl)
    if (reference.repository.toLowerCase() !== evidence.repository.toLowerCase()) {
      throw new GitHubEvidenceError('pull request repository does not match configured repository')
    }
    const root = `https://api.github.com/repos/${reference.repository}/pulls/${reference.number}`
    const [pullRequest, commits, files] = await Promise.all([
      this.#json(root),
      this.#json(`${root}/commits?per_page=100`),
      this.#json(`${root}/files?per_page=100`)
    ])
    if (pullRequest.base?.repo?.full_name?.toLowerCase() !== evidence.repository.toLowerCase()) {
      throw new GitHubEvidenceError('pull request base repository does not match')
    }
    if (pullRequest.base?.ref !== evidence.baseBranch) throw new GitHubEvidenceError('base branch does not match')
    if (pullRequest.head?.ref !== evidence.branch) throw new GitHubEvidenceError('head branch does not match')
    if (!commits.some((commit) => commit.sha === evidence.commitSha)) {
      throw new GitHubEvidenceError('commit is not included in pull request')
    }
    const filenames = new Set(files.map((file) => file.filename))
    for (const artifact of evidence.artifacts) {
      if (!filenames.has(artifact.path)) throw new GitHubEvidenceError(`artifact is not changed by pull request: ${artifact.path}`)
    }
    return {
      ...structuredClone(evidence),
      verified: true,
      pullRequestNumber: reference.number,
      headRepository: pullRequest.head.repo.full_name,
      headSha: pullRequest.head.sha,
      merged: Boolean(pullRequest.merged),
      mergeCommitSha: pullRequest.merge_commit_sha ?? null,
      verifiedAt: new Date().toISOString()
    }
  }

  async confirmMerged(pullRequestUrl) {
    const reference = parsePullRequestUrl(pullRequestUrl)
    const pullRequest = await this.#json(`https://api.github.com/repos/${reference.repository}/pulls/${reference.number}`)
    return {
      merged: Boolean(pullRequest.merged),
      mergeCommitSha: pullRequest.merge_commit_sha ?? null
    }
  }

  async #json(url) {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'local-agent-workflow-poc' }
    if (this.token) headers.authorization = `Bearer ${this.token}`
    const response = await this.fetch(url, { headers })
    if (!response?.ok) throw new GitHubEvidenceError(`GitHub returned ${response?.status ?? 'no response'} for ${url}`)
    return response.json()
  }
}
