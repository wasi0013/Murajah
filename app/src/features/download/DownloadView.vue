<script setup lang="ts">
import { ref } from 'vue'
import {
  Apple,
  BookOpenText,
  Brain,
  Headphones,
  ListChecks,
  MessageCircle,
  PencilLine,
  Share,
  Sparkles,
  Store,
} from 'lucide-vue-next'
import { DISCORD_URL, PLAY_STORE_URL } from '@/core/links'
import { trackEvent } from '@/core/analytics'
import Icon from '@/components/Icon.vue'
import LazyLoopVideo from '@/components/LazyLoopVideo.vue'

/**
 * Standalone install-funnel page at /download — reached only from an outside
 * link (App Store search has nothing to show, so this is what an iOS user
 * lands on instead), never from in-app navigation. Deliberately plain: no
 * i18n catalog, no onboarding gate (see App.vue's NO_ONBOARDING_ROUTE_NAMES —
 * a first-time visitor here must never be blocked by the language-picker
 * modal), and the tab bar is left in place (App.vue's showShellNav) so
 * anyone who bounces here still has a way back into the app itself.
 *
 * Structure is a synthesis of https://1ayah.pages.dev/ (a sibling project's
 * marketing page) rather than a copy: same shape (hero → feature bento →
 * process → CTA banner), but no second nav bar — the tab bar already covers
 * that here — and real looping screencasts (LazyLoopVideo) in place of static
 * phone-mockup screenshots. Every feature claim below is checked against the
 * current source, not copied from the (partially stale) root README — no
 * "works offline" chip, since the dedicated offline-download feature was
 * removed (`git log --grep=offline`), and no fabricated user counts.
 *
 * The iOS "install" is a PWA home-screen shortcut, not a store listing, so
 * "Install for iOS" is an in-page anchor jump to the instructions section
 * (always in the DOM — not a reveal-on-click disclosure) rather than
 * navigating anywhere. The embed itself still lazy-loads (native
 * `loading="lazy"` on the iframe), so nothing YouTube-side fetches until a
 * visitor actually scrolls near it.
 */

const instructionsEl = ref<HTMLElement | null>(null)

const demos = [
  {
    icon: BookOpenText,
    title: 'Word-by-word & tajweed',
    body: "Tap any word for its root, grammar, and translation. Madani (QPC) with color-coded tajweed, Indopak Nastaleeq, or the real scanned mushaf — your choice.",
    video: '/videos/reader.mp4',
    poster: '/videos/reader-poster.webp',
    label: 'Demo: reading the mushaf with word-by-word translation and tajweed',
  },
  {
    icon: ListChecks,
    title: 'One adaptive daily queue',
    body: 'New memorization, revision, and weak-spot reinforcement in a single queue — with streaks to keep the habit going.',
    video: '/videos/today.mp4',
    poster: '/videos/today-poster.webp',
    label: "Demo: completing today's adaptive practice queue",
  },
  {
    icon: Brain,
    title: 'Watch it add up',
    body: 'A 604-page grid and Juz overview, color-coded by how clean each revision was — plus a weakness score that flags what needs another look.',
    video: '/videos/progress.mp4',
    poster: '/videos/progress-poster.webp',
    label: 'Demo: the memorization progress grid',
    accent: true,
  },
  {
    icon: Headphones,
    title: 'Listen & record',
    body: '14 verse-by-verse reciters, continuous playback by surah, juz, or the whole Qur’an, and recording your own recitation to review.',
    video: '/videos/audio.mp4',
    poster: '/videos/audio-poster.webp',
    label: 'Demo: listening to recitation and switching reciters',
  },
]

const steps = [
  {
    title: 'Start reading',
    body: 'Pick Madani, Indopak, or scanned pages, and mark what you’ve already memorized.',
  },
  {
    title: 'Practice a few minutes a day',
    body: "Today's queue mixes new memorization, revision, and listening — built around your own pace.",
  },
  {
    title: 'Review what’s shaky',
    body: 'Mark mistakes as you read, then let Quiz mode and the weakness score target exactly those verses.',
  },
]

// Both CTAs are outbound (Play Store) or an in-page scroll (iOS has no store
// listing — see the component docstring), so this is the only signal we ever
// get for "someone acted on the install funnel"; the /download page_view
// alone can't distinguish a bounce from an actual install attempt.
function trackInstallClick(platform: 'android' | 'ios'): void {
  trackEvent('install_cta_click', { platform })
}

