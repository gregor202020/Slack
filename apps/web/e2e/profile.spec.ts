import { test, expect } from '@playwright/test'
import { loginAsUser } from './helpers/auth'

test.describe('Profile — Edit Profile page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)

    // Navigate to profile page via the user button in the sidebar
    await page.getByRole('button', { name: 'Test User' }).click()
    await page.waitForURL(/\/profile/)
  })

  test('profile page shows avatar section', async ({ page }) => {
    // The "Profile Picture" heading should be visible
    await expect(page.getByText('Profile Picture')).toBeVisible()

    // The "Upload Photo" button should be visible
    await expect(
      page.getByRole('button', { name: 'Upload Photo' }),
    ).toBeVisible()
  })

  test('profile page shows display name input', async ({ page }) => {
    // The Display Name label and input should be visible
    await expect(page.getByLabel('Display Name')).toBeVisible()

    // Should contain the mock user's display name
    await expect(page.getByLabel('Display Name')).toHaveValue('Test User')
  })

  test('profile page shows bio textarea', async ({ page }) => {
    // The Bio label and textarea should be visible
    await expect(page.getByLabel('Bio')).toBeVisible()

    // Should have the placeholder text
    await expect(page.getByPlaceholder('Tell your team a bit about yourself')).toBeVisible()
  })

  test('profile page shows timezone selector', async ({ page }) => {
    // The Timezone label and select should be visible
    await expect(page.getByLabel('Timezone')).toBeVisible()

    // Should default to UTC (from mock user)
    await expect(page.getByLabel('Timezone')).toHaveValue('UTC')
  })

  test('save button is disabled when no changes made', async ({ page }) => {
    // The save button should be disabled by default
    const saveButton = page.getByRole('button', { name: 'Save Changes' })
    await expect(saveButton).toBeVisible()
    await expect(saveButton).toBeDisabled()
  })
})
