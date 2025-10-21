# Current vs. Proposed Architecture

## Side-by-Side Comparison

### Data Storage

**Current (index.html)**
```
localStorage
├── memorizedPages → String
├── mistakes → String
├── perfectRevisions → String
├── audio-* → String (base64)
└── finishRevisionDays → String
```

**Proposed (beta.html)**
```
IndexedDB
├── memorizedPages (table)
│   └── [{ pageNumber, memorizedAt }]
├── mistakes (table)
│   └── [{ id, pageNumber, wordIds, timestamp }]
├── perfectRevisions (table)
│   └── [{ pageNumber, count, updatedAt }]
├── audioRecordings (table)
│   └── [{ id, pageNumber, audioBlob, duration }]
└── settings (table)
    └── [{ key, value, updatedAt }]
```

### JavaScript Architecture

**Current (index.html)**
```
Global scope (imperative)
├── let layoutData = []
├── let wordsData = {}
├── let memorizedPages = []
├── let mistakes = {}
├── function renderPage() { ... }
├── function toggleMemorized() { ... }
├── function attachMistakeTracker() { ... }
├── document.addEventListener('DOMContentLoaded')
│   ├── recordBtn.onclick = ...
│   ├── playBtn.onclick = ...
│   └── memorizeBtn.onclick = ...
└── ~1500 lines of inline code
```

**Proposed (beta.html)**
```
Vue 3 Components (declarative)
├── App.vue
│   ├── QuranPage.vue (display)
│   ├── Navigation.vue (controls)
│   ├── Dashboard.vue (stats)
│   ├── MistakeTracker.vue (mistakes)
│   ├── AudioPlaylist.vue (audio)
│   ├── MemorizedGrid.vue (grid)
│   └── StatusIndicators.vue (status)
│
├── Stores (state management)
│   ├── appStore.js (page, theme)
│   ├── quranStore.js (data)
│   ├── memorizedStore.js (memorization)
│   ├── mistakesStore.js (mistakes)
│   ├── audioStore.js (audio)
│   └── settingsStore.js (settings)
│
├── Utils (logic)
│   ├── idb.js (IndexedDB)
│   ├── audioRecorder.js (audio)
│   ├── calculations.js (stats)
│   └── exportImport.js (backup)
│
└── ~2000 lines organized and modular
```

### Styling

**Current (index.html)**
```
CSS
├── Inline <style> tags
├── External resources/css/style.css
├── Hard-coded colors
├── Limited responsive behavior
└── Dark mode: Manual CSS overrides
```

**Proposed (beta.html)**
```
Tailwind CSS
├── Utility-first classes
├── Responsive: sm: md: lg: xl:
├── Dark mode: dark: prefix built-in
├── Theme colors in :root
└── Smaller bundle, highly reusable
```

### Rendering

**Current (index.html)**
```
Vanilla DOM Manipulation
├── document.getElementById('quranPage')
├── container.innerHTML = ''
├── createElement()
├── addEventListener()
├── Manual state → DOM sync
└── Potential memory leaks
```

**Proposed (beta.html)**
```
Vue 3 Reactivity
├── Reactive state automatically updates DOM
├── v-for for lists (efficient diffing)
├── @click event handlers
├── Computed properties auto-update
└── Automatic memory cleanup
```

## Code Example Comparison

### Toggle Memorized Page

**Current (index.html)**
```javascript
function toggleMemorized(pageNum) {
  // Find in array
  const idx = memorizedPages.indexOf(pageNum);
  if (idx === -1) {
    memorizedPages.push(pageNum);
  } else {
    memorizedPages.splice(idx, 1);
  }
  // Save to localStorage (blocking)
  localStorage.setItem('memorizedPages', JSON.stringify(memorizedPages));
  updateMemorizeBtn();
  updateDashboard();
  renderMemorizedGrid();
  updateMistakeBubbleGrid();
}

// Called from:
document.getElementById('memorizeBtn').onclick = () => {
  toggleMemorized(currentPage);
};
```

**Proposed (beta.html)**
```javascript
// Store
export const toggleMemorized = async (pageNum) => {
  if (memorizedStore.memorizedPages.has(pageNum)) {
    memorizedStore.memorizedPages.delete(pageNum);
    await murajahDB.removeMemorized(pageNum);
  } else {
    memorizedStore.memorizedPages.add(pageNum);
    await murajahDB.addMemorized(pageNum);
  }
  // UI updates automatically via Vue reactivity!
};

// Component
<button @click="toggleMemorized(currentPage)" class="...">
  {{ isMemorized(currentPage) ? 'Memorized ✓' : 'Mark as Memorized' }}
</button>
```

### Render Audio Playlist

**Current (index.html)**
```javascript
function renderAudioPlaylist() {
  const playlistDiv = document.getElementById('playlistItems');
  playlistDiv.innerHTML = '';
  
  const audios = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('aud-')) {
      const pageNum = key.split('-')[1];
      audios.push({ pageNum, key, data: localStorage.getItem(key) });
    }
  }
  
  if (audios.length === 0) {
    playlistDiv.innerHTML = '<div>No recordings</div>';
    return;
  }
  
  audios.sort((a, b) => Number(a.pageNum) - Number(b.pageNum));
  
  let html = '<div>';
  audios.forEach(audio => {
    html += `
      <div class="playlist-item">
        <span>Page ${audio.pageNum}</span>
        <button onclick="playAudio('${audio.key}')">Play</button>
        <button onclick="deleteAudio('${audio.key}')">Delete</button>
      </div>
    `;
  });
  html += '</div>';
  
  playlistDiv.innerHTML = html;
}
```

