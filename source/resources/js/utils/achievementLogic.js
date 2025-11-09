/**
 * Achievement Logic Utility
 * Handles all unlock condition checks and achievement evaluation
 */

/**
 * Check all unlock conditions for a specific badge
 * Returns true if conditions are met, false otherwise
 */
export const checkBadgeUnlock = (badge, stores) => {
  if (!badge || !badge.unlockCondition) {
    return false;
  }

  const condition = badge.unlockCondition;
  const type = condition.type;
  const threshold = condition.threshold;

  try {
    switch (type) {
      // ===== MEMORIZATION MILESTONES =====
      case 'memorizedPageCount':
        return stores.memorizedStore.memorizedPages.size >= threshold;

      // ===== STREAK-BASED CONDITIONS =====
      case 'streakDays':
        return stores.dailyGoalsStore.streak >= threshold;

      // ===== MISTAKES & CORRECTIONS =====
      case 'mistakesMarked': {
        let total = 0;
        stores.mistakesStore.mistakes.forEach(set => total += set.size);
        return total >= threshold;
      }

      // ===== RECORDING CONDITIONS =====
      case 'recordingsCount':
        return stores.audioStore.recordings.length >= threshold;

      // ===== PERFECT REVISIONS =====
      case 'perfectRevisions': {
        let perfectCount = 0;
        stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
          if (score >= 100) perfectCount++;
        });
        return perfectCount >= threshold;
      }

      // ===== SPECIAL CONDITIONS =====
      case 'perfectWeek':
        return isPerfectWeek(stores);

      case 'juzPerfect':
        return isAnyJuzPerfect(stores);

      case 'nightOwlRecording':
        return hasNightOwlRecording(stores);

      case 'marathonSession':
        return hasMarathonSession(stores);

      case 'fridayStreak':
        return hasFridayStreak(stores);

      case 'streakRecovery':
        return hasStreakRecovery(stores);

      case 'earlyMorningRecording':
        return hasEarlyMorningRecording(stores);

      case 'dailyTaskCompletion':
        return stores.dailyGoalsStore.streak > 0;

      case 'memorizationConsistency':
        return hasMemorizationConsistency(stores);

      case 'revisingDedication':
        return hasRevisingDedication(stores);

      case 'accuracyFocus':
        return hasAccuracyFocus(stores);

      case 'balancedLearning':
        return hasBalancedLearning(stores);

      case 'consecutiveNewMemorization':
        return hasConsecutiveNewMemorization(stores);

      case 'quickProgress':
        return hasQuickProgress(stores);

      case 'fajrTaskCompletion':
        return hasFajrTaskCompletion(stores);

      case 'memorizeNoMistakes':
        return hasMemoizeNoMistakes(stores);

      case 'consistentMistakeCorrection':
        return hasConsistentMistakeCorrection(stores);

      case 'lifecycleCompletion':
        return hasLifecycleCompletion(stores);

      case 'persistenceAfterMistakes':
        return hasPersistenceAfterMistakes(stores);

      case 'revisionStreak':
        return hasRevisionStreak(stores);

      case 'consistentDailyGoals':
        return hasConsistentDailyGoals(stores);

      case 'dedicationMilestone':
        return hasDedicationMilestone(stores);

      case 'masterAchievement':
        return hasMasterAchievement(stores);

      case 'recordingFrequency':
        return hasRecordingFrequency(stores);

      case 'firstAchievement':
        // This is handled separately when ANY badge is unlocked
        return true;

      case 'weekendConsistency':
        return hasWeekendConsistency(stores);

      case 'motivationStreak':
        return hasMotivationStreak(stores);

      case 'doubleStreak':
        return hasDoubleStreak(stores);

      case 'continuousLearning':
        return hasContinuousLearning(stores);

      case 'determinationMilestone':
        return hasDeterminationMilestone(stores);

      case 'faithfulJourney':
        return stores.dailyGoalsStore.streak >= 200;

      case 'unbrokenDevotion':
        return hasUnbrokenDevotion(stores);

      case 'ultimateTriumph':
        return hasUltimateTriumph(stores);

      case 'humilityInProgress':
        return hasHumilityInProgress(stores);

      case 'echoOfTruth':
        return hasEchoOfTruth(stores);

      case 'supremeMastery':
        return hasSupremeMastery(stores);

      // ===== NEW HADITH-BASED & STORY-BASED CONDITIONS =====
      case 'surahMemorization':
        return hasSurahMemorization(stores, condition);

      case 'surahPairMemorization':
        return hasSurahPairMemorization(stores, condition);

      case 'protectionTriad':
        return hasProtectionTriad(stores, condition);

      case 'verseMemorization':
        return hasVerseMemorization(stores, condition);

      case 'storyMemorization':
        return hasStoryMemorization(stores, condition);

      case 'fridayRecitationStreak':
        return hasFridayRecitationStreak(stores, condition);

      case 'dailyConsistency':
        return hasDailyConsistency(stores, condition);

      case 'revisionConsistency':
        return hasRevisionConsistency(stores, condition);

      case 'accuracyStreak':
        return hasAccuracyStreak(stores, condition);

      case 'balancedProgress':
        return hasBalancedProgress(stores, condition);

      case 'streakRecovery':
        return hasStreakRecoveryRebuilt(stores, condition);

      case 'mistakeLearning':
        return hasMistakeLearning(stores, condition);

      case 'protectorBadge':
        return hasProtectorBadge(stores, condition);

      case 'storyKeeper':
        return hasStoryKeeper(stores, condition);

      case 'discerningProgress':
        return hasDiscerningProgress(stores, condition);

      case 'fortressOfFaith':
        return hasFortressOfFaith(stores, condition);

      case 'faithfulGuardian':
        return hasFaithfulGuardian(stores, condition);

      case 'devotedPreserver':
        return hasDedicatedPreserver(stores, condition);

      case 'reverentMastery':
        return hasReverentMastery(stores, condition);

      case 'completeMaster':
        return hasCompleteMaster(stores, condition);

      case 'triumphantHeart':
        return hasTriumphantHeart(stores, condition);

      case 'manifestVictory':
        return hasManifestVictory(stores, condition);

      case 'cumulativeBlessing':
        return hasCumulativeBlessing(stores, condition);

      case 'echoOfDivine':
        return hasEchoOfDivine(stores, condition);

      case 'virtueEmbodied':
        return hasVirtueEmbodied(stores, condition);

      case 'inspiredJourney':
        return hasInspiredJourney(stores, condition);

      case 'prophetPath':
        return hasProphetPath(stores, condition);

      case 'hafizWithConsistency':
        return hasHafizWithConsistency(stores, condition);

      default:
        console.warn(`[Murajah] Unknown achievement condition type: ${type}`);
        return false;
    }
  } catch (error) {
    console.error(`[Murajah] Error checking badge condition (${type}):`, error);
    return false;
  }
};

