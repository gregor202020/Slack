import { test, expect } from '@playwright/test'
import { loginAsUser, MOCK_CHANNELS, MOCK_DMS } from './helpers/auth'

test.describe('Navigation — Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
  })

  test('sidebar shows channels list after login', async ({ page }) => {
    // The "Channels" section heading should be visible
    await expect(page.getByText('Channels', { exact: false })).toBeVisible()

    // Each mock channel should appear in the sidebar
    for (const ch of MOCK_CHANNELS.data) {
      await expect(page.getByRole('button', { name: ch.name })).toBeVisible()
    }
  })

  test('clicking a channel navigates to /channels/:id', async ({ page }) => {
    const firstChannel = MOCK_CHANNELS.data[0]

    // Click the first channel in the sidebar
    await page.getByRole('button', { name: firstChannel.name }).click()

    // URL should include the channel ID
    await expect(page).toHaveURL(new RegExp(`/channels/${firstChannel.id}`))

    // The header should show the channel name
    await expect(
      page.getByRole('heading', { name: `# ${firstChannel.name}` }),
    ).toBeVisible()
  })

  test('sidebar shows DM list', async ({ page }) => {
    // The "Direct Messages" section heading should be visible
    await expect(page.getByText('Direct Messages')).toBeVisible()

    // Should show DM entries (the sidebar renders "DM" as the label for each)
    const dmButtons = page.locator('aside button').filter({ hasText: 'DM' })
    await expect(dmButtons.first()).toBeVisible()

    // We mocked 2 DMs
    expect(await dmButtons.count()).toBe(MOCK_DMS.data.length)
  })

  test('Settings link navigates to /settings', async ({ page }) => {
    // Click the Settings button in the sidebar
    await page.getByRole('button', { name: 'Settings' }).click()

    // Should navigate to settings page
    await expect(page).toHaveURL(/\/settings/)

    // Settings page heading should be visible
    await expect(
      page.getByRole('heading', { name: 'Settings' }),
    ).toBeVisible()
  })

  test('Profile button navigates to /profile', async ({ page }) => {
    // The user info button at the bottom of the sidebar shows the display name
    await page.getByRole('button', { name: 'Test User' }).click()

    // Should navigate to profile page
    await expect(page).toHaveURL(/\/profile/)

    // Profile page heading should be visible
    await expect(
      page.getByRole('heading', { name: 'Edit Profile' }),
    ).toBeVisible()
  })

  test('THE SMOKER logo is visible in sidebar', async ({ page }) => {
    // The logo text in the sidebar
    const logo = page.locator('aside').getByText('THE SMOKER')
    await expect(logo).toBeVisible()
  })
})
