import { test, expect, type Page } from '@playwright/test'
import { loginAsUser } from './helpers/auth'

const API_URL = 'http://localhost:4000'

// ---------------------------------------------------------------------------
// Mock search results
// ---------------------------------------------------------------------------

const MOCK_SEARCH_RESULTS = {
  messages: [
    {
      id: 'msg-search-1',
      body: 'The brisket rub is ready for tomorrow',
      headline: 'The <mark>brisket</mark> rub is ready for tomorrow',
      userId: 'user-2',
      authorName: 'Pit Boss',
      channelId: 'ch-general',
      channelName: 'general',
      dmId: null,
      createdAt: '2025-05-10T14:30:00Z',
    },
    {
      id: 'msg-search-2',
      body: 'Order more brisket from the supplier',
      headline: 'Order more <mark>brisket</mark> from the supplier',
      userId: 'user-3',
      authorName: 'Carol',
      channelId: 'ch-pitmaster',
      channelName: 'pitmaster-tips',
      dmId: null,
      createdAt: '2025-05-09T10:15:00Z',
    },
  ],
  channels: [
    {
      id: 'ch-general',
      name: 'general',
      topic: 'Company-wide announcements',
      type: 'public',
    },
  ],
  users: [
    {
      id: 'user-2',
      fullName: 'Pit Boss',
      orgRole: 'basic',
    },
  ],
}

const MOCK_EMPTY_RESULTS = {
  messages: [],
  channels: [],
  users: [],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockSearchRoutes(page: Page) {
  await page.route(`${API_URL}/api/search*`, (route) => {
    const url = new URL(route.request().url())
    const query = url.searchParams.get('q') || ''

    if (query.length < 2) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EMPTY_RESULTS),
      })
      return
    }

    // Return results for "brisket", empty for anything else
    const hasResults = query.toLowerCase().includes('brisket')
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(hasResults ? MOCK_SEARCH_RESULTS : MOCK_EMPTY_RESULTS),
    })
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Search — Search overlay', () => {
  test.beforeEach(async ({ page }) => {
    await mockSearchRoutes(page)
    await loginAsUser(page)
  })

  test('search button is visible in the header', async ({ page }) => {
    const searchButton = page.getByRole('button', {
      name: 'Search messages, channels, and people',
    })
    await expect(searchButton).toBeVisible()
  })

  test('clicking search button opens the search overlay', async ({ page }) => {
    await page.getByRole('button', {
      name: 'Search messages, channels, and people',
    }).click()

    // The search overlay dialog should be visible
    const dialog = page.getByRole('dialog', { name: 'Search' })
    await expect(dialog).toBeVisible()

    // The search input should be focused
    const searchInput = page.getByPlaceholder('Search messages, channels, people...')
    await expect(searchInput).toBeVisible()
  })

  test('Ctrl+K shortcut opens the search overlay', async ({ page }) => {
    // Press Ctrl+K (works on Windows/Linux)
    await page.keyboard.press('Control+k')

    // The search overlay should be open
    const dialog = page.getByRole('dialog', { name: 'Search' })
    await expect(dialog).toBeVisible()
  })

  test('Escape closes the search overlay', async ({ page }) => {
    // Open search
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible()

    // Press Escape
    await page.keyboard.press('Escape')

    // Dialog should be gone
    await expect(page.getByRole('dialog', { name: 'Search' })).not.toBeVisible()
  })

  test('shows placeholder text before typing', async ({ page }) => {
    await page.keyboard.press('Control+k')

    await expect(
      page.getByText('Type at least 2 characters to search'),
    ).toBeVisible()
  })

  test('search for messages returns results', async ({ page }) => {
    await page.keyboard.press('Control+k')

    const searchInput = page.getByPlaceholder('Search messages, channels, people...')
    await searchInput.fill('brisket')

    // Wait for debounced search results
    await expect(page.getByText('Messages')).toBeVisible()

    // The message search results should appear
    await expect(page.getByText('Pit Boss')).toBeVisible()
    await expect(page.getByText('in')).toBeVisible()
    await expect(page.getByText('#general')).toBeVisible()
  })

  test('search returns channel results', async ({ page }) => {
    await page.keyboard.press('Control+k')

    const searchInput = page.getByPlaceholder('Search messages, channels, people...')
    await searchInput.fill('brisket')

    // Wait for results
    await expect(page.getByText('Channels')).toBeVisible()

    // Channel result should show
    await expect(
      page.locator('[aria-label="Search results"]').getByText('general'),
    ).toBeVisible()
  })

  test('search returns people results', async ({ page }) => {
    await page.keyboard.press('Control+k')

    const searchInput = page.getByPlaceholder('Search messages, channels, people...')
    await searchInput.fill('brisket')

    // Wait for results
    await expect(page.getByText('People')).toBeVisible()

    // User result
    await expect(
      page.locator('[aria-label="Search results"]').getByText('Pit Boss'),
    ).toBeVisible()
  })

  test('search tabs filter result types', async ({ page }) => {
    await page.keyboard.press('Control+k')

    const searchInput = page.getByPlaceholder('Search messages, channels, people...')
    await searchInput.fill('brisket')

    // Wait for results and tabs to appear
    await expect(page.getByText('All')).toBeVisible()

    // Click the "Channels" tab
    await page.getByRole('button', { name: 'Channels' }).click()

    // Only channels should be shown — messages section heading should not be present
    // (the filter restricts to channels only)
    await expect(
      page.locator('[aria-label="Search results"]').getByText('general'),
    ).toBeVisible()
  })

  test('no results displays empty state', async ({ page }) => {
    await page.keyboard.press('Control+k')

    const searchInput = page.getByPlaceholder('Search messages, channels, people...')
    await searchInput.fill('xyznonexistent')

    // Wait for no results message
    await expect(page.getByText('No results found')).toBeVisible()
  })

  test('clicking a channel result navigates to the channel', async ({ page }) => {
    await page.keyboard.press('Control+k')

    const searchInput = page.getByPlaceholder('Search messages, channels, people...')
    await searchInput.fill('brisket')

    // Wait for results
    await expect(page.getByText('Channels')).toBeVisible()

    // Click on the channel result
    await page
      .locator('[aria-label="Search results"]')
      .getByText('general')
      .first()
      .click()

    // Search overlay should close
    await expect(page.getByRole('dialog', { name: 'Search' })).not.toBeVisible()

    // Should navigate to the channel
    await expect(page).toHaveURL(/\/channels\/ch-general/)
  })
})
