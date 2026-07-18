import type { Messages } from '../types'

// English — the default catalog and the source of truth for keys. It ships in
// the initial bundle; other locales lazy-load. When adding a UI string, add it
// here first, then mirror the key into ar.ts / bn.ts.
const en: Messages = {
  common: {
    back: 'Back',
    cancel: 'Cancel',
    close: 'Close',
    language: 'Language',
  },
  settings: {
    title: 'Settings',
    backToReader: 'Back to reader',
    appearance: {
      title: 'Appearance',
      theme: 'Theme',
      themeLabel: 'Colour theme',
      light: 'Light',
      dark: 'Dark',
      sepia: 'Sepia',
      hint: 'Sepia is easier on the eyes for long reading sessions.',
    },
    language: {
      title: 'Language',
      label: 'App language',
      hint: 'Changes the interface language. Quran text is unaffected.',
    },
    data: {
      title: 'Your data',
      lead: 'Everything is stored on this device. Export a backup to move to another device or keep a safety copy; importing replaces the data the file contains.',
      export: 'Export backup',
      import: 'Import backup',
      confirmTitle: 'Import this backup?',
      confirmBody:
        "This replaces the data the file contains — memorization, mistakes, your plan, and settings — on this device. It can't be undone.",
      replace: 'Replace data',
      exported: 'Backup downloaded.',
      exportFailed: "Couldn't create a backup.",
      restored: 'Backup restored — reloading…',
      restoreFailed: "Couldn't restore this backup.",
      notBackup: 'This file is not a Murajah backup.',
    },
  },
}

export default en