function scrollToIos() {
  trackInstallClick('ios')
  instructionsEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <main class="download">
    <section class="hero">
      <img
        src="/pwa-icon-512.png"
        width="128"
        height="128"
        fetchpriority="high"
        alt="Murajah"
        class="logo"
      />
      <h1 class="brand">Murajah</h1>
      <p class="tagline">Your daily companion for Qur'an memorization &amp; revision.</p>

      <div class="cta-row">
        <a
          class="cta cta-android"
          :href="PLAY_STORE_URL"
          target="_blank"
          rel="noopener noreferrer"
          @click="trackInstallClick('android')"
        >
          <Icon :icon="Store" :size="20" />
          <span>Install for Android</span>
        </a>
        <a class="cta cta-ios" href="#ios-install" @click.prevent="scrollToIos">
          <Icon :icon="Apple" :size="20" />
          <span>Install for iOS</span>
        </a>
      </div>
    </section>

    <section class="section demos-section" aria-labelledby="demos-heading">
      <p class="eyebrow">See it in action</p>
      <h2 id="demos-heading" class="section-title">Everything you need to memorize.</h2>
      <p class="section-lead">A closer look at the tools that make daily memorization stick.</p>

      <div class="demos-grid">
        <article v-for="d in demos" :key="d.title" class="demo-card" :class="{ 'demo-card-accent': d.accent }">
          <LazyLoopVideo :src="d.video" :poster="d.poster" :label="d.label" class="demo-video" />
          <div class="demo-copy">
            <Icon :icon="d.icon" :size="18" class="demo-icon" />
            <h3 class="demo-title">{{ d.title }}</h3>
            <p class="demo-body">{{ d.body }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="section process-section" aria-labelledby="process-heading">
      <p class="eyebrow">How it works</p>
      <h2 id="process-heading" class="section-title">A clear path to lifelong retention.</h2>
      <p class="section-lead">
        No overwhelming page-at-a-time grind — just small, repeatable steps that fit into a busy
        day.
      </p>

      <ol class="steps">
        <li v-for="(s, i) in steps" :key="s.title" class="step">
          <span class="step-num">{{ i + 1 }}</span>
          <span class="step-text">
            <span class="step-title">{{ s.title }}</span>
            <span class="step-body">{{ s.body }}</span>
          </span>
        </li>
      </ol>
    </section>

    <section class="cta-banner">
      <Icon :icon="PencilLine" :size="28" class="cta-banner-icon" />
      <h2 class="cta-banner-title">Ready to start your memorization journey?</h2>
      <p class="cta-banner-sub">Free and open-source. Step by step, verse by verse.</p>
      <div class="badge-row">
        <a
          class="badge-link"
          :href="PLAY_STORE_URL"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get it on Google Play"
          @click="trackInstallClick('android')"
        >
          <img src="/badges/google-play-badge.png" alt="Get it on Google Play" class="badge-img" />
        </a>
        <a class="badge-link" href="#ios-install" aria-label="Install on iOS" @click.prevent="scrollToIos">
          <img src="/badges/install-ios-badge.svg" alt="Install on iOS" class="badge-img" />
        </a>
      </div>
      <a class="cta cta-banner-discord" :href="DISCORD_URL" target="_blank" rel="noopener noreferrer">
        <Icon :icon="MessageCircle" :size="18" />
        <span>Join the Discord</span>
      </a>
    </section>

    <section id="ios-install" ref="instructionsEl" class="ios-instructions" aria-labelledby="ios-heading">
      <p class="eyebrow">Install on iOS as app</p>
      <h2 id="ios-heading" class="ios-title">Add Murajah to your Home Screen</h2>
      <p class="ios-lead">
        iOS doesn't have a Murajah app in the App Store — instead, you can add the web app to
        your Home Screen so it opens and feels just like a regular app. Watch the short video
        below, or follow the written steps.
      </p>

      <div class="video-wrap">
        <iframe
          src="https://www.youtube.com/embed/kwymbQOGipc"
          title="How to install Murajah on iOS"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          loading="lazy"
        />
      </div>

      <div class="option-card">
        <h3 class="option-title">
          <Icon :icon="Share" :size="16" class="option-icon" />
          Option 1: Quick Safari method
          <span class="option-note">(uses the default web icon)</span>
        </h3>
        <ol class="option-steps">
          <li>
            Open the
            <a href="https://murajah.pages.dev/" target="_blank" rel="noopener noreferrer">Murajah Web App</a>
            in <strong>Safari</strong>.
          </li>
          <li>Tap the <strong>Share</strong> button (square with an arrow pointing up).</li>
          <li>Scroll down and select <strong>Add to Home Screen</strong>.</li>
          <li>Rename it if you want, then tap <strong>Add</strong>.</li>
        </ol>
      </div>

      <div class="option-card">
        <h3 class="option-title">
          <Icon :icon="Sparkles" :size="16" class="option-icon" />
          Option 2: Shortcuts app
          <span class="option-note">(allows a custom icon image)</span>
        </h3>
        <ol class="option-steps">
          <li>Open the <strong>Shortcuts</strong> app and tap <strong>+</strong> in the top right.</li>
          <li>Tap <strong>Add Action</strong>, search for <strong>Open URLs</strong>, and select it.</li>
          <li>
            Paste the website link
            <code>https://murajah.pages.dev/</code>
            into the URL field.
          </li>
          <li>
            Tap the down arrow at the top (next to the shortcut name) →
            <strong>Add to Home Screen</strong>.
          </li>
          <li>Tap the icon image to select a custom photo, set your title, and tap <strong>Add</strong>.</li>
        </ol>
      </div>
    </section>

    <section class="discord-section">
      <a class="discord-card" :href="DISCORD_URL" target="_blank" rel="noopener noreferrer">
        <Icon :icon="MessageCircle" :size="24" class="discord-icon" />
        <span class="discord-text">
          <span class="discord-title">Join the Murajah Discord</span>
          <span class="discord-sub">Get support, share feedback, and connect with other reciters.</span>
        </span>
      </a>
    </section>
  </main>
</template>

<style scoped>
.download {
  min-height: 100%;
  background: var(--color-bg);
  padding-bottom: calc(2rem + env(safe-area-inset-bottom));
  overflow-x: clip;
}
.section {
  width: 100%;
  max-width: 64rem;
  margin-inline: auto;
  padding: 3rem clamp(1rem, 4vw, 1.5rem) 0;
}
.eyebrow {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-accent);
  text-align: center;
  margin: 0 0 0.5rem;
}
.section-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--color-text);
  text-align: center;
  margin: 0 0 0.5rem;
}
.section-lead {
  max-width: 34rem;
  margin: 0 auto;
  color: var(--color-text-muted);
  font-size: var(--text-base);
  text-align: center;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
  padding: clamp(2.5rem, 8vw, 4.5rem) 1.25rem 2.5rem;
  background:
    radial-gradient(
      ellipse 80% 60% at 50% -10%,
      color-mix(in srgb, var(--color-accent) 22%, transparent),
      transparent
    ),
    color-mix(in srgb, var(--color-accent) 6%, var(--color-bg));
  border-bottom: 1px solid var(--color-border);
}
.logo {
  width: 6.5rem;
  height: 6.5rem;
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  animation: logo-breathe 4.5s var(--ease-standard) infinite;
}
@keyframes logo-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.035);
  }
}
@media (prefers-reduced-motion: reduce) {
  .logo {
    animation: none;
  }
}
.brand {
  font-size: var(--text-2xl);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--color-text);
  margin: 0.25rem 0 0;
}
.tagline {
  max-width: 26rem;
  color: var(--color-text-muted);
  font-size: var(--text-base);
  margin: 0 0 0.5rem;
}
.cta-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 3rem;
  padding: 0 1.5rem;
  border-radius: var(--radius-full);
  font-size: var(--text-base);
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition:
    transform var(--duration-fast) var(--ease-standard),
    background var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}
