<script setup lang="ts">
import { DISCORD_URL } from '@/core/links'

/**
 * Terms of Service at /tos. Reached from outside links (store listings,
 * README), so like /download it skips the onboarding gate (App.vue's
 * NO_ONBOARDING_ROUTE_NAMES) but keeps the tab bar as a way into the app.
 * Copy is deliberately hardcoded English rather than catalog keys: it's a
 * legal text, and a translation that drifts from the original is worse than
 * none. Bump EFFECTIVE_DATE whenever the terms themselves change.
 */
const EFFECTIVE_DATE = 'November 6, 2026'
const REPO_URL = 'https://github.com/wasi0013/Murajah'
</script>

<template>
  <main class="tos" dir="ltr" lang="en">
    <article class="doc">
      <header>
        <h1>Terms of Service</h1>
        <p class="meta">Effective {{ EFFECTIVE_DATE }}</p>
      </header>

      <p>
        These terms apply to your use of Murajah, the Quran memorization and revision app available
        at murajah.pages.dev, on Google Play, and as an installable web app ("the app"). By using
        the app you agree to these terms. If you do not agree, please do not use it.
      </p>

      <h2>1. The app</h2>
      <p>
        Murajah is free, open-source software released under the
        <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GNU General Public License v3.0</a>.
        Your rights to use, copy, modify, and redistribute the source code are governed by that
        license. These terms cover your use of the hosted app and do not limit any right the
        license grants you.
      </p>

      <h2>2. Your data</h2>
      <p>
        The app has no accounts. Your progress, plans, notes, recordings, and settings are stored
        on your own device, in your browser or app storage. We do not collect or sell them. You are
        responsible for keeping backups (Settings offers an export), since clearing your browser
        data or uninstalling the app can erase them permanently.
      </p>

      <h2>3. Quran text and content</h2>
      <p>
        Quran text, translations, tafsir, word-by-word data, and recitations come from third-party
        sources (see the
        <a :href="REPO_URL" target="_blank" rel="noopener">project README</a>). We take care to
        display them accurately, but errors are possible. The app is a study aid and is not a
        substitute for learning from a qualified teacher. If you spot a mistake, please report it.
      </p>

      <h2>4. Third-party services</h2>
      <p>
        Some features load content from other services, such as recitation audio from external
        hosts and live broadcasts embedded from YouTube. Those services have their own terms and
        privacy policies, and we are not responsible for their availability or content.
      </p>

      <h2>5. Acceptable use</h2>
      <p>
        Please use the app lawfully and respectfully. Do not attempt to disrupt the service,
        overload it with automated requests, or use shared links to spread content that is abusive
        or misrepresents the Quran.
      </p>

      <h2>6. No warranty</h2>
      <p>
        The app is provided "as is" and "as available", without warranty of any kind, express or
        implied, including merchantability, fitness for a particular purpose, and
        non-infringement. We do not guarantee that it will be uninterrupted, error-free, or that
        your stored data will never be lost.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the authors and contributors of Murajah are not
        liable for any indirect, incidental, or consequential damages, or for any loss of data,
        arising from your use of or inability to use the app.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these terms from time to time. The effective date above shows when they last
        changed. Continuing to use the app after a change means you accept the updated terms.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions or concerns? Open an issue on
        <a :href="`${REPO_URL}/issues`" target="_blank" rel="noopener">GitHub</a> or reach us on
        <a :href="DISCORD_URL" target="_blank" rel="noopener">Discord</a>.
      </p>
    </article>
  </main>
</template>

<style scoped>
.tos {
  min-height: 100%;
  background: var(--color-bg);
  padding: clamp(2rem, 6vw, 3.5rem) clamp(1rem, 4vw, 1.5rem) calc(3rem + env(safe-area-inset-bottom));
}
.doc {
  max-width: 42rem;
  margin-inline: auto;
  color: var(--color-text);
  font-size: var(--text-base);
  line-height: 1.7;
}
h1 {
  font-size: var(--text-3xl);
  line-height: var(--leading-3xl);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  margin: 0 0 0.25rem;
}
.meta {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  margin: 0 0 2rem;
}
h2 {
  font-size: var(--text-lg);
  line-height: var(--leading-lg);
  font-weight: 700;
  margin: 2rem 0 0.5rem;
}
p {
  margin: 0 0 1rem;
}
a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