// ===== SPECIAL CONDITION CHECKERS =====

function isPerfectWeek(stores) {
  if (!stores.dailyGoalsStore.todayGoal) return false;
  // Check if all tasks for today are complete AND streak is at least 7
  const tasks = Object.values(stores.dailyGoalsStore.todayGoal.tasks);
  const allComplete = tasks.every(t => t.completed);
  return allComplete && stores.dailyGoalsStore.streak >= 7;
}

function isAnyJuzPerfect(stores) {
  // Check if any Juz has all pages with perfect score (100+)
  const JUZ_RANGES = {
    1: [1, 21], 2: [22, 41], 3: [42, 61], 4: [62, 81], 5: [82, 101],
    6: [102, 121], 7: [122, 141], 8: [142, 161], 9: [162, 181], 10: [182, 201],
    11: [202, 221], 12: [222, 241], 13: [242, 261], 14: [262, 281], 15: [282, 301],
    16: [302, 321], 17: [322, 341], 18: [342, 361], 19: [362, 381], 20: [382, 401],
    21: [402, 421], 22: [422, 441], 23: [442, 461], 24: [462, 481], 25: [482, 501],
    26: [502, 521], 27: [522, 541], 28: [542, 561], 29: [562, 581], 30: [582, 604]
  };

  for (let juzNum = 1; juzNum <= 30; juzNum++) {
    const [start, end] = JUZ_RANGES[juzNum];
    let allPerfect = true;

    for (let pageNum = start; pageNum <= end; pageNum++) {
      const score = stores.perfectRevisionsStore.perfectRevisions.get(pageNum) || 0;
      if (score < 100) {
        allPerfect = false;
        break;
      }
    }

    if (allPerfect) {
      return true;
    }
  }

  return false;
}

