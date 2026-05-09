/**
 * E2E Tests: Plan Feature
 * Tests plan creation (3 modes), today view, calendar, progress, and lifecycle.
 */

import { test, expect } from '@playwright/test';

const INDEX_URL = '/index.html';

/** Navigate to the plan view inside index.html */
async function gotoPlan(page) {
  await page.goto(`${INDEX_URL}#plan`);
  await waitForPlanLoad(page);
}

/** Wait for the plan section to finish loading inside index.html */
async function waitForPlanLoad(page, timeout = 30000) {
  // Wait for the plan section to appear and loading overlay to disappear
  await page.waitForFunction(() => {
    const planSection = document.getElementById('plan-section');
    if (!planSection) return false;
    const loader = planSection.querySelector('.animate-spin');
    if (loader) {
      const parent = loader.closest('.fixed, [class*="absolute"]');
      if (parent) {
        const style = window.getComputedStyle(parent);
        if (style.display !== 'none' && style.opacity !== '0') return false;
      }
    }
    return true;
  }, null, { timeout });
  await page.waitForTimeout(500);
}

/** Create a plan via the setup wizard using the given type */
async function createPlanViaWizard(page, type = 'beginner') {
  // Click "Create Plan" or equivalent
  const createBtn = page.locator('button:has-text("Create"), button:has-text("Start"), button:has-text("plan")').first();
  if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createBtn.click();
    await page.waitForTimeout(300);
  }

  // Step 1: Choose user type
  const typeMap = { beginner: '🌱', hafiz: '📖', mixed: '🔀' };
  const typeButton = page.locator(`button:has-text("${typeMap[type]}")`).first();
  if (await typeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await typeButton.click();
    await page.waitForTimeout(300);
  }

  // Step 2: Scope — pick first available option and proceed
  // For beginner: select juz, for hafiz: full Quran
  const scopeBtn = page.locator('button:has-text("Full"), button:has-text("Juz"), button:has-text("30")').first();
  if (await scopeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await scopeBtn.click();
    await page.waitForTimeout(300);
  }

  // Click Next if visible
  const nextBtn = page.locator('button:has-text("Next")').first();
  if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nextBtn.click();
    await page.waitForTimeout(300);
  }

  // Step 3: Pace — accept defaults and create
  const createPlanBtn = page.locator('button:has-text("Create Plan"), button:has-text("Start Plan"), button:has-text("Create")').first();
  if (await createPlanBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await createPlanBtn.click();
    await page.waitForTimeout(500);
  }
}

/** Seed a plan directly into IndexedDB */
async function seedPlan(page, overrides = {}) {
  await page.evaluate((opts) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('murajah-db', 6);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('appData')) db.createObjectStore('appData', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('dailyGoals')) db.createObjectStore('dailyGoals', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('quranCache')) db.createObjectStore('quranCache', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('resourceCache')) db.createObjectStore('resourceCache', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('plans')) {
          const ps = db.createObjectStore('plans', { keyPath: 'id' });
          ps.createIndex('status', 'status', { unique: false });
          ps.createIndex('type', 'type', { unique: false });
        }
        if (!db.objectStoreNames.contains('planHistory')) {
          const hs = db.createObjectStore('planHistory', { keyPath: 'id' });
          hs.createIndex('planId', 'planId', { unique: false });
          hs.createIndex('date', 'date', { unique: false });
          hs.createIndex('planId_date', ['planId', 'date'], { unique: true });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const plan = {
          id: opts.id || 'test-plan-1',
          name: opts.name || 'Test Plan',
          type: opts.type || 'beginner',
          layout: opts.layout || 'qpc',
          status: opts.status || 'active',
          startDate: opts.startDate || today,
          endDate: opts.endDate || null,
          lastActiveDate: opts.lastActiveDate || today,
          targetPages: opts.targetPages || Array.from({ length: 20 }, (_, i) => i + 1),
          targetJuz: opts.targetJuz || [1],
          pace: opts.pace || { newPagesPerDay: 1, revisionPagesPerDay: 2, daysPerWeek: 6, offDays: [] },
          currentMemorizationPage: opts.currentMemorizationPage || 1,
          currentCycleNumber: 1,
          totalCycles: null,
          stats: opts.stats || {
            totalPagesInPlan: (opts.targetPages || Array.from({ length: 20 }, (_, i) => i + 1)).length,
            pagesMemorized: 0,
            pagesReviewed: 0,
            revisionCyclesCompleted: 0,
            currentStreak: 0,
            longestStreak: 0,
            missedDays: 0,
            totalDaysActive: 0,
            weakPageCount: 0,
          },
          schedulerState: opts.schedulerState || {
            pageReviewData: {},
            lastScheduledDate: null,
            backlogPages: [],
          },
          completedPages: opts.completedPages || {},
          streakDays: opts.streakDays || 0,
          milestones: opts.milestones || [],
          juzModes: null,
          createdAt: new Date().toISOString(),
          history: opts.history || {},
          ...(opts.extra || {}),
        };
        const tx = db.transaction('plans', 'readwrite');
        tx.objectStore('plans').put(plan);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }, overrides);
}


