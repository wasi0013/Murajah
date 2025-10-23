# Daily Goals Persistence Fix - Verification Guide

## Issues Fixed

### ✅ Issue 1: Goal History Not Persisting to IndexedDB
**Problem:** When user completed a daily task, the goal history was updated in memory but never saved to IndexedDB. On page refresh, all changes were lost.

**Solution Applied:**
- Updated `completeTaskGoal()` to explicitly loop through goalHistory and save each goal to IndexedDB
- Updated `uncompleteTaskGoal()` to explicitly loop through goalHistory and save each goal to IndexedDB
- Both functions now call `murajahDB.saveDailyGoal(goal)` for each goal in history

**Code Pattern:**
```javascript
// After updating goalHistory in memory:
try {
  for (const goal of dailyGoalsStore.goalHistory) {
    await murajahDB.saveDailyGoal(goal);
  }
  console.log('[Murajah] Goal history persisted to IndexedDB');
} catch (error) {
  console.error('[Murajah] Failed to persist goal history:', error);
}
```

---

### ✅ Issue 2: getDayStatus Using Current selectedTasks Instead of Historical
**Problem:** `getDayStatus()` was comparing task completion against `dailyGoalsStore.selectedTasks.length` (the CURRENT user settings). When user changed settings (added/removed tasks), historical goals would change their status retroactively.

Example:
- Day 1: User creates goal with 3 tasks selected (recordRandomPage, reviewRange, memorizeDaily)
- User completes 2 out of 3 tasks → Status = 'partial'
- Later: User removes reviewRange from settings (now 2 tasks selected)
- Page refresh: Day 1 now shows 'complete' because 2/2 completed (using current settings, not historical)

**Solution Applied:**
- Modified `getDayStatus()` to compare task completion against the NUMBER OF TASKS CREATED THAT DAY
- For today: `const totalTasksForToday = Object.values(dailyGoalsStore.todayGoal.tasks).length`
- For history: `const totalTasksForDay = Object.values(goal.tasks).length`
- This uses the actual task objects in each goal, not the current selectedTasks list

**Code Pattern:**
```javascript
const getDayStatus = (date) => {
  // ... for today ...
  const tasks = Object.values(dailyGoalsStore.todayGoal.tasks);
  const totalTasksForToday = tasks.length;  // ← Historical task count
  const completedCount = tasks.filter(t => t.completed).length;
  
  // ... for history ...
  const tasks = Object.values(goal.tasks);
  const totalTasksForDay = tasks.length;  // ← Historical task count
  const completedCount = tasks.filter(t => t.completed).length;
}
```

---

### ✅ Issue 3: Today's Goal Not Included in History for Streak Calculation
**Problem:** In `initializeDailyGoals()`, streak was calculated using only goalHistory, but today's goal wasn't necessarily in that history. This could cause streak calculation to be off by 1 on the first load.

**Solution Applied:**
- After loading goalHistory from IndexedDB, check if today's goal is already in history
- If not present, add today's goal to history before streak calculation
- This ensures streak calculation always includes today's contribution

**Code Pattern:**
```javascript
// Ensure today's goal is in goalHistory for streak calculation
const todayDate = getTodayDate();
const todayInHistory = dailyGoalsStore.goalHistory.find(g => g.date === todayDate);
if (!todayInHistory && dailyGoalsStore.todayGoal) {
  dailyGoalsStore.goalHistory.push(JSON.parse(JSON.stringify(dailyGoalsStore.todayGoal)));
  console.log('[Murajah] Added today\'s goal to history for streak calculation');
}

// Now calculate streak with complete history
const streakInfo = calculateStreak(dailyGoalsStore.goalHistory, dailyGoalsStore.selectedTasks);
```

---

## Testing Checklist

### Test 1: Basic Task Completion Persistence
- [ ] Load the app
- [ ] Complete a daily task
- [ ] Check browser console - should see: "[Murajah] Goal history persisted to IndexedDB"
- [ ] Refresh the page
- [ ] Verify: The task remains completed
- [ ] Verify: The contribution graph still shows the same status for today

### Test 2: Task Uncomplete Persistence
- [ ] Complete a task
- [ ] Refresh page (confirm it persists)
- [ ] Uncomplete the task
- [ ] Check console: Should see: "[Murajah] Goal history persisted to IndexedDB"
- [ ] Refresh page
- [ ] Verify: The task is now incomplete again

### Test 3: Contribution Graph Stability
- [ ] Complete multiple tasks over several days (or mock historical data)
- [ ] Take screenshot of 365-day contribution graph
- [ ] Refresh page multiple times
- [ ] Verify: Graph remains identical after each refresh
- [ ] Verify: No gaps or disappearing colored blocks

