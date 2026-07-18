import type { Messages } from '../types'

// Bengali (LTR). Mirrors the key structure of en.ts; lazy-loaded on first use.
const bn: Messages = {
  common: {
    back: 'পেছনে',
    cancel: 'বাতিল',
    close: 'বন্ধ করুন',
    language: 'ভাষা',
  },
  settings: {
    title: 'সেটিংস',
    backToReader: 'রিডারে ফিরুন',
    appearance: {
      title: 'অ্যাপিয়ারেন্স',
      theme: 'থিম',
      themeLabel: 'রঙের থিম',
      light: 'লাইট',
      dark: 'ডার্ক',
      sepia: 'সেপিয়া',
      hint: 'দীর্ঘ সময় পড়ার জন্য সেপিয়া চোখের জন্য আরামদায়ক।',
    },
    language: {
      title: 'ভাষা',
      label: 'অ্যাপের ভাষা',
      hint: 'ইন্টারফেসের ভাষা পরিবর্তন করে। কুরআনের টেক্সট অপরিবর্তিত থাকে।',
    },
    data: {
      title: 'আপনার ডেটা',
      lead: 'সবকিছু এই ডিভাইসে সংরক্ষিত। অন্য ডিভাইসে নিতে বা নিরাপত্তা কপি রাখতে ব্যাকআপ এক্সপোর্ট করুন; ইমপোর্ট করলে ফাইলে থাকা ডেটা প্রতিস্থাপিত হয়।',
      export: 'ব্যাকআপ এক্সপোর্ট',
      import: 'ব্যাকআপ ইমপোর্ট',
      confirmTitle: 'এই ব্যাকআপ ইমপোর্ট করবেন?',
      confirmBody:
        'এটি এই ডিভাইসে ফাইলে থাকা ডেটা — মুখস্থ, ভুল, আপনার প্ল্যান ও সেটিংস — প্রতিস্থাপন করবে। এটি ফেরানো যাবে না।',
      replace: 'ডেটা প্রতিস্থাপন',
      exported: 'ব্যাকআপ ডাউনলোড হয়েছে।',
      exportFailed: 'ব্যাকআপ তৈরি করা যায়নি।',
      restored: 'ব্যাকআপ পুনরুদ্ধার হয়েছে — রিলোড হচ্ছে…',
      restoreFailed: 'এই ব্যাকআপ পুনরুদ্ধার করা যায়নি।',
      notBackup: 'এই ফাইলটি মুরাজাহ ব্যাকআপ নয়।',
    },
  },
}

export default bn
