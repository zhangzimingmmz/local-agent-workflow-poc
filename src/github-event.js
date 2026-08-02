export function createGitHubEventHandler({ github, workflow }) {
  return async function handleGitHubEvent(delivery) {
    if (delivery.event !== 'pull_request') return
    const pullRequest = delivery.payload?.pull_request
    if (delivery.payload?.action !== 'closed' || !pullRequest?.merged || !pullRequest.html_url) return
    const verified = await github.confirmMerged(pullRequest.html_url)
    if (!verified.merged || !verified.mergeCommitSha) return
    await workflow.integrateByPullRequest(pullRequest.html_url, verified.mergeCommitSha, {
      idempotencyKey: `github-delivery:${delivery.id}`
    })
  }
}

export async function reconcileAccepted({ github, workflow }) {
  let integrated = 0
  const accepted = workflow.dashboard().tasks.filter((task) => task.status === 'accepted' && task.evidence?.pullRequestUrl)
  for (const task of accepted) {
    const verified = await github.confirmMerged(task.evidence.pullRequestUrl)
    if (!verified.merged || !verified.mergeCommitSha) continue
    await workflow.integrateByPullRequest(task.evidence.pullRequestUrl, verified.mergeCommitSha, {
      idempotencyKey: `github-reconcile:${task.id}:${verified.mergeCommitSha}`
    })
    integrated += 1
  }
  return integrated
}
