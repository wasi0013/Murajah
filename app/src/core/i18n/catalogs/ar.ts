import type { Messages } from '../types'

// Arabic (RTL). Mirrors the key structure of en.ts; lazy-loaded on first use.
const ar: Messages = {
  common: {
    back: 'رجوع',
    cancel: 'إلغاء',
    close: 'إغلاق',
    language: 'اللغة',
  },
  settings: {
    title: 'الإعدادات',
    backToReader: 'العودة إلى القارئ',
    appearance: {
      title: 'المظهر',
      theme: 'السمة',
      themeLabel: 'سمة الألوان',
      light: 'فاتح',
      dark: 'داكن',
      sepia: 'بنّي',
      hint: 'السمة البنّية أروَح للعين في جلسات القراءة الطويلة.',
    },
    language: {
      title: 'اللغة',
      label: 'لغة التطبيق',
      hint: 'يغيّر لغة الواجهة. لا يتأثر نص القرآن.',
    },
    data: {
      title: 'بياناتك',
      lead: 'كل شيء محفوظ على هذا الجهاز. صدّر نسخة احتياطية لنقلها إلى جهاز آخر أو للاحتفاظ بنسخة أمان؛ الاستيراد يستبدل البيانات التي يحتويها الملف.',
      export: 'تصدير نسخة احتياطية',
      import: 'استيراد نسخة احتياطية',
      confirmTitle: 'استيراد هذه النسخة الاحتياطية؟',
      confirmBody:
        'يستبدل هذا البيانات التي يحتويها الملف — الحفظ والأخطاء وخطتك والإعدادات — على هذا الجهاز. لا يمكن التراجع عن ذلك.',
      replace: 'استبدال البيانات',
      exported: 'تم تنزيل النسخة الاحتياطية.',
      exportFailed: 'تعذّر إنشاء نسخة احتياطية.',
      restored: 'تمت استعادة النسخة الاحتياطية — جارٍ إعادة التحميل…',
      restoreFailed: 'تعذّرت استعادة هذه النسخة الاحتياطية.',
      notBackup: 'هذا الملف ليس نسخة احتياطية من مُراجعة.',
    },
  },
}

export default ar
