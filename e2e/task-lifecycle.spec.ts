/**
 * E2E smoke test: task lifecycle — page load, create, edit, navigate.
 *
 * Requires: PostgreSQL + backend (port 8000) + frontend (port 5173) running.
 * Run: pnpm test:e2e
 */
import { test, expect } from '@playwright/test'

test.describe('Task Lifecycle', () => {

  test('Queue page loads with kanban columns', async ({ page }) => {
    await page.goto('/queue')
    await expect(page.locator('text=全自动')).toBeVisible()
    await expect(page.locator('text=半自动')).toBeVisible()
    await expect(page.locator('text=人在loop')).toBeVisible()
  })

  test('Dashboard page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Dashboard')).toBeVisible()
  })

  test('Create new task via modal', async ({ page }) => {
    await page.goto('/queue')

    // Click "+ New Task" button
    await page.click('text=+ New Task')

    // Modal title is "New Task"
    await expect(page.locator('text=New Task').last()).toBeVisible({ timeout: 3000 })

    // Fill title
    const titleInput = page.locator('input[type="text"]').first()
    await titleInput.fill('E2E 测试任务')

    // Submit
    await page.click('text=Submit →')

    // Wait for task to appear
    await page.waitForTimeout(1500)
    await expect(page.locator('text=E2E 测试任务').first()).toBeVisible({ timeout: 5000 })
  })

  test('Click task opens drawer', async ({ page }) => {
    await page.goto('/queue')
    await page.waitForTimeout(1000)

    // Find a task card and click it — task titles are in <p> tags
    const taskTitle = page.locator('p.font-medium').first()
    if (await taskTitle.isVisible()) {
      await taskTitle.click()
      // Drawer header
      await expect(page.locator('h2:has-text("任务详情")')).toBeVisible({ timeout: 3000 })
    }
  })

  test('History page loads', async ({ page }) => {
    await page.goto('/history')
    await expect(page.locator('text=History')).toBeVisible()
  })

  test('Agent Monitor page loads', async ({ page }) => {
    await page.goto('/agents')
    await expect(page.locator('text=Agent Monitor')).toBeVisible()
    await expect(page.locator('text=Main Agent')).toBeVisible()
  })

  test('Sidebar navigation works', async ({ page }) => {
    await page.goto('/')

    // Sidebar uses <button> with title attribute
    await page.click('button[title="Queue"]')
    await page.waitForURL('**/queue')
    await expect(page.locator('text=全自动')).toBeVisible()

    await page.click('button[title="Agents"]')
    await page.waitForURL('**/agents')
    await expect(page.locator('text=Main Agent')).toBeVisible()

    await page.click('button[title="History"]')
    await page.waitForURL('**/history')
    await expect(page.locator('text=History')).toBeVisible()

    await page.click('button[title="Dashboard"]')
    await page.waitForURL('**/')
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible()
  })
})