**Proposed (beta.html)**
```javascript
// Store
export const loadAudio = async () => {
  audioStore.recordings = await murajahDB.getAllAudio();
};

// Component (Vue)
<template>
  <div class="audio-playlist">
    <div v-if="recordings.length === 0" class="empty-state">
      No recordings yet
    </div>
    
    <div v-for="audio in sortedRecordings" :key="audio.id" 
      class="playlist-item">
      <span>Page {{ audio.pageNumber }}</span>
      <button @click="playAudio(audio)">Play</button>
      <button @click="deleteAudio(audio.id)">Delete</button>
    </div>
  </div>
</template>

<script>
computed: {
  sortedRecordings() {
    return [...audioStore.recordings].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );
  }
}
</script>
```

### Audio Recording with Countdown

**Current (index.html)**
```javascript
document.getElementById('recordBtn').onclick = async function () {
  const quranPage = document.getElementById('quranPage');
  quranPage.classList.add('blurred');
  
  const overlay = document.getElementById('countdownOverlay');
  const text = document.getElementById('countdownText');
  overlay.style.display = 'flex';
  
  let count = 3;
  text.textContent = count;
  
  let countdownInterval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(countdownInterval);
      overlay.style.display = 'none';
      quranPage.classList.remove('blurred');
      
      // Start recording
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          
          mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
          };
          
          mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            // Save to localStorage
            const key = getAudioKey(currentPage);
            localStorage.setItem(key, audioBlob);
            updateAudioControls();
            renderAudioPlaylist();
          };
          
          mediaRecorder.start();
          document.getElementById('recordBtn').style.display = 'none';
          document.getElementById('stopBtn').style.display = '';
        });
    } else {
      text.textContent = count;
    }
  }, 1000);
};
```

**Proposed (beta.html)**
```javascript
// Store (reactive)
export const startRecording = async () => {
  audioStore.isRecording = true;
  audioStore.countdownValue = 3;
  
  // Countdown with reactive state
  const countdown = setInterval(() => {
    audioStore.countdownValue--;
    if (audioStore.countdownValue <= 0) {
      clearInterval(countdown);
      performRecording();
    }
  }, 1000);
};

export const performRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  
  recorder.ondataavailable = (e) => chunks.push(e.data);
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: 'audio/wav' });
    const duration = blob.size / (16000 * 2); // Approximate
    
    // Save to IndexedDB (async, non-blocking!)
    await murajahDB.saveAudio(appStore.currentPage, blob, duration);
    
    audioStore.isRecording = false;
    // UI updates automatically!
  };
  
  recorder.start();
};

// Component (simple, clean)
<template>
  <!-- Countdown Overlay -->
  <div v-show="audioStore.showCountdown" class="overlay">
    <span class="text-5xl">{{ audioStore.countdownValue }}</span>
  </div>
  
  <!-- Recording Controls -->
  <div class="audio-controls">
    <button @click="startRecording" v-show="!audioStore.isRecording">
      🎙️ Record
    </button>
    <button @click="stopRecording" v-show="audioStore.isRecording">
      ⏹️ Stop
    </button>
  </div>
</template>
```

## Key Improvements Summary

| Aspect | Current | Proposed | Benefit |
|--------|---------|----------|---------|
| **Storage** | localStorage | IndexedDB | Larger capacity, structured queries |
| **Async** | Blocking | Non-blocking | Better UI responsiveness |
| **State** | Scattered globals | Centralized stores | Easier debugging, testing |
| **Rendering** | Imperative DOM | Declarative Vue | Fewer bugs, better maintenance |
| **Styling** | Inline CSS | Tailwind | Consistency, responsive, smaller |
| **Components** | Monolithic | Modular | Reusable, testable, scalable |
| **Mobile** | Desktop-first | Mobile-first | Better on phones |
| **Dark Mode** | Manual CSS | Tailwind built-in | Easier to maintain |
| **Lines of Code** | ~1500 | ~2000 (organized) | More maintainable |
| **Performance** | Synchronous | Optimized | Faster, smoother |

---

## Migration Safety

### Data Compatibility
- ✅ Backward compatible JSON export
- ✅ Automatic migration from localStorage
- ✅ Validation on import
- ✅ No data loss guarantee

### Feature Parity
- ✅ 100% feature compatibility with index.html
- ✅ All existing functionality preserved
- ✅ Performance improvements
- ✅ Enhanced mobile experience

### Rollback Plan
- ✅ Keep index.html unchanged in production
- ✅ beta.html is opt-in via URL
- ✅ Data works in both versions
- ✅ Easy to revert if needed

---

## Visual Workflow

### Current (index.html) - How It Works
```
User clicks button
    ↓
Event handler executes
    ↓
Function manipulates localStorage
    ↓
Function manually updates DOM elements
    ↓
Function updates other UI elements
    ↓
Display updates (synchronously)

Problem: Tight coupling, hard to maintain, blocking operations
```

### Proposed (beta.html) - How It Works
```
User clicks button
    ↓
Vue component emits event
    ↓
Store action executes
    ↓
Store updates reactive state
    ↓
IndexedDB saves data (async, non-blocking)
    ↓
Vue reactivity automatically updates all views
    ↓
Display updates (smoothly, efficiently)

Benefit: Decoupled, maintainable, responsive
```

---

**Next:** Review this comparison and confirm you're ready to proceed!
