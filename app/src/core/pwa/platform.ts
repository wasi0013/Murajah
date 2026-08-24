/**
 * iOS/iPadOS detection for the service-worker registration gate (Phase 10 —
 * see plans/archive/phase-10-pwa-migration.md decision 1). iPadOS 13+ reports as
 * desktop Safari (`platform: "MacIntel"`), so a plain UA sniff misses iPads —
 * combine both checks. Kept in sync with the identical check in
 * `source/index.html`'s `isIOSDevice()`.
 */
export function isIOS(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1
}