function hasNightOwlRecording(stores) {
  if (stores.audioStore.recordings.length === 0) return false;
  
  const lastRecording = stores.audioStore.recordings[stores.audioStore.recordings.length - 1];
  if (!lastRecording.timestamp) return false;

  const date = new Date(lastRecording.timestamp);
  const hours = date.getHours();
  return hours >= 0 && hours < 5; // Midnight to 5 AM
}

function hasMarathonSession(stores) {
  // Check if 10 pages were memorized today
  // This would require tracking daily memorization, using dailyGoalsStore as proxy
  if (!stores.dailyGoalsStore.todayGoal) return false;
  const task = stores.dailyGoalsStore.todayGoal.tasks.memorizeDaily;
  return task && task.pagesAddedToday >= 10;
}

function hasFridayStreak(stores) {
  // Check if daily goals completed every Friday for 4 weeks
  // Simplified: check if streak > 28 and last update was on Friday
  if (stores.dailyGoalsStore.streak < 28) return false;
  
  const today = new Date();
  return today.getDay() === 5; // Friday
}

function hasStreakRecovery(stores) {
  // Check if there's a previous streak in history that was broken and then recovered
  // Simplified: check if longestStreak > current streak (indicating recovery from break)
  return stores.dailyGoalsStore.longestStreak > stores.dailyGoalsStore.streak &&
         stores.dailyGoalsStore.streak >= 5; // Recovered to at least 5 days
}

function hasEarlyMorningRecording(stores) {
  if (stores.audioStore.recordings.length === 0) return false;
  
  const lastRecording = stores.audioStore.recordings[stores.audioStore.recordings.length - 1];
  if (!lastRecording.timestamp) return false;

  const date = new Date(lastRecording.timestamp);
  const hours = date.getHours();
  return hours >= 5 && hours < 7; // 5 AM to 7 AM
}

function hasMemorizationConsistency(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if memorizeDaily task was active for 30 days
  let memorizeCount = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-30);
  
  for (const goal of recentGoals) {
    if (goal.tasks && goal.tasks.memorizeDaily) {
      memorizeCount++;
    }
  }
  
  return memorizeCount >= 30;
}

function hasRevisingDedication(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if reviewRange task completed for 30 consecutive days
  let reviewCount = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-30);
  
  for (const goal of recentGoals) {
    if (goal.tasks && goal.tasks.reviewRange && goal.tasks.reviewRange.completed) {
      reviewCount++;
    }
  }
  
  return reviewCount >= 30;
}

function hasAccuracyFocus(stores) {
  // Check if no mistakes on 5 pages for 7 consecutive days
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-7);
  if (recentGoals.length < 7) return false;

  for (const goal of recentGoals) {
    // Count pages with zero mistakes in this goal period
    let cleanPagesCount = 0;
    for (const [pageNum, mistakes] of stores.mistakesStore.mistakes) {
      if (stores.memorizedStore.memorizedPages.has(pageNum) && mistakes.size === 0) {
        cleanPagesCount++;
      }
    }
    if (cleanPagesCount < 5) return false;
  }

  return true;
}

function hasBalancedLearning(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if both memorizeDaily and reviewRange tasks were active for 14 days
  let balancedDays = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-14);
  
  for (const goal of recentGoals) {
    const hasMemorize = goal.tasks && goal.tasks.memorizeDaily;
    const hasReview = goal.tasks && goal.tasks.reviewRange;
    if (hasMemorize && hasReview) {
      balancedDays++;
    }
  }
  
  return balancedDays >= 14;
}

function hasConsecutiveNewMemorization(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if memorizeDaily task was active every day for 30 days
  let consecutiveDays = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-30);
  
  for (const goal of recentGoals) {
    if (goal.tasks && goal.tasks.memorizeDaily) {
      consecutiveDays++;
    } else {
      break; // Reset if broken
    }
  }
  
  return consecutiveDays >= 30;
}

