import { expect, type Page } from '@playwright/test'

/** Open the reader controls bottom sheet (where layout/tajweed/wbw/etc. live). */
export async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Reader settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Reader settings' })).toBeVisible()
}

/** Close the controls sheet (so the reading surface can be tapped/measured). */
export async function closeSettings(page: Page) {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Reader settings' })).toBeHidden()
}