### Test 4: Settings Change Doesn't Break History
- [ ] Navigate to settings
- [ ] Look at current task selection (e.g., 3 tasks selected)
- [ ] Complete 2 out of 3 tasks today
- [ ] Take screenshot showing goal status
- [ ] Go back to settings and REMOVE one task
- [ ] Navigate back to daily goals
- [ ] Verify: Today's goal status remains 'partial' (still 2 out of 3)
- [ ] Refresh page
- [ ] Verify: Today's goal status is STILL 'partial' (not changed to 'complete')

### Test 5: Historical Goals Not Affected by Settings Changes
- [ ] Go back several days in history
- [ ] Look at an old day's goal status
- [ ] Go to settings and change task selection significantly
- [ ] Navigate back to daily goals
- [ ] Verify: Old day's goal status remains unchanged
- [ ] Verify: Contribution graph shows same colors for old days

### Test 6: Streak Calculation Accuracy
- [ ] Complete several consecutive days of goals
- [ ] Note the streak count displayed
- [ ] Refresh page
- [ ] Verify: Streak count is the same
- [ ] On an incomplete day, verify streak resets
- [ ] Refresh and verify: Streak reset persists

### Test 7: New Day Initialization
- [ ] Complete all tasks today
- [ ] Manually change system clock to tomorrow (or wait)
- [ ] Refresh app
- [ ] Verify: New day shows new tasks (from current settings)
- [ ] Verify: Yesterday's goal with different tasks remains correct in history
- [ ] Verify: Contribution graph shows yesterday with its original status

---

## Console Logs to Watch For

When fixes are working correctly, you should see these logs:

```
[Murajah] Daily goals initialized - Streak: X
[Murajah] Added today's goal to history for streak calculation
[Murajah] Goal history persisted to IndexedDB
```

When tasks are completed/uncompleted:
```
[Murajah] Task 'taskName' completed with metadata: {...}
[Murajah] Goal history persisted to IndexedDB
```

---

## Architecture Changes Made

### Data Flow for Persistence

**Before:**
```
completeTask() → update goalHistory in memory → ❌ No IndexedDB save
```

**After:**
```
completeTask() 
  → update goalHistory in memory 
  → loop through goalHistory 
  → await murajahDB.saveDailyGoal(goal) for EACH goal ✅
```

### Goal Status Comparison

**Before:**
```
const completedCount = tasks.filter(t => t.completed).length
const totalSelected = dailyGoalsStore.selectedTasks.length ❌ Uses CURRENT settings
return completedCount === totalSelected ? 'complete' : ...
```

**After:**
```
const tasks = Object.values(goal.tasks)
const totalTasksForDay = tasks.length ✅ Uses HISTORICAL task count
const completedCount = tasks.filter(t => t.completed).length
return completedCount === totalTasksForDay ? 'complete' : ...
```

### Streak Calculation

**Before:**
```
initializeDailyGoals() 
  → load goalHistory
  → calculateStreak(goalHistory) ❌ Today's goal may not be in history
```

**After:**
```
initializeDailyGoals() 
  → load goalHistory
  → check if today in history
  → if not, add today to history ✅
  → calculateStreak(goalHistory with today included)
```

---

## Files Modified

- `/Volumes/Main/personal_projects/Murajah/source/index.html`
  - `completeTaskGoal()` - Added IndexedDB persistence
  - `uncompleteTaskGoal()` - Added IndexedDB persistence  
  - `getDayStatus()` - Changed to use historical task count
  - `initializeDailyGoals()` - Added today's goal to history before streak calc

---

## Expected Behavior After Fix

1. ✅ User completes a task → contribution graph updates with colored block
2. ✅ User refreshes page → task remains completed, colored block remains
3. ✅ User changes settings (add/remove tasks) → historical goal status doesn't change
4. ✅ Contribution graph shows 365-day history with accurate status for each day
5. ✅ Graph doesn't disappear on page refresh
6. ✅ Streak count persists across sessions
7. ✅ New tasks added to new day, old tasks remain in history

---

## Troubleshooting

**If contribution graph is disappearing:**
- Check browser console for IndexedDB errors
- Verify `murajahDB.saveDailyGoal()` is being called (watch for console logs)
- Check that goal structure matches IndexedDB schema

**If goal status is incorrect after settings change:**
- Verify `getDayStatus()` is using `Object.values(goal.tasks).length` 
- Not using `dailyGoalsStore.selectedTasks.length`
- Settings changes should NOT affect historical goal interpretation

**If streak count is wrong:**
- Verify today's goal is being added to history in `initializeDailyGoals()`
- Check console for: "[Murajah] Added today's goal to history for streak calculation"
- Verify `calculateStreak()` function receives complete history including today

---

## Next Steps If Issues Persist

1. Add detailed logging in `calculateStreak()` to show which days are counted
2. Add data export feature to inspect raw IndexedDB data
3. Verify IndexedDB schema migration if upgrading from older app version
4. Check for race conditions between multiple async IndexedDB calls
5. Consider adding data validation layer before saving to IndexedDB