function hasQuickProgress(stores) {
  if (!stores.dailyGoalsStore.goalHistory || stores.dailyGoalsStore.goalHistory.length < 30) {
    return false;
  }
  
  // Check if 50 pages memorized within first 30 days
  return stores.memorizedStore.memorizedPages.size >= 50;
}

function hasFajrTaskCompletion(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if tasks completed between 5-7 AM for 5 days (simplified)
  // Without exact timestamps, estimate via streak
  return stores.dailyGoalsStore.streak >= 5;
}

function hasMemoizeNoMistakes(stores) {
  if (stores.memorizedStore.memorizedPages.size < 10) return false;
  
  // Check if 10 memorized pages have zero mistakes
  let cleanPages = 0;
  for (const pageNum of stores.memorizedStore.memorizedPages) {
    const mistakes = stores.mistakesStore.mistakes.get(pageNum);
    if (!mistakes || mistakes.size === 0) {
      cleanPages++;
    }
  }
  
  return cleanPages >= 10;
}

function hasConsistentMistakeCorrection(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if mistakes were corrected daily for 14 days
  let correctionDays = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-14);
  
  for (const goal of recentGoals) {
    // Check if any tasks were completed (indicates active use)
    const completedTasks = Object.values(goal.tasks || {}).filter(t => t.completed).length;
    if (completedTasks > 0) {
      correctionDays++;
    }
  }
  
  return correctionDays >= 14;
}

function hasLifecycleCompletion(stores) {
  return stores.memorizedStore.memorizedPages.size === 604 &&
         stores.dailyGoalsStore.streak >= 30 &&
         hasCountPerfectRevisions(stores) >= 30;
}

function hasPersistenceAfterMistakes(stores) {
  // Check if 5+ mistakes corrected AND streak maintained for 7 days
  let totalMistakes = 0;
  stores.mistakesStore.mistakes.forEach(set => totalMistakes += set.size);
  
  return totalMistakes >= 5 && stores.dailyGoalsStore.streak >= 7;
}

function hasRevisionStreak(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  let reviewCount = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-14);
  
  for (const goal of recentGoals) {
    if (goal.tasks && goal.tasks.reviewRange && goal.tasks.reviewRange.completed) {
      reviewCount++;
    } else {
      break; // Reset on missed day
    }
  }
  
  return reviewCount >= 14;
}

function hasConsistentDailyGoals(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if 80%+ completion rate for 30 days
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-30);
  if (recentGoals.length < 30) return false;
  
  let completedGoals = 0;
  for (const goal of recentGoals) {
    const tasks = Object.values(goal.tasks || {});
    const completedTasks = tasks.filter(t => t.completed).length;
    if (tasks.length > 0 && (completedTasks / tasks.length) >= 0.8) {
      completedGoals++;
    }
  }
  
  return completedGoals >= 24; // 80% of 30 days
}

function hasDedicationMilestone(stores) {
  return stores.memorizedStore.memorizedPages.size >= 100 &&
         stores.dailyGoalsStore.streak >= 30;
}

function hasMasterAchievement(stores) {
  return stores.memorizedStore.memorizedPages.size >= 500 &&
         stores.dailyGoalsStore.streak >= 100 &&
         hasCountPerfectRevisions(stores) >= 50;
}

function hasRecordingFrequency(stores) {
  if (stores.audioStore.recordings.length < 10) return false;
  
  // Check if at least one recording in the last 3 days
  const now = Date.now();
  const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);
  
  for (const recording of stores.audioStore.recordings.slice(-10)) {
    if (recording.timestamp && recording.timestamp >= threeDaysAgo) {
      return true;
    }
  }
  
  return false;
}

function hasWeekendConsistency(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Simplified: check if streak covers multiple weeks
  return stores.dailyGoalsStore.streak >= 56; // 8 weeks
}

function hasMotivationStreak(stores) {
  // Check if achieved 60+ day streak after previously breaking a 30+ day streak
  return stores.dailyGoalsStore.streak >= 60 && stores.dailyGoalsStore.longestStreak >= 30;
}

function hasDoubleStreak(stores) {
  // Check if achieved two 50+ day streaks in one year (simplified)
  // This would need more detailed history tracking
  return stores.dailyGoalsStore.longestStreak >= 100;
}

