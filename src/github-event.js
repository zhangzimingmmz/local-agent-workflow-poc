export function createGitHubEventHandler({ github, workflow }) {
  return async function handleGitHubEvent(delivery) {
    if (delivery.event !== 'pull_request') return
    const pullRequest = delivery.payload?.pull_request
    if (delivery.payload?.action !== 'closed' || !pullRequest?.merged || !pullRequest.html_url) return
    const verified = await github.confirmMerged(pullRequest.html_url)
    if (!verified.merged || !verified.mergeCommitSha) return
    await workflow.integrateByPullRequest(pullRequest.html_url, verified.mergeCommitSha)
  }
}
