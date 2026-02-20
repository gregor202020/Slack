import { type Page } from '@playwright/test'

/**
 * Mock user returned by the auth flow.
 * Matches the User interface in stores/auth.ts.
 */
export const MOCK_USER = {
  id: 'test-user-id',
  firstName: 'Test',
  lastName: 'User',
  displayName: 'Test User',
  orgRole: 'admin',
  avatarUrl: null,
  status: 'active',
  bio: null,
  timezone: 'UTC',
  theme: 'dark',
  notificationSound: true,
  notificationDesktop: true,
}

/**
 * Mock channels returned after login.
 */
export const MOCK_CHANNELS = {
  data: [
    {
      id: 'ch-general',
      name: 'general',
      type: 'public',
      scope: 'org',
      topic: 'Company-wide announcements',
      memberCount: 24,
      isDefault: true,
      isMandatory: true,
    },
    {
      id: 'ch-pitmaster',
      name: 'pitmaster-tips',
      type: 'public',
      scope: 'org',
      topic: 'BBQ techniques and wisdom',
      memberCount: 12,
    },
    {
      id: 'ch-shifts',
      name: 'shift-swaps',
      type: 'public',
      scope: 'org',
      topic: 'Coordinate shift changes',
      memberCount: 18,
    },
  ],
}

/**
 * Mock DMs returned after login.
 */
export const MOCK_DMS = {
  data: [
    { id: 'dm-1', type: 'direct', createdAt: '2025-01-15T10:00:00Z' },
    { id: 'dm-2', type: 'direct', createdAt: '2025-01-14T08:30:00Z' },
  ],
}

/**
 * Mock messages for a channel.
 */
export const MOCK_MESSAGES = {
  data: [
    {
      id: 'msg-1',
      body: 'Brisket is looking great today!',
      userId: 'user-2',
      channelId: 'ch-general',
      createdAt: '2025-01-15T10:30:00Z',
      updatedAt: '2025-01-15T10:30:00Z',
    },
    {
      id: 'msg-2',
      body: 'Ribs are almost ready for the lunch rush',
      userId: 'test-user-id',
      channelId: 'ch-general',
      createdAt: '2025-01-15T10:35:00Z',
      updatedAt: '2025-01-15T10:35:00Z',
    },
  ],
}

/**
 * Mock unread counts.
 */
export const MOCK_UNREAD = {
  channels: {},
  dms: {},
  total: 0,
}

const API_URL = 'http://localhost:4000'

/**
 * Set up all API route mocks needed for an authenticated session.
 * This intercepts the auth refresh, user profile, channels, DMs, and unread endpoints
 * so the app believes the user is logged in.
 */
export async function mockAuthenticatedSession(page: Page) {
  // Mock the auth refresh call (fetchMe calls this directly via fetch)
  await page.route(`${API_URL}/api/auth/refresh`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'mock-access-token' }),
    })
  })

  // Mock the user profile endpoint
  await page.route(`${API_URL}/api/users/me`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_USER),
      })
    } else {
      route.continue()
    }
  })

  // Mock channels list
  await page.route(`${API_URL}/api/channels`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CHANNELS),
      })
    } else {
      route.continue()
    }
  })

  // Mock DMs list
  await page.route(`${API_URL}/api/dms`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DMS),
      })
    } else {
      route.continue()
    }
  })

  // Mock unread counts
  await page.route(`${API_URL}/api/unread`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_UNREAD),
    })
  })

  // Mock mark-as-read
  await page.route(`${API_URL}/api/unread/read`, (route) => {
    route.fulfill({
      status: 204,
      body: '',
    })
  })

  // Mock channel messages
  await page.route(`${API_URL}/api/messages/channel/*`, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_MESSAGES),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'msg-new',
          body: 'New message',
          userId: MOCK_USER.id,
          channelId: 'ch-general',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      })
    }
  })

  // Mock channel members
  await page.route(`${API_URL}/api/channels/*/members`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    })
  })

  // Mock user profile update
  await page.route(`${API_URL}/api/users/me/profile`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    })
  })

  // Mock user preferences update
  await page.route(`${API_URL}/api/users/me/preferences`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    })
  })
}

/**
 * Set up API mocks for the OTP login flow.
 * Intercepts the OTP request and verify endpoints.
 */
export async function mockOtpFlow(page: Page) {
  // Mock OTP request
  await page.route(`${API_URL}/api/auth/otp/request`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    })
  })

  // Mock OTP verification
  await page.route(`${API_URL}/api/auth/otp/verify`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'mock-access-token',
        user: MOCK_USER,
        needsOnboarding: false,
      }),
    })
  })
}

/**
 * Set up mocks that make the OTP request fail with an error.
 */
export async function mockOtpRequestFailure(page: Page) {
  await page.route(`${API_URL}/api/auth/otp/request`, (route) => {
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
        },
      }),
    })
  })
}

/**
 * Perform a full mocked login flow:
 *  1. Navigate to /login
 *  2. Fill in phone number and submit
 *  3. Fill in OTP code on /verify and submit
 *
 * After this, the page should redirect to /channels.
 */
export async function loginAsUser(page: Page, phone = '+15551234567') {
  // Set up OTP flow mocks
  await mockOtpFlow(page)

  // Set up authenticated session mocks (for after verification)
  await mockAuthenticatedSession(page)

  // Navigate to login
  await page.goto('/login')

  // Fill in phone number
  await page.getByPlaceholder('+1 (555) 123-4567').fill(phone)

  // Click "Send code"
  await page.getByRole('button', { name: 'Send code' }).click()

  // Wait for navigation to verify page
  await page.waitForURL('**/verify')

  // Fill in the 6-digit code — each digit in a separate input
  const codeInputs = page.locator('input[inputmode="numeric"]')
  const digits = '123456'
  for (let i = 0; i < 6; i++) {
    await codeInputs.nth(i).fill(digits[i])
  }

  // The form auto-submits when all 6 digits are filled.
  // Wait for navigation to the main app.
  await page.waitForURL('**/channels')
}