function hasContinuousLearning(stores) {
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  // Check if both memorizeDaily and reviewRange completed for 30 days
  let balancedDays = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-30);
  
  for (const goal of recentGoals) {
    const hasMemorize = goal.tasks && goal.tasks.memorizeDaily && goal.tasks.memorizeDaily.completed;
    const hasReview = goal.tasks && goal.tasks.reviewRange && goal.tasks.reviewRange.completed;
    if (hasMemorize && hasReview) {
      balancedDays++;
    }
  }
  
  return balancedDays >= 30;
}

function hasDeterminationMilestone(stores) {
  return stores.memorizedStore.memorizedPages.size >= 200 &&
         stores.dailyGoalsStore.streak >= 50;
}

function hasUnbrokenDevotion(stores) {
  return stores.memorizedStore.memorizedPages.size >= 500 &&
         stores.dailyGoalsStore.streak >= 200;
}

function hasUltimateTriumph(stores) {
  return stores.memorizedStore.memorizedPages.size === 604 &&
         stores.dailyGoalsStore.streak >= 100 &&
         hasCountPerfectRevisions(stores) >= 50;
}

function hasHumilityInProgress(stores) {
  // Check if 5+ mistakes marked today (simplified)
  let totalMistakes = 0;
  stores.mistakesStore.mistakes.forEach(set => totalMistakes += set.size);
  return totalMistakes >= 5;
}

function hasEchoOfTruth(stores) {
  // Check if entire Quran has been recorded (simplified: 604+ recordings)
  return stores.audioStore.recordings.length >= 604;
}

function hasSupremeMastery(stores) {
  // This badge is unlocked when all other 99 badges are unlocked
  // Handled specially in achievementLogic
  return false;
}

function hasCountPerfectRevisions(stores) {
  let perfectCount = 0;
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectCount++;
  });
  return perfectCount;
}

// ===== NEW HADITH-BASED & STORY-BASED CONDITIONS =====

function hasSurahMemorization(stores, condition) {
  if (!condition.surahNumber) return false;
  // Get surah page ranges (e.g., Surah 2 is pages 1-50, etc.)
  const surahPageRanges = getSurahPageRanges();
  const [startPage, endPage] = surahPageRanges[condition.surahNumber] || [0, 0];
  
  for (let page = startPage; page <= endPage; page++) {
    if (!stores.memorizedStore.memorizedPages.has(page)) {
      return false;
    }
  }
  return true;
}

function hasSurahPairMemorization(stores, condition) {
  if (!condition.surahNumbers || condition.surahNumbers.length < 2) return false;
  
  const surahPageRanges = getSurahPageRanges();
  
  for (const surahNum of condition.surahNumbers) {
    const [startPage, endPage] = surahPageRanges[surahNum] || [0, 0];
    for (let page = startPage; page <= endPage; page++) {
      if (!stores.memorizedStore.memorizedPages.has(page)) {
        return false;
      }
    }
  }
  return true;
}

function hasProtectionTriad(stores, condition) {
  // Check if all three surahs (2, 3, 67) are memorized
  return hasSurahPairMemorization(stores, { surahNumbers: [2, 3, 67] });
}

function hasVerseMemorization(stores, condition) {
  if (!condition.verseRef) return false;
  // Extract surah and ayah from reference like "2:255"
  const [surahStr, ayahStr] = condition.verseRef.split(':');
  const surahNumber = parseInt(surahStr);
  
  const surahPageRanges = getSurahPageRanges();
  const [startPage, endPage] = surahPageRanges[surahNumber] || [0, 0];
  
  // Check if at least the surah is memorized (conservative approach)
  for (let page = startPage; page <= endPage; page++) {
    if (!stores.memorizedStore.memorizedPages.has(page)) {
      return false;
    }
  }
  return true;
}