.cta:active {
  transform: scale(0.97);
}
.cta:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.cta-android {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}
.cta-android:hover {
  background: var(--color-accent-hover);
}
.cta-ios {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border);
}
.cta-ios:hover {
  background: var(--color-elevated);
}

/* —— Feature demos (bento grid of looping screencasts) —— */
.demos-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-top: 2rem;
}
@media (min-width: 640px) {
  .demos-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
.demo-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}
.demo-card-accent {
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border));
}
.demo-video {
  max-width: 14rem;
  margin-inline: auto;
  box-shadow: var(--shadow-md);
}
.demo-icon {
  color: var(--color-accent);
}
.demo-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
  margin: 0.35rem 0 0.15rem;
}
.demo-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-sm);
  margin: 0;
}

/* —— Process —— */
.steps {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 32rem;
  margin: 2rem auto 0;
  padding: 0;
  list-style: none;
}
.step {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.step-num {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--color-accent) 16%, var(--color-surface));
  color: var(--color-accent);
  font-weight: 700;
  font-size: var(--text-sm);
}
.step-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding-top: 0.2rem;
}
.step-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--color-text);
}
.step-body {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: var(--leading-sm);
}

/* —— Final CTA banner —— */
.cta-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  text-align: center;
  margin-top: 3.5rem;
  padding: 3rem clamp(1.25rem, 6vw, 3rem);
  background: linear-gradient(
    160deg,
    var(--color-accent),
    color-mix(in srgb, var(--color-accent) 55%, black)
  );
  color: var(--color-accent-contrast);
}
.cta-banner-icon {
  opacity: 0.9;
  margin-bottom: 0.25rem;
}
.cta-banner-title {
  font-size: var(--text-xl);
  font-weight: 700;
  max-width: 26rem;
  margin: 0;
}
.cta-banner-sub {
  opacity: 0.85;
  font-size: var(--text-sm);
  margin: 0 0 0.5rem;
}
.badge-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.85rem;
  margin-top: 0.5rem;
}
.badge-link {
  display: inline-flex;
  border-radius: var(--radius-md);
  /* The official badge art has its own baked-in dark pill — this is purely
     an interactive affordance (focus ring, tap-scale), not a visual frame. */
  transition: transform var(--duration-fast) var(--ease-standard);
}
.badge-link:hover {
  transform: translateY(-1px);
}
.badge-link:active {
  transform: scale(0.97);
}
.badge-link:focus-visible {
  outline: 2px solid var(--color-accent-contrast);
  outline-offset: 3px;
}
.badge-img {
  /* Fixed, identical box for both badges — the iOS SVG's canvas is drawn at
     the same 646:250 aspect ratio as the official Google Play PNG (see
     install-ios-badge.svg), so neither image is stretched or letterboxed to
     get here; they were already the same shape. */
  height: 3.75rem;
  width: 9.75rem;
  object-fit: contain;
  display: block;
}
.cta-banner-discord {
  margin-top: 0.4rem;
  background: #5865f2;
  color: #fff;
}
.cta-banner-discord:hover {
  background: #4752c4;
}

