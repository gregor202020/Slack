import { test, expect, type Page } from '@playwright/test'
import { loginAsUser, MOCK_USER } from './helpers/auth'

const API_URL = 'http://localhost:4000'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_USERS = {
  data: [
    {
      id: 'user-1',
      firstName: 'Alice',
      lastName: 'Johnson',
      displayName: 'Alice Johnson',
      orgRole: 'admin',
      status: 'active',
      avatarUrl: null,
    },
    {
      id: 'user-2',
      firstName: 'Bob',
      lastName: 'Smith',
      displayName: 'Bob Smith',
      orgRole: 'basic',
      status: 'active',
      avatarUrl: null,
    },
    {
      id: 'user-3',
      firstName: 'Carol',
      lastName: 'Diaz',
      displayName: 'Carol Diaz',
      orgRole: 'basic',
      status: 'suspended',
      avatarUrl: null,
    },
  ],
}

const MOCK_VENUES = {
  data: [
    { id: 'venue-1', name: 'Downtown Location', address: '123 Main St', status: 'active', memberCount: 8 },
    { id: 'venue-2', name: 'Uptown Spot', address: '456 Oak Ave', status: 'active', memberCount: 5 },
  ],
}

const MOCK_SHIFTS = {
  data: [
    {
      id: 'shift-1',
      userId: 'user-1',
      venueId: 'venue-1',
      position: 'Pitmaster',
      startTime: '2025-06-01T08:00:00Z',
      endTime: '2025-06-01T16:00:00Z',
      notes: 'Brisket day',
    },
  ],
}

const MOCK_ANNOUNCEMENTS = {
  data: [
    {
      id: 'ann-1',
      title: 'Summer Hours',
      body: 'We are adjusting hours for the summer season.',
      scope: 'system',
      ackRequired: false,
      locked: false,
      createdAt: '2025-05-15T12:00:00Z',
    },
  ],
}

const MOCK_MAINTENANCE = {
  data: [
    {
      id: 'maint-1',
      title: 'Broken smoker thermostat',
      description: 'Thermostat on smoker #3 reads 50 degrees too high.',
      status: 'open',
      priority: 'high',
      createdAt: '2025-05-20T09:00:00Z',
    },
  ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockAdminRoutes(page: Page) {
  await page.route(`${API_URL}/api/users`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_USERS),
      })
    } else {
      route.continue()
    }
  })

  await page.route(`${API_URL}/api/venues`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_VENUES),
      })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
  })

  await page.route(`${API_URL}/api/shifts/my`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SHIFTS),
    })
  })

  await page.route(`${API_URL}/api/announcements`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ANNOUNCEMENTS),
      })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
  })

  await page.route(`${API_URL}/api/maintenance`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_MAINTENANCE),
      })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    }
  })

  await page.route(`${API_URL}/api/invites`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.route(`${API_URL}/api/shifts`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin — Users page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminRoutes(page)
    await loginAsUser(page)

    // Navigate to admin (the mock user has orgRole: 'admin')
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.waitForURL(/\/admin/)
  })

  test('admin navigation tabs are visible', async ({ page }) => {
    const tabs = ['Users', 'Venues', 'Announcements', 'Shifts', 'Maintenance']
    for (const label of tabs) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible()
    }
  })

  test('users table renders with correct columns', async ({ page }) => {
    // Wait for the heading
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()

    // Table headers
    await expect(page.getByText('User', { exact: true })).toBeVisible()
    await expect(page.getByText('Role', { exact: true })).toBeVisible()
    await expect(page.getByText('Status', { exact: true })).toBeVisible()
    await expect(page.getByText('Actions', { exact: true })).toBeVisible()
  })

  test('users table displays mock user data', async ({ page }) => {
    // Each mock user should appear in the table
    for (const u of MOCK_USERS.data) {
      await expect(page.getByText(u.displayName)).toBeVisible()
    }
  })

  test('invite user button is visible for admins', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: 'Invite user' }),
    ).toBeVisible()
  })

  test('manage button opens dropdown', async ({ page }) => {
    // Click the first Manage button
    const manageButtons = page.getByRole('button', { name: 'Manage' })
    await manageButtons.first().click()

    // Dropdown should show "Change role"
    await expect(page.getByText('Change role')).toBeVisible()
  })

  test('invite user modal opens and closes', async ({ page }) => {
    // Open the invite modal
    await page.getByRole('button', { name: 'Invite user' }).click()

    // Modal heading should be visible
    await expect(page.getByText('Invite user', { exact: false })).toBeVisible()

    // Form fields should be present
    await expect(page.getByLabel('Name')).toBeVisible()
    await expect(page.getByLabel('Phone number')).toBeVisible()

    // Cancel button closes the modal
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Modal should be closed — the phone input should not be visible
    await expect(page.getByLabel('Phone number')).not.toBeVisible()
  })
})