function hasStoryMemorization(stores, condition) {
  // Map story names to surah ranges
  const storyRanges = {
    'Golden Calf': [[2, 2, 50], [7, 7, 150]],
    'Talut and Jalut': [[2, 2, 50]],
    'Pharaoh': [[7, 7, 160], [10, 10, 109], [20, 20, 135], [28, 28, 88]],
  };
  
  if (!storyRanges[condition.storyName]) return false;
  
  const surahPageRanges = getSurahPageRanges();
  const storySurahs = condition.surahRange || [];
  
  for (const surahNum of storySurahs) {
    const [startPage, endPage] = surahPageRanges[surahNum] || [0, 0];
    for (let page = startPage; page <= endPage; page++) {
      if (!stores.memorizedStore.memorizedPages.has(page)) {
        return false;
      }
    }
  }
  return true;
}

function hasFridayRecitationStreak(stores, condition) {
  // Simplified: check if user has recited surah at least 4 times
  // This would require more detailed tracking in stores
  return stores.dailyGoalsStore.streak >= (condition.days || 4) * 7;
}

function hasDailyConsistency(stores, condition) {
  if (!condition.days) return false;
  // Check if user has memorized at least 1 page daily for N days
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-condition.days);
  return recentGoals.length >= condition.days;
}

function hasRevisionConsistency(stores, condition) {
  if (!condition.days) return false;
  if (!stores.dailyGoalsStore.goalHistory) return false;
  
  let revisionDays = 0;
  const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-condition.days);
  
  for (const goal of recentGoals) {
    if (goal.tasks && goal.tasks.reviewRange && goal.tasks.reviewRange.completed) {
      revisionDays++;
    }
  }
  
  return revisionDays >= condition.days;
}

function hasAccuracyStreak(stores, condition) {
  if (!condition.perfectPages || !condition.consecutiveDays) return false;
  
  let perfectPageCount = 0;
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectPageCount++;
  });
  
  return perfectPageCount >= condition.perfectPages && 
         stores.dailyGoalsStore.streak >= condition.consecutiveDays;
}

function hasBalancedProgress(stores, condition) {
  if (!condition.newPages || !condition.revisionDays) return false;
  
  const memorized = stores.memorizedStore.memorizedPages.size;
  
  let revisionDays = 0;
  if (stores.dailyGoalsStore.goalHistory) {
    const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-condition.revisionDays);
    for (const goal of recentGoals) {
      if (goal.tasks && goal.tasks.reviewRange && goal.tasks.reviewRange.completed) {
        revisionDays++;
      }
    }
  }
  
  return memorized >= condition.newPages && revisionDays >= condition.revisionDays;
}

function hasStreakRecoveryRebuilt(stores, condition) {
  if (!condition.newStreak) return false;
  
  return stores.dailyGoalsStore.streak >= condition.newStreak &&
         stores.dailyGoalsStore.longestStreak > stores.dailyGoalsStore.streak;
}

function hasMistakeLearning(stores, condition) {
  if (!condition.pages || !condition.mistakesMarked) return false;
  
  const memorized = stores.memorizedStore.memorizedPages.size;
  let totalMistakes = 0;
  stores.mistakesStore.mistakes.forEach(set => totalMistakes += set.size);
  
  return memorized >= condition.pages && totalMistakes >= condition.mistakesMarked;
}

function hasProtectorBadge(stores, condition) {
  return hasSurahPairMemorization(stores, condition);
}

function hasStoryKeeper(stores, condition) {
  if (!condition.storySurahs || condition.storySurahs.length === 0) return false;
  
  const surahPageRanges = getSurahPageRanges();
  
  for (const surahNum of condition.storySurahs) {
    const [startPage, endPage] = surahPageRanges[surahNum] || [0, 0];
    for (let page = startPage; page <= endPage; page++) {
      if (!stores.memorizedStore.memorizedPages.has(page)) {
        return false;
      }
    }
  }
  return true;
}

function hasDiscerningProgress(stores, condition) {
  if (!condition.memorizedPages || !condition.perfectRevisions || !condition.mistakesMarked) return false;
  
  const memorized = stores.memorizedStore.memorizedPages.size;
  let perfectCount = 0;
  let mistakeCount = 0;
  
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectCount++;
  });
  
  stores.mistakesStore.mistakes.forEach(set => mistakeCount += set.size);
  
  return memorized >= condition.memorizedPages &&
         perfectCount >= condition.perfectRevisions &&
         mistakeCount >= condition.mistakesMarked;
}

