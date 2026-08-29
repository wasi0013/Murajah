import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// App settings surface (Phase 9.4). Reached from the reader's "More" tab; owns
// the colour theme, which is applied to <html data-theme> and persisted to
// IndexedDB so it survives a reload.

test('the More tab opens Settings', async ({ page }) => {
  // "More" is a mobile-only affordance — desktop unpacks it as an inline rail tab.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  await sheet.getByRole('button', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
})

test('choosing a theme paints the document and persists across reload', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })

  const html = page.locator('html')
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')

  // The pref write is fire-and-forget; let it commit before reload aborts the
  // pending IndexedDB transaction (else the restore reads the old value).
  await page.waitForTimeout(300)
  await page.reload()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
})

test('progress-tracking toggles: on by default, and turning one off persists across reload', async ({
  page,
}) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })

  const hasanah = page.getByRole('switch', { name: 'Total Hasanah' })
  const readingTime = page.getByRole('switch', { name: 'Reading time' })
  const listeningTime = page.getByRole('switch', { name: 'Listening time' })
  await expect(hasanah).toHaveAttribute('aria-checked', 'true')
  await expect(readingTime).toHaveAttribute('aria-checked', 'true')
  await expect(listeningTime).toHaveAttribute('aria-checked', 'true')

  // Turning OFF must survive a reload — asserting only that the default ON
  // state is stable would also pass a broken (truthiness-gated) hydrate().
  await readingTime.click()
  await expect(readingTime).toHaveAttribute('aria-checked', 'false')
  await page.waitForTimeout(300) // let the fire-and-forget pref write commit
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByRole('switch', { name: 'Reading time' })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  // The other two are untouched.
  await expect(page.getByRole('switch', { name: 'Total Hasanah' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('switch', { name: 'Listening time' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('the back button returns to the reader', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Back to reader' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('export then import restores state, and junk is rejected', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  const html = page.locator('html')

  // Establish a distinctive state (Dark theme) and export it to a file.
  await page.getByRole('radio', { name: 'Dark' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ])
  const file = await download.path()

  // Move state away from the backup so a restore is observable.
  await page.getByRole('radio', { name: 'Light' }).click()
  await expect(html).toHaveAttribute('data-theme', 'light')

  // Junk import: a clear error, no confirm dialog, and data left intact.
  await page.locator('input[type=file]').setInputFiles({
    name: 'junk.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not json'),
  })
  await expect(page.getByText('This file is not valid JSON.')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Import backup' })).toHaveCount(0)
  await expect(html).toHaveAttribute('data-theme', 'light')

  // Real import: confirm the replace, then the reload restores Dark.
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByRole('button', { name: 'Replace data' }).click()
  await expect(html).toHaveAttribute('data-theme', 'dark', { timeout: 10_000 })
})

test('choosing Arabic flips the document to RTL and persists', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  const html = page.locator('html')
  await expect(html).toHaveAttribute('dir', 'ltr')

  await page.getByRole('radio', { name: 'العربية' }).click()
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(html).toHaveAttribute('lang', 'ar')
  // The interface re-renders in Arabic without a reload.
  await expect(page.getByRole('heading', { name: 'الإعدادات', level: 1 })).toBeVisible()

  // The choice survives a reload (loaded from IndexedDB before paint).
  await page.waitForTimeout(300) // let the fire-and-forget pref write commit
  await page.reload()
  await expect(html).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', { name: 'الإعدادات', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
})

test('danger zone: clear cache requires confirmation, wipes the cache, and never touches memorization data', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Danger zone' })).toBeVisible()

  // Seed some "memorization progress" so we can prove it survives.
  await page.evaluate(async () => {
    const req = indexedDB.open('murajah-userdata', 1)
    await new Promise<void>((resolve, reject) => {
      req.onupgradeneeded = () => req.result.createObjectStore('data')
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction('data', 'readwrite')
        tx.objectStore('data').put({ sentinel: 'keep-me' }, 'progress')
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
  })

  await page.getByRole('button', { name: 'Clear cache' }).click()
  await expect(page.getByRole('heading', { name: 'Clear the cache?' })).toBeVisible()

  // Cancel first — must not clear anything.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Clear the cache?' })).not.toBeVisible()

  await page.getByRole('button', { name: 'Clear cache' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Clear cache' }).click()
  await expect(page.getByText('Cache cleared')).toBeVisible()

  await page.waitForURL('**/settings', { timeout: 5_000 })
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })

  const progress = await page.evaluate(async () => {
    const req = indexedDB.open('murajah-userdata')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction('data', 'readonly')
    const value = await new Promise<unknown>((resolve, reject) => {
      const r = tx.objectStore('data').get('progress')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    db.close()
    return value
  })
  expect(progress).toEqual({ sentinel: 'keep-me' })
})

test('danger zone: has a link to join the Discord community', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 10_000 })
  const link = page.locator('section', { hasText: 'Danger zone' }).getByRole('link', { name: 'Discord' })
  await expect(link).toHaveAttribute('href', /discord\.gg/)
  await expect(link).toHaveAttribute('target', '_blank')
})

test('has no serious a11y violations', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({
    timeout: 10_000,
  })
  await page.waitForTimeout(300)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([])
})
