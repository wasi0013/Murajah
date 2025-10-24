# Streak Bug Debugging Guide

## Issue Description
- **Yesterday (2025-10-23)**: User completes all daily goals → streak becomes 1
- **Today (2025-10-24)**: Page loads → streak shows 0 (BUG - should show 1)
- **Today**: User completes all daily goals → streak becomes 2 (correct)

## Debug Statements Added

### 1. `calculateStreak()` function in `dailyGoalsManager.js`

**File**: `/Volumes/Main/personal_projects/Murajah/source/resources/js/utils/dailyGoalsManager.js`

**Debug Points**:
- Function entry logging showing:
  - `dailyGoalHistory` length
  - `selectedTasks` array and its type
  
- For each day in history:
  - Day date
  - Task names in that goal
  - For each task: whether it's selected, whether it's complete, whether it's counted
  - Cumulative streak count
  
- Final calculations showing:
  - Comparison of last completed date vs today/yesterday
  - Whether streak is broken or continues
  - Final streak values

**Key Output to Look For**:
```
[calculateStreak] CALLED with:
[calculateStreak]   - dailyGoalHistory length: X
[calculateStreak]   - selectedTasks: [...]
[calculateStreak] Processing 2025-10-23:
[calculateStreak]     - taskName: isSelected=true/false, isComplete=true/false
[calculateStreak] Last completed date: 2025-10-23, Today: 2025-10-24, Yesterday: 2025-10-23
```

### 2. `initializeDailyGoals()` in `index.html`

**File**: `/Volumes/Main/personal_projects/Murajah/source/index.html` (lines ~2580-2610)

**Debug Points**:
- History loading:
  - Number of goals loaded
  - Dates of all loaded goals
  - `selectedTasks` before streak calculation
  
- Streak calculation:
  - Before: shows goals in history
  - After: shows final streak values

**Key Output to Look For**:
```
[Murajah] Loaded history - count: X dates: 2025-10-23, ...
[Murajah] selectedTasks for streak calculation: [...]
[Murajah] About to calculate streak with: X goals in history
[Murajah] Streak calculation result - current: Y longest: Z
```

### 3. `completeTaskGoal()` in `index.html`

**File**: `/Volumes/Main/personal_projects/Murajah/source/index.html` (lines ~2710-2740)

**Debug Points**:
- Task name being completed
- History before/after updating today's goal
- History dates before recalculation
- Streak after recalculation

**Key Output to Look For**:
```
[Murajah] Completing task: taskName
[Murajah] Before update - history length: X, dates: ...
[Murajah] After filtering today - history length: Y
[Murajah] After adding today's goal - history length: Z, dates: ...
[Murajah] Streak recalculated after task completion - current: A, longest: B
```

### 4. `uncompleteTaskGoal()` in `index.html`

**File**: `/Volumes/Main/personal_projects/Murajah/source/index.html` (lines ~2776-2800)

**Debug Points**:
- Similar to `completeTaskGoal()` for task uncompleting

## How to Debug

1. **Open Browser Console** (F12 → Console tab)

2. **Reload the page on Oct 24** (today) and look for:
   ```
   [calculateStreak] Processing 2025-10-23:
   [calculateStreak]     - task1: isSelected=?, isComplete=?
   [calculateStreak]     - task2: isSelected=?, isComplete=?
   ```
   
   **Critical Question**: Are yesterday's tasks showing as `isComplete=true` and `isSelected=true`?

3. **Check the selectedTasks**:
   ```
   [calculateStreak] selectedTasks: [...]
   ```
   
   **Critical Question**: Does it match the task names in yesterday's goal?

4. **Check date comparison**:
   ```
   [calculateStreak] Last completed date: 2025-10-23, Today: 2025-10-24, Yesterday: 2025-10-23
   ```
   
   **Critical Question**: Is `isYesterday=true`? If yes, streak should continue!

## Hypothesis to Test

**Problem**: Yesterday's tasks might not be marked as `completed: true` in the database.

**Solution**: Check if `completeTask()` is properly persisting the `completed` flag to IndexedDB.

**Or**: The `selectedTasks` might be empty or different between yesterday and today.

**Or**: The date format mismatch - yesterday's date in history might not match the calculated "yesterday" date.

## Next Steps After Debugging

Once you see the console logs:
1. Share the full output of `[calculateStreak]` logs
2. Let me know what's in `selectedTasks`
3. Tell me if yesterday's tasks show as `isComplete=true`
4. Share the exact dates being compared

This will help identify the exact root cause!