function hasFortressOfFaith(stores, condition) {
  if (!condition.pages || !condition.streakDays) return false;
  
  return stores.memorizedStore.memorizedPages.size >= condition.pages &&
         stores.dailyGoalsStore.streak >= condition.streakDays;
}

function hasFaithfulGuardian(stores, condition) {
  if (!condition.pages || !condition.streakDays || !condition.perfectRevisions) return false;
  
  const memorized = stores.memorizedStore.memorizedPages.size;
  const streak = stores.dailyGoalsStore.streak;
  let perfectCount = 0;
  
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectCount++;
  });
  
  return memorized >= condition.pages &&
         streak >= condition.streakDays &&
         perfectCount >= condition.perfectRevisions;
}

function hasDedicatedPreserver(stores, condition) {
  return hasFaithfulGuardian(stores, condition);
}

function hasReverentMastery(stores, condition) {
  return hasFaithfulGuardian(stores, condition);
}

function hasCompleteMaster(stores, condition) {
  if (!condition.pages || !condition.streakDays || !condition.perfectRevisions) return false;
  
  const memorized = stores.memorizedStore.memorizedPages.size;
  const streak = stores.dailyGoalsStore.streak;
  let perfectCount = 0;
  
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectCount++;
  });
  
  return memorized >= condition.pages &&
         streak >= condition.streakDays &&
         perfectCount >= condition.perfectRevisions;
}

function hasTriumphantHeart(stores, condition) {
  return hasCompleteMaster(stores, condition);
}

function hasManifestVictory(stores, condition) {
  if (!condition.pages || !condition.streakDays || !condition.perfectRevisions || !condition.accuracyRate) return false;
  
  const memorized = stores.memorizedStore.memorizedPages.size;
  const streak = stores.dailyGoalsStore.streak;
  let perfectCount = 0;
  let totalRevisions = 0;
  
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectCount++;
    if (score > 0) totalRevisions++;
  });
  
  const accuracyRate = totalRevisions > 0 ? (perfectCount / totalRevisions) * 100 : 0;
  
  return memorized >= condition.pages &&
         streak >= condition.streakDays &&
         perfectCount >= condition.perfectRevisions &&
         accuracyRate >= condition.accuracyRate;
}

function hasCumulativeBlessing(stores, condition) {
  if (!condition.achievementsUnlocked) return false;
  // This requires tracking unlocked badges - will be checked in main unlock logic
  return true; // Placeholder - will be handled by higher-level logic
}

function hasEchoOfDivine(stores, condition) {
  if (!condition.achievementsUnlocked) return false;
  return true; // Placeholder - will be handled by higher-level logic
}

function hasVirtueEmbodied(stores, condition) {
  if (!condition.streakDays || !condition.perfectRevisions || 
      !condition.mistakesMarked || !condition.dailyGoalsCompleted) return false;
  
  const streak = stores.dailyGoalsStore.streak;
  let perfectCount = 0;
  let mistakeCount = 0;
  
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectCount++;
  });
  
  stores.mistakesStore.mistakes.forEach(set => mistakeCount += set.size);
  
  return streak >= condition.streakDays &&
         perfectCount >= condition.perfectRevisions &&
         mistakeCount >= condition.mistakesMarked;
}

function hasInspiredJourney(stores, condition) {
  if (!condition.pages || !condition.streakDays) return false;
  
  return stores.memorizedStore.memorizedPages.size >= condition.pages &&
         stores.dailyGoalsStore.streak >= condition.streakDays;
}

function hasProphetPath(stores, condition) {
  return hasSurahPairMemorization(stores, condition);
}

function hasHafizWithConsistency(stores, condition) {
  if (!condition.pages || !condition.consecutiveRevisionDays || !condition.perfectRevisions) return false;
  
  const memorized = stores.memorizedStore.memorizedPages.size;
  let perfectCount = 0;
  
  stores.perfectRevisionsStore.perfectRevisions.forEach(score => {
    if (score >= 100) perfectCount++;
  });
  
  let revisionDays = 0;
  if (stores.dailyGoalsStore.goalHistory) {
    const recentGoals = stores.dailyGoalsStore.goalHistory.slice(-condition.consecutiveRevisionDays);
    for (const goal of recentGoals) {
      if (goal.tasks && goal.tasks.reviewRange && goal.tasks.reviewRange.completed) {
        revisionDays++;
      }
    }
  }
  
  return memorized >= condition.pages &&
         revisionDays >= condition.consecutiveRevisionDays &&
         perfectCount >= condition.perfectRevisions;
}