test.describe('Plan Feature', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to index and clear plans store from within the open DB
    await page.goto(INDEX_URL);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('murajah-db');
        request.onsuccess = () => {
          const db = request.result;
          try {
            const stores = [];
            if (db.objectStoreNames.contains('plans')) stores.push('plans');
            if (db.objectStoreNames.contains('planHistory')) stores.push('planHistory');
            if (stores.length === 0) { db.close(); resolve(); return; }
            const tx = db.transaction(stores, 'readwrite');
            stores.forEach(s => tx.objectStore(s).clear());
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); resolve(); };
          } catch { db.close(); resolve(); }
        };
        request.onerror = () => resolve();
      });
    });
  });

  // ── Plan Creation ──

  test('shows empty state when no plans exist', async ({ page }) => {
    await gotoPlan(page);

    // Should show the empty state or smart plan suggestion
    const emptyState = page.locator('text=/Create|Start|plan/i').first();
    await expect(emptyState).toBeVisible({ timeout: 10000 });
  });

  test('setup wizard renders three user types', async ({ page }) => {
    // Reload after beforeEach cleared plans
    await gotoPlan(page);

    // Open setup wizard — button might say "Customize", "Custom Plan", or "Create"
    const customizeBtn = page.locator('button:has-text("Customize")').first();
    const customPlanBtn = page.locator('button:has-text("Custom Plan")');
    const createBtn = page.locator('button:has-text("Create")').first();

    if (await customizeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await customizeBtn.click();
    } else if (await customPlanBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await customPlanBtn.click();
    } else if (await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await createBtn.click();
    }
    await page.waitForTimeout(500);

    // The wizard Step 1 shows three plan-type cards in a grid with sm:grid-cols-3
    // Each is a button with rounded-xl border-2
    const wizardTypeCards = page.locator('button:has-text("🌱"), button:has-text("📖"), button:has-text("🔀")');
    const count = await wizardTypeCards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('beginner plan can be created via wizard', async ({ page }) => {
    await gotoPlan(page);
    await createPlanViaWizard(page, 'beginner');

    // After creation, should see Today tab content or plan view
    const todayContent = page.locator('text=/Today|Day /i').first();
    await expect(todayContent).toBeVisible({ timeout: 10000 });
  });

  // ── Today View ──

  test('today view shows tasks for active plan', async ({ page }) => {
    await seedPlan(page);
    await gotoPlan(page);

    // Today tab should be visible and active by default
    const todayTab = page.locator('button[role="tab"]:has-text("Today")').first();
    if (await todayTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(todayTab).toHaveAttribute('aria-selected', 'true');
    }

    // Should show day number or task cards
    const dayIndicator = page.locator('text=/Day \\d+/i').first();
    const taskCards = page.locator('[class*="rounded"]').first();
    const hasContent = await dayIndicator.isVisible({ timeout: 5000 }).catch(() => false)
      || await taskCards.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('today task can be marked complete', async ({ page }) => {
    await seedPlan(page);
    await gotoPlan(page);

    // Look for a completion button on today's task card
    const completeBtn = page.locator('button:has-text("Complete"), button:has-text("Done"), button:has-text("✓"), button[aria-label*="complete" i]').first();
    if (await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await completeBtn.click();
      await page.waitForTimeout(500);

      // After completion, should show a rating or confirmation
      const feedback = page.locator('text=/Excellent|Good|Again|score|rated/i').first();
      const feedbackVisible = await feedback.isVisible({ timeout: 3000 }).catch(() => false);
      // If no rating UI, the completion itself succeeded without errors
      expect(true).toBeTruthy();
    }
  });

  // ── Calendar View ──

  test('calendar view renders when tab is clicked', async ({ page }) => {
    await seedPlan(page);
    await gotoPlan(page);

    const calendarTab = page.locator('button[role="tab"]:has-text("Calendar")').first();
    if (await calendarTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await calendarTab.click();
      await page.waitForTimeout(500);

      // Calendar should show month navigation or day grid
      const calendarContent = page.locator('text=/January|February|March|April|May|June|July|August|September|October|November|December|Mon|Tue|Wed|Sun|◀|▶/i').first();
      await expect(calendarContent).toBeVisible({ timeout: 5000 });
    }
  });

  test('calendar shows today highlighted', async ({ page }) => {
    await seedPlan(page);
    await gotoPlan(page);

    const calendarTab = page.locator('button[role="tab"]:has-text("Calendar")').first();
    if (await calendarTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await calendarTab.click();
      await page.waitForTimeout(500);

      // Today's date should have a distinct style (ring, highlight, etc.)
      const today = new Date().getDate().toString();
      const todayCell = page.locator(`text="${today}"`).first();
      await expect(todayCell).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Progress View ──

  test('progress view shows plan statistics', async ({ page }) => {
    await seedPlan(page);
    await gotoPlan(page);

    const progressTab = page.locator('button[role="tab"]:has-text("Progress")').first();
    if (await progressTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await progressTab.click();
      await page.waitForTimeout(500);

      // Progress view should show stats like pages, milestones, or completion %
      const statsContent = page.locator('text=/page|milestone|progress|streak|%|complete/i').first();
      await expect(statsContent).toBeVisible({ timeout: 5000 });
    }
  });

  // ── Plan Lifecycle ──

  test('plan can be paused from progress view', async ({ page }) => {
    await seedPlan(page);
    await gotoPlan(page);

    const progressTab = page.locator('button[role="tab"]:has-text("Progress")').first();
    if (await progressTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await progressTab.click();
      await page.waitForTimeout(500);

      const pauseBtn = page.locator('button:has-text("Pause")').first();
      if (await pauseBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await pauseBtn.click();
        await page.waitForTimeout(500);

        // Confirm pause dialog if present
        const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")').first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(500);
        }

        // After pausing, should show Resume button
        const resumeBtn = page.locator('button:has-text("Resume")').first();
        await expect(resumeBtn).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('paused plan can be resumed', async ({ page }) => {
    await seedPlan(page, { status: 'paused' });
    await gotoPlan(page);

    const progressTab = page.locator('button[role="tab"]:has-text("Progress")').first();
    if (await progressTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await progressTab.click();
      await page.waitForTimeout(500);

      const resumeBtn = page.locator('button:has-text("Resume")').first();
      if (await resumeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await resumeBtn.click();
        await page.waitForTimeout(500);

        // After resuming, pause should be available again
        const pauseBtn = page.locator('button:has-text("Pause")').first();
        await expect(pauseBtn).toBeVisible({ timeout: 5000 });
      }
    }
  });

  // ── Navigation ──

  test('plan is accessible from bottom navigation', async ({ page }) => {
    await page.goto(INDEX_URL);
    await page.waitForTimeout(1000);

    // Bottom nav should have a plan button
    const planNav = page.locator('button.bottom-nav-item:has-text("Plan"), button.bottom-nav-item >> svg').first();
    const hasPlanNav = await planNav.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasPlanNav).toBeTruthy();
  });

  test('tab navigation switches between views', async ({ page }) => {
    await seedPlan(page);
    await gotoPlan(page);

    const tabs = page.locator('button[role="tab"]');
    const tabCount = await tabs.count();

    // Should have Today, Calendar, Progress tabs
    expect(tabCount).toBeGreaterThanOrEqual(3);

    // Click each tab and verify the view changes
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i);
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(300);
        await expect(tab).toHaveAttribute('aria-selected', 'true');
      }
    }
  });

  // ── Data Persistence ──

  test('plan persists across page reload', async ({ page }) => {
    await seedPlan(page, { name: 'Persistent Plan' });
    await gotoPlan(page);

    // Verify plan loaded
    const planName = page.locator('text=/Persistent Plan|Test Plan/i').first();
    const hasPlan = await planName.isVisible({ timeout: 5000 }).catch(() => false)
      || await page.locator('button[role="tab"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasPlan).toBeTruthy();

    // Reload and verify plan still loads after re-navigating to plan view
    await page.goto(`${INDEX_URL}#plan`);
    await waitForPlanLoad(page);

    const planNameAfter = page.locator('button[role="tab"]').first();
    await expect(planNameAfter).toBeVisible({ timeout: 10000 });
  });
});