/* —— iOS instructions —— */
.ios-instructions {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
  max-width: 34rem;
  margin-inline: auto;
  padding: 3rem clamp(1rem, 4vw, 1.5rem) 0;
  scroll-margin-top: 1rem;
}
.ios-title {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
  text-align: center;
  margin: 0;
}
.ios-lead {
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  text-align: center;
  margin: -0.5rem 0 0;
}
.video-wrap {
  width: 100%;
  /* Sized to fill the section (34rem, see .ios-instructions) rather than the
     old 18rem — a 9:16 Short at that width reads clearly instead of looking
     like a thumbnail. Height is left to follow the aspect ratio (no
     max-height clamp): capping it would shrink the *box* without shrinking
     the *width* to match, silently breaking 9:16 and making YouTube crop the
     embed to fill the mismatched box. The page already scrolls, so a taller
     video on a short viewport just costs a bit more scroll, not a redesign. */
  max-width: 30rem;
  aspect-ratio: 9 / 16;
  margin-inline: auto;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: #000;
  box-shadow: var(--shadow-md);
}
.video-wrap iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
.option-card {
  padding: 1rem 1.1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}
.option-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.6rem;
}
.option-icon {
  color: var(--color-accent);
}
.option-note {
  font-weight: 400;
  color: var(--color-text-muted);
}
.option-steps {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding-inline-start: 1.25rem;
  font-size: var(--text-sm);
  color: var(--color-text);
  line-height: var(--leading-sm);
}
.option-steps a {
  color: var(--color-accent);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
.option-steps code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--color-elevated);
  border-radius: var(--radius-sm);
  padding: 0.1em 0.35em;
  word-break: break-all;
}

/* —— Discord —— */
.discord-section {
  padding: 3rem clamp(1rem, 4vw, 1.5rem) 0;
}
.discord-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 34rem;
  margin-inline: auto;
  padding: 1.1rem 1.25rem;
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
  color: var(--color-text);
  text-decoration: none;
  transition: background var(--duration-fast) var(--ease-standard);
}
.discord-card:hover {
  background: color-mix(in srgb, var(--color-accent) 16%, var(--color-surface));
}
.discord-card:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.discord-icon {
  flex: none;
  color: var(--color-accent);
}
.discord-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.discord-title {
  font-size: var(--text-base);
  font-weight: 700;
}
.discord-sub {
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}
</style>
