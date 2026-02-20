import { test, expect } from '@playwright/test'
import {
  mockOtpFlow,
  mockOtpRequestFailure,
  mockAuthenticatedSession,
} from './helpers/auth'

const API_URL = 'http://localhost:4000'

test.describe('Auth — Login page', () => {
  test.beforeEach(async ({ page }) => {
    // Ensure the refresh call fails so the app shows the login page
    // when navigating to authenticated routes (the main layout redirects to /login)
    await page.route(`${API_URL}/api/auth/refresh`, (route) => {
      route.fulfill({ status: 401, body: '{}' })
    })
  })

  test('renders phone input and submit button', async ({ page }) => {
    await page.goto('/login')

    // Phone input is visible
    const phoneInput = page.getByPlaceholder('+1 (555) 123-4567')
    await expect(phoneInput).toBeVisible()

    // Submit button is visible
    const submitButton = page.getByRole('button', { name: 'Send code' })
    await expect(submitButton).toBeVisible()

    // Page heading
    await expect(page.getByText('Sign in')).toBeVisible()
  })

  test('shows validation error for invalid phone format', async ({ page }) => {
    await page.goto('/login')

    // Enter an invalid phone number (no international prefix)
    await page.getByPlaceholder('+1 (555) 123-4567').fill('5551234567')

    // Click submit
    await page.getByRole('button', { name: 'Send code' }).click()

    // Should show validation error
    await expect(
      page.getByText('Enter a valid phone number in international format'),
    ).toBeVisible()
  })

  test('successful OTP request navigates to verify page', async ({ page }) => {
    await mockOtpFlow(page)

    await page.goto('/login')

    // Enter a valid phone number
    await page.getByPlaceholder('+1 (555) 123-4567').fill('+15551234567')

    // Click submit
    await page.getByRole('button', { name: 'Send code' }).click()

    // Should navigate to verify page
    await page.waitForURL('**/verify')

    // Verify page shows the code heading
    await expect(page.getByText('Enter your code')).toBeVisible()

    // Shows the phone number that the code was sent to
    await expect(page.getByText('+15551234567')).toBeVisible()
  })

  test('successful OTP verification navigates to main app', async ({ page }) => {
    await mockOtpFlow(page)
    await mockAuthenticatedSession(page)

    await page.goto('/login')

    // Enter phone and submit
    await page.getByPlaceholder('+1 (555) 123-4567').fill('+15551234567')
    await page.getByRole('button', { name: 'Send code' }).click()

    // Wait for verify page
    await page.waitForURL('**/verify')

    // Fill in the 6-digit code
    const codeInputs = page.locator('input[inputmode="numeric"]')
    const digits = '123456'
    for (let i = 0; i < 6; i++) {
      await codeInputs.nth(i).fill(digits[i])
    }

    // Auto-submits when all digits are filled — wait for redirect
    await page.waitForURL('**/channels')

    // The main app should now be visible with the sidebar
    await expect(page.getByText('THE SMOKER')).toBeVisible()
  })

  test('shows error toast on OTP request failure', async ({ page }) => {
    await mockOtpRequestFailure(page)

    await page.goto('/login')

    // Enter a valid phone number
    await page.getByPlaceholder('+1 (555) 123-4567').fill('+15551234567')

    // Click submit
    await page.getByRole('button', { name: 'Send code' }).click()

    // Should show an error toast
    await expect(
      page.getByText('Too many requests. Please try again later.'),
    ).toBeVisible()

    // Should still be on the login page
    expect(page.url()).toContain('/login')
  })
})
