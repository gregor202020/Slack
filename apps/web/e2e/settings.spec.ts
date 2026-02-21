import { test, expect } from '@playwright/test'
import { loginAsUser } from './helpers/auth'

test.describe('Settings — Preferences page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)

    // Navigate to settings via the sidebar button
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.waitForURL(/\/settings/)
  })

  test('settings page heading and description are visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Settings' }),
    ).toBeVisible()

    await expect(
      page.getByText('Customize your app experience'),
    ).toBeVisible()
  })

  test('appearance section shows theme toggle buttons', async ({ page }) => {
    // Section heading
    await expect(page.getByText('Appearance')).toBeVisible()

    // Theme label
    await expect(page.getByText('Theme')).toBeVisible()
    await expect(
      page.getByText('Choose between dark and light mode'),
    ).toBeVisible()

    // Dark and Light buttons
    const darkButton = page.getByRole('button', { name: 'Dark' })
    const lightButton = page.getByRole('button', { name: 'Light' })
    await expect(darkButton).toBeVisible()
    await expect(lightButton).toBeVisible()

    // Dark should be pressed by default (mock user has theme: 'dark')
    await expect(darkButton).toHaveAttribute('aria-pressed', 'true')
    await expect(lightButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('notification section shows sound and desktop toggles', async ({ page }) => {
    // Section heading
    await expect(page.getByText('Notifications')).toBeVisible()

    // Notification sound toggle
    await expect(page.getByText('Notification Sound')).toBeVisible()
    await expect(
      page.getByText('Play a sound when you receive a notification'),
    ).toBeVisible()

    const soundSwitch = page.getByRole('switch', { name: 'Notification sound' })
    await expect(soundSwitch).toBeVisible()
    // Default is on (mock user has notificationSound: true)
    await expect(soundSwitch).toHaveAttribute('aria-checked', 'true')

    // Desktop notifications toggle
    await expect(page.getByText('Desktop Notifications')).toBeVisible()
    await expect(
      page.getByText('Show browser notifications for new messages'),
    ).toBeVisible()

    const desktopSwitch = page.getByRole('switch', { name: 'Desktop notifications' })
    await expect(desktopSwitch).toBeVisible()
    await expect(desktopSwitch).toHaveAttribute('aria-checked', 'true')
  })

  test('save button is disabled when no changes are made', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: 'Save Preferences' })
    await expect(saveButton).toBeVisible()
    await expect(saveButton).toBeDisabled()
  })

  test('changing theme enables the save button', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: 'Save Preferences' })

    // Initially disabled
    await expect(saveButton).toBeDisabled()

    // Click "Light" theme
    await page.getByRole('button', { name: 'Light' }).click()

    // Save should now be enabled
    await expect(saveButton).toBeEnabled()

    // Light should now be pressed
    await expect(
      page.getByRole('button', { name: 'Light' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.getByRole('button', { name: 'Dark' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  test('toggling notification sound enables the save button', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: 'Save Preferences' })
    await expect(saveButton).toBeDisabled()

    // Toggle the notification sound off
    await page.getByRole('switch', { name: 'Notification sound' }).click()

    // Save should be enabled
    await expect(saveButton).toBeEnabled()

    // Switch should now be unchecked
    await expect(
      page.getByRole('switch', { name: 'Notification sound' }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  test('toggling desktop notifications enables the save button', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: 'Save Preferences' })
    await expect(saveButton).toBeDisabled()

    // Toggle desktop notifications off
    await page.getByRole('switch', { name: 'Desktop notifications' }).click()

    // Save should be enabled
    await expect(saveButton).toBeEnabled()

    // Switch should now be unchecked
    await expect(
      page.getByRole('switch', { name: 'Desktop notifications' }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  test('reverting a change disables the save button again', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: 'Save Preferences' })

    // Change theme to light
    await page.getByRole('button', { name: 'Light' }).click()
    await expect(saveButton).toBeEnabled()

    // Revert back to dark
    await page.getByRole('button', { name: 'Dark' }).click()
    await expect(saveButton).toBeDisabled()
  })
})