// ===== HELPER: Get Surah Page Ranges =====
function getSurahPageRanges() {
  return {
    1: [1, 6],
    2: [7, 50],
    3: [51, 77],
    4: [78, 106],
    5: [107, 121],
    6: [122, 140],
    7: [141, 168],
    8: [169, 177],
    9: [178, 198],
    10: [199, 222],
    11: [223, 235],
    12: [236, 249],
    13: [250, 255],
    14: [256, 266],
    15: [267, 280],
    16: [281, 305],
    17: [306, 330],
    18: [331, 350],
    19: [351, 376],
    20: [377, 395],
    21: [396, 405],
    22: [406, 427],
    23: [428, 442],
    24: [443, 457],
    25: [458, 468],
    26: [469, 493],
    27: [494, 505],
    28: [506, 528],
    29: [529, 542],
    30: [543, 555],
    31: [556, 567],
    32: [568, 575],
    33: [576, 595],
    34: [596, 606],
    35: [607, 625],
    36: [626, 638],
    37: [639, 658],
    38: [659, 669],
    39: [670, 689],
    40: [690, 716],
    41: [717, 732],
    42: [733, 750],
    43: [751, 767],
    44: [768, 778],
    45: [779, 785],
    46: [786, 800],
    47: [801, 812],
    48: [813, 823],
    49: [824, 829],
    50: [830, 840],
    51: [841, 848],
    52: [849, 857],
    53: [858, 868],
    54: [869, 878],
    55: [879, 892],
    56: [893, 906],
    57: [907, 917],
    58: [918, 929],
    59: [930, 941],
    60: [942, 950],
    61: [951, 956],
    62: [957, 962],
    63: [963, 967],
    64: [968, 973],
    65: [974, 982],
    66: [983, 992],
    67: [993, 1003],
    68: [1004, 1012],
    69: [1013, 1025],
    70: [1026, 1035],
    71: [1036, 1044],
    72: [1045, 1050],
    73: [1051, 1057],
    74: [1058, 1064],
    75: [1065, 1070],
    76: [1071, 1077],
    77: [1078, 1082],
    78: [1083, 1089],
    79: [1090, 1096],
    80: [1097, 1102],
    81: [1103, 1109],
    82: [1110, 1114],
    83: [1115, 1118],
    84: [1119, 1125],
    85: [1126, 1132],
    86: [1133, 1137],
    87: [1138, 1141],
    88: [1142, 1147],
    89: [1148, 1158],
    90: [1159, 1163],
    91: [1164, 1170],
    92: [1171, 1176],
    93: [1177, 1181],
    94: [1182, 1186],
    95: [1187, 1191],
    96: [1192, 1198],
    97: [1199, 1205],
    98: [1206, 1210],
    99: [1211, 1213],
    100: [1214, 1216],
    101: [1217, 1219],
    102: [1220, 1224],
    103: [1225, 1226],
    104: [1227, 1229],
    105: [1230, 1231],
    106: [1232, 1233],
    107: [1234, 1236],
    108: [1237, 1238],
    109: [1239, 1240],
    110: [1241, 1243],
    111: [1244, 1246],
    112: [1247, 1248],
    113: [1249, 1250],
    114: [1251, 1252]
  };
}

/**
 * Check ALL badges for unlock conditions
 * Returns array of badge IDs that are now eligible to unlock
 */
export const checkAllBadges = (stores, badgesData) => {
  const unlockedBadges = [];
  
  for (const [badgeId, badgeData] of badgesData) {
    if (checkBadgeUnlock(badgeData, stores)) {
      unlockedBadges.push(badgeId);
    }
  }
  
  return unlockedBadges;
};

/**
 * Get badge unlock message
 */
export const getBadgeUnlockMessage = (badge) => {
  if (!badge) return 'Badge Unlocked!';
  return `🎉 ${badge.name} Unlocked!`;
};
