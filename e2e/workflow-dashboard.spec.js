import { expect, test } from '@playwright/test'

const alice = {
  authorization: 'Bearer e2e-token-alice',
  'content-type': 'application/json'
}
const bob = {
  authorization: 'Bearer e2e-token-bob',
  'content-type': 'application/json'
}

async function command(request, path, headers, idempotencyKey, data = {}) {
  const response = await request.post(path, {
    headers: { ...headers, 'idempotency-key': idempotencyKey },
    data
  })
  expect(response.ok(), await response.text()).toBe(true)
  return response.json()
}

test('dashboard reconstructs a scoped owner/reviewer flow and child relationship', async ({ page, request }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Northstar Labs' })).toBeVisible()
  await expect(page.locator('[data-requirement="REQ-001"]')).toContainText('in_progress')
  await expect(page.locator('[data-task]')).toHaveCount(6)
  await expect(page.locator('[data-task="DES-001"] em')).toHaveText('ready')
  await expect(page.locator('[data-task="DEV-001"]')).toContainText('Blocked by DES-001, DES-002')

  await command(request, '/api/v1/tasks/DES-001/claim', alice, 'e2e-claim')
  await command(request, '/api/v1/tasks/DES-001/subtasks', alice, 'e2e-split', {
    id: 'DES-001-A',
    title: 'Compare one workflow option',
    role: 'designer',
    reviewerId: 'alice',
    assigneeId: 'bob',
    dependencyIds: []
  })
  await command(request, '/api/v1/tasks/DES-001/start', alice, 'e2e-start', {
    agentType: 'codex',
    repository: 'zhangzimingmmz/local-agent-workflow-poc',
    branch: 'work/DES-001-design'
  })
  await command(request, '/api/v1/tasks/DES-001/submit', alice, 'e2e-submit', {
    repository: 'zhangzimingmmz/local-agent-workflow-poc',
    baseBranch: 'main',
    branch: 'work/DES-001-design',
    commitSha: 'a'.repeat(40),
    pullRequestUrl: 'https://github.com/zhangzimingmmz/local-agent-workflow-poc/pull/1',
    artifacts: [{ kind: 'design', path: 'deliverables/design/problem-solution.md' }]
  })
  await command(request, '/api/v1/tasks/DES-001/review', bob, 'e2e-review', {
    decision: 'accept',
    note: 'Design evidence is complete'
  })

  await page.reload()

  await expect(page.locator('[data-task]')).toHaveCount(7)
  await expect(page.locator('[data-task="DES-001"] em')).toHaveText('accepted')
  const child = page.locator('[data-task="DES-001-A"]')
  await expect(child).toContainText('claimed')
  await expect(child).toContainText('Parent')
  await expect(child).toContainText('DES-001')
  await expect(page.locator('[data-task="DEV-001"] em')).toHaveText('blocked')
  await expect(page.locator('#activity-timeline')).toContainText('TaskAccepted')

  await page.locator('[data-task="DES-001"] summary').click()
  await expect(page.locator('[data-task="DES-001"] details')).toContainText('Guidance versions:')
  await expect(page.locator('#workflow-metrics')).toContainText('Active time')
  await expect(page.locator('#workflow-metrics')).toContainText('Review time')
})
