<p align="center"><img src="source/resources/assets/images/logo-bg.png" alt="Murajah Logo" width=125></p>

# Murajah - Quran Memorization & Revision Tool

[![launch](https://img.shields.io/badge/check-website-purple?style=for-the-badge)](https://murajah.pages.dev/)
[![version](https://img.shields.io/badge/V-26.04.11-blue?style=for-the-badge)](https://github.com/wasi0013/Murajah/releases)

[![Playstore Link](https://img.shields.io/badge/Download%20App-black?logo=Google%20Play&logoColor=white&style=for-the-badge)](https://play.google.com/store/apps/details?id=com.murajah.webview)
[![Cloudflare Demo](https://img.shields.io/badge/Cloudflare-F38020?logo=Cloudflare&logoColor=white&style=for-the-badge)](https://murajah.pages.dev/)
[![Author](https://img.shields.io/badge/Author-Wasi-brightgreen?style=for-the-badge)](https://github.com/wasi0013)
[![Free](https://img.shields.io/badge/Opensource-yes-lightgray?style=for-the-badge)](./LICENSE)
![JavaScript](https://img.shields.io/badge/Framework-Vue%20JS-yellow?style=for-the-badge)

<p align='center'><a href="https://play.google.com/store/apps/details?id=com.murajah.webview"><img src="screenshots/playstore.png" alt="Murajah Logo" width=500></a></p>

## 📖 What is Murajah?

**Murajah** (مراجعة) is a comprehensive application designed to help Quran students memorize and maintain their memorization through systematic review and practice.

### The Meaning of Murajah

In Arabic, "muraja'ah" means **review, revision, or repetition**. In the context of Quranic studies, it specifically refers to the practice of repeatedly reciting and revising previously memorized verses to prevent forgetting them.

- **General meaning**: Review, revisiting, or revising something
- **Specific meaning in Quranic studies**: The essential act of repeating and reviewing already memorized portions of the Quran to maintain them

This practice is fundamental to Quran memorization, as it helps prevent memorization from deteriorating over time.

## 🎯 Why Murajah is Important

Memorizing the Quran is a profound spiritual journey, but maintenance is equally critical. Murajah addresses this by:

- **Preventing Forgetting**: Regular revision ensures memorization stays fresh and long-term
- **Tracking Progress**: Monitor what you've memorized and areas needing improvement
- **Building Accountability**: Daily goals and statistics keep you motivated
- **Identifying Weaknesses**: Track mistakes to focus on challenging verses
- **Structured Learning**: Organized review schedules optimize retention

## ✨ Key Features

### Quran Display
- Full Quran text with Tajweed highlighting (Madinah Mushaf / QPC layout)
- Indopak Nastaleeq layout option
- Customizable text size
- Surah view with chapter-level browsing
- Page-by-page navigation with swipe gestures on mobile

### Word-Level Tools
- **Word-by-word** translation and meanings
- **Morphology** — tap any word to view Arabic grammar analysis
- **Mistake highlighter** — tap words to mark recitation errors
- Toggle between morphology and mistake modes via an interaction mode switch

### Tafsir (Commentary)
- Inline Arabic, English, and Bengali tafsir
- Toggleable per-page alongside Quran text

### Memorization Tracking
- Visual memorized page grid with color-coded status
- Juz-level progress overview
- Perfect revision counter per page
- Bulk-mark pages as memorized

### Daily Goals & Streaks
- Configurable daily tasks (recite, record, review, memorize)
- Streak tracking with automatic reset at midnight
- Timeline view of historical daily activity

### Quiz Mode
- Surah-based interactive quizzes
- Question types: word completion, verse continuation, verse translation
- Lightning round mode
- Real-time scoring

### Audio
- Record your own recitations and play them back
- Floating audio player for verse-by-verse Qari playback (Sheikh Shuraim, Sheikh Luhaidan)
- Live Quran/Sunnah stream embed

### Notes & Journal
- Markdown-based personal notes linked to your session
- Persistent across sessions

### Navigation
- Bottom tab bar on mobile (Read, Surahs, Goals, Quiz, More)
- Desktop header with full navigation menu and dropdowns
- Keyboard shortcuts (press **H** for the full list)
- URL-based state: page, tafsir, word-by-word settings preserved in URL

### Offline & PWA
- Installable as a Progressive Web App (Android Play Store / browser install)
- Full offline support — download all resources for offline use
- Service worker with automatic update detection

### Data & Privacy
- All data stored locally in IndexedDB — nothing leaves your device
- Export/import progress as JSON
- Multi-language UI: English, Arabic, Bengali

## 🚀 Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection

### Installation & Self-Hosting

#### Option A: GitHub Pages (Recommended for Personal Use)

1. **Fork or Clone the Repository**

   ```bash
   git clone https://github.com/wasi0013/Murajah.git
   cd Murajah
   ```

2. **Enable GitHub Pages**
   - Go to your repository settings
   - Navigate to "Pages" section
   - Select `master` branch as the source
   - Select `/source` as the folder
   - Save

3. **Access Your App**
   - Your app will be available at: `https://yourusername.github.io/Murajah/`

**Note**: Data is stored locally in your browser, so it persists across sessions on the same device.

#### Option B: Cloudflare Pages (Advanced Deployment)

1. **Prerequisites**
   - Cloudflare account (free tier available)
   - GitHub account with the Murajah repository

2. **Connect Cloudflare to GitHub**
   - Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to "Pages" section
   - Click "Create a project"
   - Select "Connect to Git"
   - Authorize and select your Murajah repository

3. **Configure Build Settings**
   - **Production branch**: `master`
   - **Build command**: Leave empty (no build step needed)
   - **Build output directory**: `source`

4. **Deploy**
   - Save and deploy
   - Your app will be available at a Cloudflare-provided URL
   - You can add a custom domain if you own one

5. **Access Your App**
   - Visit your Cloudflare Pages URL
   - Navigate to `index.html` or the root URL

**Benefits of Cloudflare Pages**:

- Global CDN for faster loading
- Free HTTPS/SSL
- Automatic deployments on git push
- More reliable than GitHub Pages
- Option to add custom domain

### Local Development

1. Clone the repository:

   ```bash
   git clone https://github.com/wasi0013/Murajah.git
   ```

2. Navigate to the source directory:

   ```bash
   cd Murajah/source
   ```

3. Start a local server (choose one):

   ```bash
   # Python 3
   python3 -m http.server 8000
   
   
   # Or with Node.js (http-server)
   npx http-server
   ```

4. Open your browser and visit:

   ```bash
   http://localhost:8000/index.html
   ```

## ✅ Running Tests

Prerequisites: `Node.js` (recommended v16+) and `npm` or `npx` available.

1. Install project dependencies (from the repository root):

```bash
# install deps (use npm ci in CI for reproducible installs)
npm install
# or
npm ci
```

2. (Playwright only) Install browser dependencies used by Playwright:

```bash
# installs required browser binaries
npx playwright install
```

3. Run tests:

- Run unit tests (Vitest):

```bash
npm run test:unit
```

- Run end-to-end tests (Playwright). Playwright will start a local server automatically
   using the configured `webServer` in `playwright.config.js`:

```bash
npm run test:e2e
```

- Run all tests (unit + e2e):

```bash
npm test
```

4. Useful variants:

```bash
# Run unit tests in watch mode
npm run test:unit:watch

# Run Playwright in headed mode (visible browser)
npm run test:e2e:headed

# Run Playwright with debugger
npm run test:e2e:debug

# Generate unit test coverage report
npm run test:unit:coverage
```

Notes:
- Playwright's `webServer` will serve the `source` folder at `http://localhost:3000` during tests
   (configured in `playwright.config.js`). If you prefer, start the server yourself with:

```bash
npx serve source -p 3000
```

- Some tests (audio/recording) may require granting microphone permissions to the browser.
- On CI, use `npm ci` and ensure Playwright browsers are installed before running `npm run test:e2e`.

## 💾 Data Management

- All data (memorization progress, mistakes, recordings, notes, goals) is stored in IndexedDB locally
- Data is per-browser and per-device — use export/import to transfer
- Export your progress as JSON from the Settings panel
- No server-side storage — completely private

## 🏗️ Project Structure

```plaintext
Murajah/
├── source/
│   ├── index.html              # Main SPA (Vue 3, single-file)
│   ├── quiz.html               # Quiz mode
│   ├── sw.js                   # Service worker
│   ├── manifest.json           # PWA manifest
│   └── resources/
│       ├── data/               # Quran text, tafsir, i18n, morphology
│       └── js/                 # Components, stores, utilities
├── tests/
│   ├── unit/                   # Vitest unit tests
│   └── e2e/                    # Playwright E2E tests
├── vitest.config.js
└── playwright.config.js
```

## 🛠️ Technology Stack

- **Frontend**: Vue.js 3 (CDN, no build step)
- **Styling**: Tailwind CSS 3.4
- **Icons**: Font Awesome 6
- **Storage**: IndexedDB (via custom wrapper)
- **Fonts**: QPC v2, Indopak Nastaleeq, SurahNames
- **Testing**: Vitest (unit), Playwright (E2E)
- **Deployment**: Cloudflare Pages / GitHub Pages

## 📚 Keyboard Shortcuts

Press **H** in the app to see the full list. Key shortcuts include:

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / next page |
| `T` | Toggle Tajweed highlighting |
| `R` | Start/stop recording |
| `H` | Show help modal |

## 🤝 Contributing

Found a bug or have a feature request? Feel free to:

1. Open an issue on GitHub
2. Submit a pull request with improvements
3. Share your feedback

## 📄 License

This project is open-source and available for personal use. Please check the [LICENSE](/LICENSE) file for detailed terms.

## 📞 Support

For questions, issues, or suggestions:

1. Check existing issues on GitHub
2. Create a new issue with detailed description
3. Include your browser and device information

## 🙏 Acknowledgments

- Quran data sourced from [https://github.com/TarteelAI/quranic-universal-library](https://github.com/TarteelAI/quranic-universal-library)
- Tajweed font is also from quran.com

---

## 🌟 Start Your Journey

Start your memorization journey with Murajah today! Make review easy, systematic, and rewarding. 📖✨
May Allah accept your efforts in memorizing and preserve **His Words** in your heart. 🤍

> May Allah bless all the JSON resource providers and quran.com team.
