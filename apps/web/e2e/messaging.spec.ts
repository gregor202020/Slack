import { test, expect } from '@playwright/test'
import { loginAsUser, MOCK_CHANNELS, MOCK_MESSAGES } from './helpers/auth'

test.describe('Messaging — Channel view', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)

    // Navigate to the first channel
    const firstChannel = MOCK_CHANNELS.data[0]
    await page.getByRole('button', { name: firstChannel.name }).click()
    await page.waitForURL(new RegExp(`/channels/${firstChannel.id}`))
  })

  test('message composer is visible in channel view', async ({ page }) => {
    // The composer textarea should be present
    const composer = page.getByPlaceholder('Type a message...')
    await expect(composer).toBeVisible()
  })

  test('can type a message in the composer', async ({ page }) => {
    const composer = page.getByPlaceholder('Type a message...')

    // Type a message
    await composer.fill('Low and slow, that is the way we go')

    // Verify the text is in the composer
    await expect(composer).toHaveValue('Low and slow, that is the way we go')
  })

  test('channel header shows channel name', async ({ page }) => {
    const firstChannel = MOCK_CHANNELS.data[0]

    // The header should display the channel name with a # prefix
    await expect(
      page.getByRole('heading', { name: `# ${firstChannel.name}` }),
    ).toBeVisible()
  })

  test('messages display in the message list area', async ({ page }) => {
    // Each mock message body should appear on the page
    for (const msg of MOCK_MESSAGES.data) {
      await expect(page.getByText(msg.body)).toBeVisible()
    }
  })
})
