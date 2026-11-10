<script setup lang="ts">
import { DISCORD_URL } from '@/core/links'

/**
 * Privacy Policy at /privacy. This exact URL is the one registered on the
 * Google Play listing, so it must keep serving the policy as prerendered
 * static HTML (see scripts/prerender.mjs). Like /tos it skips the onboarding
 * gate and keeps the tab bar, and the copy is hardcoded English on purpose.
 * Keep it in step with what the app actually does (permissions, third-party
 * hosts, analytics) and with the Play Data Safety form. Bump EFFECTIVE_DATE
 * whenever the policy itself changes.
 */
const EFFECTIVE_DATE = 'November 10, 2026'
const REPO_URL = 'https://github.com/wasi0013/Murajah'
</script>

<template>
  <main class="privacy" dir="ltr" lang="en">
    <article class="doc">
      <header>
        <h1>Privacy Policy</h1>
        <p class="meta">Effective {{ EFFECTIVE_DATE }}</p>
      </header>

      <p>
        This policy explains how Murajah, the Quran memorization and revision app available at
        murajah.pages.dev, on Google Play, and as an installable web app ("the app"), handles your
        information. In short: the app has no accounts, keeps your data on your device, and does
        not sell or share personal data.
      </p>

      <h2>1. Data stored on your device</h2>
      <p>
        Your memorization progress, revision plans, mistakes, streaks, notes, bookmarks, and
        settings are stored locally in your browser or app storage (IndexedDB and Local Storage).
        They are not uploaded to us or to any server. We cannot see, access, or recover them.
      </p>

      <h2>2. Microphone and recordings</h2>
      <p>
        The app asks for microphone access only when you choose to record your recitation. The
        recordings are saved on your device in IndexedDB, are never uploaded, and are not shared
        with us or anyone else. You can delete any recording from within the app, and you can deny
        or revoke microphone access at any time; the rest of the app keeps working without it.
      </p>

      <h2>3. No accounts or personal information</h2>
      <p>
        You do not need to sign up, sign in, or give us your name, email address, phone number, or
        any other personal information to use the app. We do not use advertising, advertising
        identifiers, or tracking cookies.
      </p>

      <h2>4. Usage statistics</h2>
      <p>
        The website uses Cloudflare Web Analytics to count page visits in aggregate (for example,
        how many people opened a page and from which country). It does not use cookies, does not
        build a profile of you, and is not used for advertising. It does not include anything you
        store in the app.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        Like any website, the services the app loads content from receive standard technical
        information with each request, such as your IP address and browser type. These are:
      </p>
      <ul>
        <li>Cloudflare, which hosts and delivers the app.</li>
        <li>
          Recitation audio hosts (GitHub Pages and everyayah.com), contacted only when you play or
          download audio.
        </li>
        <li>
          YouTube, when you open a live broadcast embedded in the app. YouTube may set its own
          cookies under Google's privacy policy.
        </li>
        <li>Google Play, if you install the Android app, under Google's privacy policy.</li>
      </ul>
      <p>
        We do not send these services any of your app data. Their handling of request information
        is governed by their own privacy policies.
      </p>

      <h2>6. Sharing and sale of data</h2>
      <p>
        We do not sell, rent, or share your personal data with anyone, because we do not collect
        it. When you share a verse link, only the passage and highlights in that link are shared,
        and only with the people you send it to.
      </p>

      <h2>7. Your control over your data</h2>
      <p>
        You can export your data or erase it at any time from Settings. Clearing your browser data
        or uninstalling the app also deletes it permanently, so keep an export if you want a
        backup.
      </p>

      <h2>8. Children</h2>
      <p>
        The app does not knowingly collect personal information from anyone, including children.
        Because data stays on the device, there is nothing for us to collect or disclose.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this policy as the app changes. The effective date above shows when it last
        changed.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions or concerns? Open an issue on
        <a :href="`${REPO_URL}/issues`" target="_blank" rel="noopener">GitHub</a> or reach us on
        <a :href="DISCORD_URL" target="_blank" rel="noopener">Discord</a>. The app's source code
        is public on <a :href="REPO_URL" target="_blank" rel="noopener">GitHub</a>, so anyone can
        verify how it handles data.
      </p>
    </article>
  </main>
</template>

<style scoped>
.privacy {
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
p,
ul {
  margin: 0 0 1rem;
}
ul {
  padding-inline-start: 1.25rem;
  list-style: disc;
}
li {
  margin-bottom: 0.25rem;
}
a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