test.describe('Admin — Venues page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminRoutes(page)
    await loginAsUser(page)
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.waitForURL(/\/admin/)

    // Click the Venues tab
    await page.getByRole('tab', { name: 'Venues' }).click()
    await page.waitForURL(/\/admin\/venues/)
  })

  test('venues heading and create button are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Venues' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create venue' })).toBeVisible()
  })

  test('venue cards display mock data', async ({ page }) => {
    for (const v of MOCK_VENUES.data) {
      await expect(page.getByText(v.name)).toBeVisible()
      await expect(page.getByText(v.address)).toBeVisible()
    }
  })

  test('create venue modal opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: 'Create venue' }).click()

    // Modal title
    await expect(page.getByText('Create venue')).toBeVisible()

    // Form fields
    await expect(page.getByLabel('Name')).toBeVisible()
    await expect(page.getByLabel('Address')).toBeVisible()

    // Close
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Address')).not.toBeVisible()
  })
})

test.describe('Admin — Shifts page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminRoutes(page)
    await loginAsUser(page)
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.waitForURL(/\/admin/)

    await page.getByRole('tab', { name: 'Shifts' }).click()
    await page.waitForURL(/\/admin\/shifts/)
  })

  test('shifts heading and create button are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Shifts' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create shift' })).toBeVisible()
  })

  test('shifts table renders with correct columns', async ({ page }) => {
    await expect(page.getByText('Position', { exact: true })).toBeVisible()
    await expect(page.getByText('Start', { exact: true })).toBeVisible()
    await expect(page.getByText('End', { exact: true })).toBeVisible()
    await expect(page.getByText('Notes', { exact: true })).toBeVisible()
  })

  test('create shift modal opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: 'Create shift' }).click()

    await expect(page.getByText('Create shift')).toBeVisible()
    await expect(page.getByLabel('Start time')).toBeVisible()
    await expect(page.getByLabel('End time')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Start time')).not.toBeVisible()
  })
})

test.describe('Admin — Announcements page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminRoutes(page)
    await loginAsUser(page)
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.waitForURL(/\/admin/)

    await page.getByRole('tab', { name: 'Announcements' }).click()
    await page.waitForURL(/\/admin\/announcements/)
  })

  test('announcements heading and create button are visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Announcements' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'New announcement' })).toBeVisible()
  })

  test('announcement cards display mock data', async ({ page }) => {
    await expect(page.getByText(MOCK_ANNOUNCEMENTS.data[0].title)).toBeVisible()
    await expect(
      page.getByText(MOCK_ANNOUNCEMENTS.data[0].body, { exact: false }),
    ).toBeVisible()
  })

  test('new announcement modal opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: 'New announcement' }).click()

    await expect(page.getByText('New announcement')).toBeVisible()
    await expect(page.getByLabel('Title')).toBeVisible()
    await expect(page.getByLabel('Body')).toBeVisible()
    await expect(page.getByLabel('Scope')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Title')).not.toBeVisible()
  })
})

test.describe('Admin — Maintenance page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminRoutes(page)
    await loginAsUser(page)
    await page.getByRole('button', { name: 'Admin' }).click()
    await page.waitForURL(/\/admin/)

    await page.getByRole('tab', { name: 'Maintenance' }).click()
    await page.waitForURL(/\/admin\/maintenance/)
  })

  test('maintenance heading and create button are visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Maintenance Requests' }),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'New request' })).toBeVisible()
  })

  test('maintenance cards display mock data', async ({ page }) => {
    await expect(page.getByText(MOCK_MAINTENANCE.data[0].title)).toBeVisible()
    await expect(
      page.getByText(MOCK_MAINTENANCE.data[0].description, { exact: false }),
    ).toBeVisible()
  })

  test('new request modal opens and closes', async ({ page }) => {
    await page.getByRole('button', { name: 'New request' }).click()

    await expect(page.getByText('New Maintenance Request')).toBeVisible()
    await expect(page.getByPlaceholder('e.g. Broken smoker thermostat')).toBeVisible()
    await expect(page.getByPlaceholder('Describe the issue...')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(
      page.getByPlaceholder('e.g. Broken smoker thermostat'),
    ).not.toBeVisible()
  })
})
