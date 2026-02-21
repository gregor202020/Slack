import { test, expect, type Page } from '@playwright/test'
import { loginAsUser, MOCK_CHANNELS } from './helpers/auth'

const API_URL = 'http://localhost:4000'

// ---------------------------------------------------------------------------
// Additional mock data for channel management
// ---------------------------------------------------------------------------

const BROWSE_CHANNELS = {
  data: [
    ...MOCK_CHANNELS.data,
    {
      id: 'ch-new-public',
      name: 'smoke-signals',
      type: 'public',
      scope: 'org',
      topic: 'Alerts and notifications',
      memberCount: 6,
    },
    {
      id: 'ch-private',
      name: 'secret-recipes',
      type: 'private',
      scope: 'org',
      topic: 'Proprietary rubs and sauces',
      memberCount: 3,
    },
  ],
}

const MOCK_CHANNEL_MEMBERS = {
  data: [
    { id: 'test-user-id', displayName: 'Test User', orgRole: 'admin' },
    { id: 'user-2', displayName: 'Pit Boss', orgRole: 'basic' },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockChannelRoutes(page: Page) {
  // Override the default channels mock to also support browse mode
  // The browse mode fetches /api/channels which returns all channels
  let callCount = 0
  await page.route(`${API_URL}/api/channels`, (route) => {
    if (route.request().method() === 'GET') {
      callCount++
      // First call returns user's channels; subsequent calls may return all
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(callCount <= 1 ? MOCK_CHANNELS : BROWSE_CHANNELS),
      })
    } else if (route.request().method() === 'POST') {
      // Create channel
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'ch-created',
          name: 'new-channel',
          type: 'public',
          scope: 'org',
          topic: '',
          memberCount: 1,
        }),
      })
    } else {
      route.continue()
    }
  })

  await page.route(`${API_URL}/api/channels/*/members`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CHANNEL_MEMBERS),
    })
  })

  await page.route(`${API_URL}/api/channels/*/join`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })

  await page.route(`${API_URL}/api/channels/*/leave`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })

  // Notification preference update
  await page.route(`${API_URL}/api/channels/*/notification-pref`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // Channel update (PATCH)
  await page.route(`${API_URL}/api/channels/*`, (route) => {
    if (route.request().method() === 'PATCH') {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    } else {
      route.continue()
    }
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Channels — Channel list page', () => {
  test.beforeEach(async ({ page }) => {
    await mockChannelRoutes(page)
    await loginAsUser(page)
  })

  test('channels page shows My Channels and Browse All tabs', async ({ page }) => {
    // The channels page should already be visible after login
    await expect(page.getByRole('heading', { name: 'Channels' })).toBeVisible()

    // Filter tabs
    await expect(page.getByText('My Channels')).toBeVisible()
    await expect(page.getByText('Browse All')).toBeVisible()
  })

  test('my channels tab lists joined channels', async ({ page }) => {
    // Each mock channel the user has joined should be visible
    for (const ch of MOCK_CHANNELS.data) {
      await expect(page.getByText(ch.name)).toBeVisible()
    }
  })

  test('browse all tab shows additional channels with join button', async ({ page }) => {
    // Switch to Browse All
    await page.getByText('Browse All').click()

    // Wait for the new channels to appear
    await expect(page.getByText('smoke-signals')).toBeVisible()

    // The un-joined channel should have a Join button
    const joinButton = page.getByRole('button', { name: 'Join' })
    await expect(joinButton.first()).toBeVisible()
  })

  test('search channels input filters the list', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search channels...')
    await expect(searchInput).toBeVisible()

    // Filter by a channel name
    await searchInput.fill('pitmaster')

    // Only the matching channel should be visible
    await expect(page.getByText('pitmaster-tips')).toBeVisible()
    // Other channels should not be visible
    await expect(page.getByText('shift-swaps')).not.toBeVisible()
  })

  test('clicking a joined channel navigates to channel view', async ({ page }) => {
    const firstChannel = MOCK_CHANNELS.data[0]

    // Click the channel in the sidebar
    await page.getByRole('button', { name: firstChannel.name }).click()

    // Should navigate to the channel page
    await page.waitForURL(new RegExp(`/channels/${firstChannel.id}`))

    // Channel header should show the channel name
    await expect(
      page.getByRole('heading', { name: `# ${firstChannel.name}` }),
    ).toBeVisible()
  })
})

test.describe('Channels — Channel settings', () => {
  test.beforeEach(async ({ page }) => {
    await mockChannelRoutes(page)
    await loginAsUser(page)

    // Navigate to a channel
    const firstChannel = MOCK_CHANNELS.data[0]
    await page.getByRole('button', { name: firstChannel.name }).click()
    await page.waitForURL(new RegExp(`/channels/${firstChannel.id}`))
  })

  test('channel settings panel opens from header gear icon', async ({ page }) => {
    // Click the settings gear button
    await page.getByRole('button', { name: 'Channel settings' }).click()

    // Settings panel should be visible
    await expect(page.getByText('Channel Settings')).toBeVisible()

    // Tabs should be visible
    await expect(page.getByText('Info')).toBeVisible()
    await expect(page.getByText('Members')).toBeVisible()
    await expect(page.getByText('Notifications')).toBeVisible()
  })

  test('channel settings info tab shows editable fields for admins', async ({ page }) => {
    await page.getByRole('button', { name: 'Channel settings' }).click()

    // Info tab is open by default
    await expect(page.getByLabel('Channel name')).toBeVisible()
    await expect(page.getByLabel('Topic')).toBeVisible()

    // Admin should see Save changes and Danger Zone
    await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible()
    await expect(page.getByText('Danger Zone')).toBeVisible()
  })

  test('channel settings members tab shows member list', async ({ page }) => {
    await page.getByRole('button', { name: 'Channel settings' }).click()

    // Switch to Members tab
    await page.getByText('Members').click()

    // Members from the mock should be listed
    await expect(page.getByText('Test User')).toBeVisible()
    await expect(page.getByText('Pit Boss')).toBeVisible()
  })

  test('channel settings notifications tab shows preference options', async ({ page }) => {
    await page.getByRole('button', { name: 'Channel settings' }).click()

    // Switch to Notifications tab
    await page.getByText('Notifications').click()

    // Notification options should be visible
    await expect(page.getByText('All messages')).toBeVisible()
    await expect(page.getByText('Mentions only')).toBeVisible()
    await expect(page.getByText('Muted')).toBeVisible()
  })

  test('channel settings close button works', async ({ page }) => {
    await page.getByRole('button', { name: 'Channel settings' }).click()
    await expect(page.getByText('Channel Settings')).toBeVisible()

    // Close via the X button
    await page.getByRole('button', { name: 'Close channel settings' }).click()

    // Panel should no longer be visible
    await expect(page.getByText('Channel Settings')).not.toBeVisible()
  })

  test('leave channel button is visible for non-mandatory channels', async ({ page }) => {
    // Navigate to a non-mandatory channel (pitmaster-tips)
    const nonMandatory = MOCK_CHANNELS.data[1]
    await page.getByRole('button', { name: nonMandatory.name }).click()
    await page.waitForURL(new RegExp(`/channels/${nonMandatory.id}`))

    // Open settings
    await page.getByRole('button', { name: 'Channel settings' }).click()

    // Leave channel button should be visible
    await expect(
      page.getByRole('button', { name: 'Leave channel' }),
    ).toBeVisible()
  })
})
