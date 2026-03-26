import type { SelectorDef } from '@pingdev/core';

export const selectors: Record<string, SelectorDef> = {
  '1': {
    name: '1',
    tiers: [
      '//button[contains(text(),"1")]',
    ],
  },
  '2': {
    name: '2',
    tiers: [
      '//button[contains(text(),"2")]',
    ],
  },
  '3': {
    name: '3',
    tiers: [
      '//button[contains(text(),"3")]',
    ],
  },
  '4': {
    name: '4',
    tiers: [
      '//button[contains(text(),"4")]',
    ],
  },
  '100': {
    name: '100',
    tiers: [
      'link[name="عطر 100 مل للنساء والرجال، عطور التبغ والورد والخشب والكرز، رائحة زهرية طويلة الأمد، ماء عطر وكولونيا"]',
      'div[aria-label="عطر 100 مل للنساء والرجال، عطور التبغ والورد والخشب والكرز، رائحة زهرية طويلة الأمد، ماء عطر وكولونيا"]',
      '//div[@aria-label="عطر 100 مل للنساء والرجال، عطور التبغ والورد والخشب والكرز، رائحة زهرية طويلة الأمد، ماء عطر وكولونيا"]',
    ],
  },
  '1688': {
    name: '1688',
    tiers: [
      '//a[contains(text(),"1688")]',
    ],
  },
  'isHome': {
    name: 'isHome',
    tiers: [
      '#isHome',
      '//*[@id="isHome"]',
    ],
  },
  'nav-skip-to-main-content': {
    name: 'nav-skip-to-main-content',
    tiers: [
      '#nav-skip-to-main-content',
      '//*[@id="nav-skip-to-main-content"]',
    ],
  },
  'searchopt': {
    name: 'searchopt',
    tiers: [
      'button',
      'button.keyboard-shortcut-search',
      '//button[contains(text(),"Searchopt+/")]',
    ],
  },
  'cartshift-opt-c': {
    name: 'cartshift-opt-c',
    tiers: [
      'link',
      'a.keyboard-shortcut-shopping-cart',
      '//a[contains(text(),"Cartshift+opt+C")]',
    ],
  },
  'show-hide-shortcutsshift-opt-z': {
    name: 'show-hide-shortcutsshift-opt-z',
    tiers: [
      'button',
      'button.keyboard-shortcut-show',
      '//button[contains(text(),"Show/Hide shortcutsshift+opt+Z")]',
    ],
  },
  'aliexpress-logo': {
    name: 'aliexpress-logo',
    tiers: [
      'a[aria-label="AliExpress logo"]',
      '//a[@aria-label="AliExpress logo"]',
    ],
  },
  'you-can-type-an-item-name-or-keyword-to-': {
    name: 'you-can-type-an-item-name-or-keyword-to-',
    tiers: [
      'searchbox[name="You can type an item name or keyword to search."]',
      '#search-words',
      '//*[@id="search-words"]',
    ],
  },
  'you-can-click-this-button-to-search': {
    name: 'you-can-click-this-button-to-search',
    tiers: [
      'button[name="You can click this button to search."]',
      'input[aria-label="You can click this button to search."]',
      '//input[@aria-label="You can click this button to search."]',
    ],
  },
  'you-can-scan-the-qr-code-to-download-the': {
    name: 'you-can-scan-the-qr-code-to-download-the',
    tiers: [
      'button[name="You can scan the QR code to download the AliExpress app."]',
      'div[aria-label="You can scan the QR code to download the AliExpress app."]',
      '//div[@aria-label="You can scan the QR code to download the AliExpress app."]',
    ],
  },
  'you-can-select-a-country-region-or-langu': {
    name: 'you-can-select-a-country-region-or-langu',
    tiers: [
      'button[name="You can select a country, region or language for shopping on AliExpress ae. The current language is English."]',
      'div[aria-label="You can select a country, region or language for shopping on AliExpress ae. The current language is English."]',
      '//div[@aria-label="You can select a country, region or language for shopping on AliExpress ae. The current language is English."]',
    ],
  },
  'you-can-register-sign-in-or-view-more-in': {
    name: 'you-can-register-sign-in-or-view-more-in',
    tiers: [
      'button[name="You can register, sign in or view more information about your account."]',
      'div[aria-label="You can register, sign in or view more information about your account."]',
      '//div[@aria-label="You can register, sign in or view more information about your account."]',
    ],
  },
  '0-items-in-cart': {
    name: '0-items-in-cart',
    tiers: [
      'a[aria-label="0 items in cart."]',
      '//a[@aria-label="0 items in cart."]',
    ],
  },
  '': {
    name: '',
    tiers: [
      'button[name="كل الأصناف"]',
      'div[aria-label="كل الأصناف"]',
      '//div[@aria-label="كل الأصناف"]',
    ],
  },
  'choice': {
    name: 'choice',
    tiers: [
      'a[aria-label="Choice"]',
      '//a[@aria-label="Choice"]',
    ],
  },
  'aliexpress-business': {
    name: 'aliexpress-business',
    tiers: [
      'a[aria-label="AliExpress Business"]',
      '//a[@aria-label="AliExpress Business"]',
    ],
  },
  'big-sale': {
    name: 'big-sale',
    tiers: [
      'a[aria-label="Big Sale"]',
      '//a[@aria-label="Big Sale"]',
    ],
  },
  'link-54': {
    name: 'link-54',
    tiers: [
      'a.n4_b2',
    ],
  },
  'link-55': {
    name: 'link-55',
    tiers: [
      'a.n4_b2',
    ],
  },
  'link-56': {
    name: 'link-56',
    tiers: [
      'a.n4_b2',
    ],
  },
  'aed12-85aed12-85': {
    name: 'aed12-85aed12-85',
    tiers: [
      'a.n8_m',
      '//a[contains(text(),"أفضل العروضAED12.85AED12.85")]',
    ],
  },
  'aed3-75aed3-75': {
    name: 'aed3-75aed3-75',
    tiers: [
      'a.n8_m',
      '//a[contains(text(),"نادي التكنولوجياAED3.75AED3.75")]',
    ],
  },
  'aed9-13aed9-13': {
    name: 'aed9-13aed9-13',
    tiers: [
      'a.n8_m',
      '//a[contains(text(),"نادي البيتAED9.13AED9.13")]',
    ],
  },
  'link-63': {
    name: 'link-63',
    tiers: [
      'a.f7_f8.f7_f9',
    ],
  },
  'aed3-75': {
    name: 'aed3-75',
    tiers: [
      'link',
      'div.hg_hl',
      '//div[contains(text(),"AED3.75")]',
    ],
  },
  'aed4-52': {
    name: 'aed4-52',
    tiers: [
      'link',
      'div.hg_hm',
      '//div[contains(text(),"AED4.52")]',
    ],
  },
  'button-72': {
    name: 'button-72',
    tiers: [
      'button',
      'div.swiper-button-prev',
    ],
  },
  'button-73': {
    name: 'button-73',
    tiers: [
      'button',
      'div.swiper-button-next',
    ],
  },
  'button-74': {
    name: 'button-74',
    tiers: [
      'button',
      'span.swiper-pagination-bullet',
    ],
  },
  'button-75': {
    name: 'button-75',
    tiers: [
      'button',
      'span.swiper-pagination-bullet.swiper-pagination-bullet-active',
    ],
  },
  'previous': {
    name: 'previous',
    tiers: [
      'button[name="Previous"]',
      '#prevManual',
      '//*[@id="prevManual"]',
    ],
  },
  '16-1': {
    name: '16-1',
    tiers: [
      'link[name="مجموعة مفاتيح ربط 16 في 1، رأس دوار غير قابل للانزلاق. ستانلس ستيل متين لإصلاح المنزل والسيارات. أداة سهلة وعالمية."]',
      'div[aria-label="مجموعة مفاتيح ربط 16 في 1، رأس دوار غير قابل للانزلاق. ستانلس ستيل متين لإصلاح المنزل والسيارات. أداة سهلة وعالمية."]',
      '//div[@aria-label="مجموعة مفاتيح ربط 16 في 1، رأس دوار غير قابل للانزلاق. ستانلس ستيل متين لإصلاح المنزل والسيارات. أداة سهلة وعالمية."]',
    ],
  },
  'wh-ch720n-wh-1000xm4-mdr-zx100': {
    name: 'wh-ch720n-wh-1000xm4-mdr-zx100',
    tiers: [
      'link[name="حافظة سماعة الرأس لسوني WH-CH720N WH-1000XM4 MDR-ZX100 سماعة رأس عالمية حقيبة سفر صلبة إيفا تخزين سماعة حمل الحقيبة"]',
      'div[aria-label="حافظة سماعة الرأس لسوني WH-CH720N WH-1000XM4 MDR-ZX100 سماعة رأس عالمية حقيبة سفر صلبة إيفا تخزين سماعة حمل الحقيبة"]',
      '//div[@aria-label="حافظة سماعة الرأس لسوني WH-CH720N WH-1000XM4 MDR-ZX100 سماعة رأس عالمية حقيبة سفر صلبة إيفا تخزين سماعة حمل الحقيبة"]',
    ],
  },
  'next': {
    name: 'next',
    tiers: [
      'button[name="Next"]',
      '#nextManual',
      '//*[@id="nextManual"]',
    ],
  },
  'kingroon-petg-1-75-5-10-1-petg-fdm': {
    name: 'kingroon-petg-1-75-5-10-1-petg-fdm',
    tiers: [
      'link[name="خيط طابعة ثلاثية الأبعاد من KINGROON PETG بقطر 1.75 مم، 5 كجم، 10 كجم، ألوان متنوعة، مواد طباعة ثلاثية الأبعاد، 1 كجم/لفة، بلاستيك PETG لطابعات FDM ثلاثية الأبعاد."]',
      'div[aria-label="خيط طابعة ثلاثية الأبعاد من KINGROON PETG بقطر 1.75 مم، 5 كجم، 10 كجم، ألوان متنوعة، مواد طباعة ثلاثية الأبعاد، 1 كجم/لفة، بلاستيك PETG لطابعات FDM ثلاثية الأبعاد."]',
      '//div[@aria-label="خيط طابعة ثلاثية الأبعاد من KINGROON PETG بقطر 1.75 مم، 5 كجم، 10 كجم، ألوان متنوعة، مواد طباعة ثلاثية الأبعاد، 1 كجم/لفة، بلاستيك PETG لطابعات FDM ثلاثية الأبعاد."]',
    ],
  },
  'ugreen-apple-find-my-ios-find-hub-app-an': {
    name: 'ugreen-apple-find-my-ios-find-hub-app-an',
    tiers: [
      'link[name="UGREEN 【توافق النظام المزدوج】مكتشف ذكي لجهاز Apple Find My (iOS) وFind Hub App (Android) بطاقة تعقب بلوتوث"]',
      'div[aria-label="UGREEN 【توافق النظام المزدوج】مكتشف ذكي لجهاز Apple Find My (iOS) وFind Hub App (Android) بطاقة تعقب بلوتوث"]',
      '//div[@aria-label="UGREEN 【توافق النظام المزدوج】مكتشف ذكي لجهاز Apple Find My (iOS) وFind Hub App (Android) بطاقة تعقب بلوتوث"]',
    ],
  },
  '17-16-15-14': {
    name: '17-16-15-14',
    tiers: [
      'link[name="حافظة هاتف فاخرة من سبائك الألومنيوم بتصميم حقيبة سفر للأعمال لهواتف آيفون 17 16 15 14 برو ماكس، غطاء خلفي مموج ثلاثي الأبعاد مع علبة هدايا"]',
      'div[aria-label="حافظة هاتف فاخرة من سبائك الألومنيوم بتصميم حقيبة سفر للأعمال لهواتف آيفون 17 16 15 14 برو ماكس، غطاء خلفي مموج ثلاثي الأبعاد مع علبة هدايا"]',
      '//div[@aria-label="حافظة هاتف فاخرة من سبائك الألومنيوم بتصميم حقيبة سفر للأعمال لهواتف آيفون 17 16 15 14 برو ماكس، غطاء خلفي مموج ثلاثي الأبعاد مع علبة هدايا"]',
    ],
  },
  'bigme-2026-7-4-64': {
    name: 'bigme-2026-7-4-64',
    tiers: [
      'link[name="جهاز BIGME الجديد لعام 2026، قارئ كتب إلكتروني ذكي بشاشة حبر 7 بوصات للمكتب، كتاب إلكتروني ملون مع إمكانية الكتابة اليدوية، دفتر ملاحظات إلكتروني بسعة 4 جيجا + 64 جيجا"]',
      'div[aria-label="جهاز BIGME الجديد لعام 2026، قارئ كتب إلكتروني ذكي بشاشة حبر 7 بوصات للمكتب، كتاب إلكتروني ملون مع إمكانية الكتابة اليدوية، دفتر ملاحظات إلكتروني بسعة 4 جيجا + 64 جيجا"]',
      '//div[@aria-label="جهاز BIGME الجديد لعام 2026، قارئ كتب إلكتروني ذكي بشاشة حبر 7 بوصات للمكتب، كتاب إلكتروني ملون مع إمكانية الكتابة اليدوية، دفتر ملاحظات إلكتروني بسعة 4 جيجا + 64 جيجا"]',
    ],
  },
  '2026-32-4k-800-3600-120': {
    name: '2026-32-4k-800-3600-120',
    tiers: [
      'link[name="نظارات ذكية جديدة لعام 2026 بذاكرة 32 جيجابايت وكاميرا 4K بقوة 800 واط للرجال والنساء، تدعم التقاط الصور والفيديوهات، مع بنك طاقة 3600 مللي أمبير وترجمة لأكثر من 120 لغة بتقنية الذكاء الاصطناعي"]',
      'div[aria-label="نظارات ذكية جديدة لعام 2026 بذاكرة 32 جيجابايت وكاميرا 4K بقوة 800 واط للرجال والنساء، تدعم التقاط الصور والفيديوهات، مع بنك طاقة 3600 مللي أمبير وترجمة لأكثر من 120 لغة بتقنية الذكاء الاصطناعي"]',
      '//div[@aria-label="نظارات ذكية جديدة لعام 2026 بذاكرة 32 جيجابايت وكاميرا 4K بقوة 800 واط للرجال والنساء، تدعم التقاط الصور والفيديوهات، مع بنك طاقة 3600 مللي أمبير وترجمة لأكثر من 120 لغة بتقنية الذكاء الاصطناعي"]',
    ],
  },
  'sba5-slr': {
    name: 'sba5-slr',
    tiers: [
      'link[name="حزام يد من النايلون والمطاط لحامل الخلفي SBA5 لنموذج SLR، ملحق صيد للتصدير"]',
      'div[aria-label="حزام يد من النايلون والمطاط لحامل الخلفي SBA5 لنموذج SLR، ملحق صيد للتصدير"]',
      '//div[@aria-label="حزام يد من النايلون والمطاط لحامل الخلفي SBA5 لنموذج SLR، ملحق صيد للتصدير"]',
    ],
  },
  '200-300-500': {
    name: '200-300-500',
    tiers: [
      'link[name="200/300/500 مللي رذاذ الزيت زجاجة رذاذ زيت الزيتون المطبخ الطبخ موزع التخييم الخبز الخل صلصة الصويا البخاخ الحاويات"]',
      'div[aria-label="200/300/500 مللي رذاذ الزيت زجاجة رذاذ زيت الزيتون المطبخ الطبخ موزع التخييم الخبز الخل صلصة الصويا البخاخ الحاويات"]',
      '//div[@aria-label="200/300/500 مللي رذاذ الزيت زجاجة رذاذ زيت الزيتون المطبخ الطبخ موزع التخييم الخبز الخل صلصة الصويا البخاخ الحاويات"]',
    ],
  },
  'airs-pro': {
    name: 'airs-pro',
    tiers: [
      'link[name="سماعات بلوتوث أصلية من Airs Pro، سماعات ألعاب، سماعة بلوتوث لاسلكية مناسبة"]',
      'div[aria-label="سماعات بلوتوث أصلية من Airs Pro، سماعات ألعاب، سماعة بلوتوث لاسلكية مناسبة"]',
      '//div[@aria-label="سماعات بلوتوث أصلية من Airs Pro، سماعات ألعاب، سماعة بلوتوث لاسلكية مناسبة"]',
    ],
  },
  '1-5-2-0-2-5': {
    name: '1-5-2-0-2-5',
    tiers: [
      'link[name="+1.5 2.0 2.5 نظارات للقراءة النساء الرجال خفيفة المحمولة البسيطة مد البصر نظارات معدنية طول النظر الشيخوخي مع الديوبتر زائد مع صندوق"]',
      'div[aria-label="+1.5 2.0 2.5 نظارات للقراءة النساء الرجال خفيفة المحمولة البسيطة مد البصر نظارات معدنية طول النظر الشيخوخي مع الديوبتر زائد مع صندوق"]',
      '//div[@aria-label="+1.5 2.0 2.5 نظارات للقراءة النساء الرجال خفيفة المحمولة البسيطة مد البصر نظارات معدنية طول النظر الشيخوخي مع الديوبتر زائد مع صندوق"]',
    ],
  },
  '16-13-15-11-12-14-17-pro-max-16e-xr-7-8-': {
    name: '16-13-15-11-12-14-17-pro-max-16e-xr-7-8-',
    tiers: [
      'link[name="حافظة لهاتف آيفون 16 برو 13 15 11 12 14 17 Pro Max 16E XR 7 8 SE XS غطاء شفاف مقاوم للصدمات من السيليكون الناعم Fundas"]',
      'div[aria-label="حافظة لهاتف آيفون 16 برو 13 15 11 12 14 17 Pro Max 16E XR 7 8 SE XS غطاء شفاف مقاوم للصدمات من السيليكون الناعم Fundas"]',
      '//div[@aria-label="حافظة لهاتف آيفون 16 برو 13 15 11 12 14 17 Pro Max 16E XR 7 8 SE XS غطاء شفاف مقاوم للصدمات من السيليكون الناعم Fundas"]',
    ],
  },
  'haylou-s40-anc-50-ldac-6-0': {
    name: 'haylou-s40-anc-50-ldac-6-0',
    tiers: [
      'link[name="سماعات رأس لاسلكية HAYLOU S40 ANC مع خاصية إلغاء الضوضاء بقوة 50 ديسيبل، صوت محيطي ثلاثي الأبعاد عالي الدقة، سماعات أذن مع تقنية LDAC وبلوتوث 6.0، سماعات فوق الأذن"]',
      'div[aria-label="سماعات رأس لاسلكية HAYLOU S40 ANC مع خاصية إلغاء الضوضاء بقوة 50 ديسيبل، صوت محيطي ثلاثي الأبعاد عالي الدقة، سماعات أذن مع تقنية LDAC وبلوتوث 6.0، سماعات فوق الأذن"]',
      '//div[@aria-label="سماعات رأس لاسلكية HAYLOU S40 ANC مع خاصية إلغاء الضوضاء بقوة 50 ديسيبل، صوت محيطي ثلاثي الأبعاد عالي الدقة، سماعات أذن مع تقنية LDAC وبلوتوث 6.0، سماعات فوق الأذن"]',
    ],
  },
  'wmstar': {
    name: 'wmstar',
    tiers: [
      'a[aria-label="Wmstar حللا النساء بالجملة مثير جوارب لامعة انظر من خلال ضيق السلس الساحرة قطعة واحدة دعوى ضيق مغرية يتوهم نادي"]',
      '//a[@aria-label="Wmstar حللا النساء بالجملة مثير جوارب لامعة انظر من خلال ضيق السلس الساحرة قطعة واحدة دعوى ضيق مغرية يتوهم نادي"]',
    ],
  },
  'previous-page': {
    name: 'previous-page',
    tiers: [
      'button[aria-label="previous page"]',
      '//button[@aria-label="previous page"]',
    ],
  },
  'next-page': {
    name: 'next-page',
    tiers: [
      'button[aria-label="next page"]',
      '//button[@aria-label="next page"]',
    ],
  },
  'link-140': {
    name: 'link-140',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-143': {
    name: 'link-143',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-146': {
    name: 'link-146',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-149': {
    name: 'link-149',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-152': {
    name: 'link-152',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-155': {
    name: 'link-155',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-158': {
    name: 'link-158',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-161': {
    name: 'link-161',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-164': {
    name: 'link-164',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-167': {
    name: 'link-167',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-170': {
    name: 'link-170',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-173': {
    name: 'link-173',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-176': {
    name: 'link-176',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-179': {
    name: 'link-179',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-182': {
    name: 'link-182',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-185': {
    name: 'link-185',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-188': {
    name: 'link-188',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-191': {
    name: 'link-191',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-194': {
    name: 'link-194',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-197': {
    name: 'link-197',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-200': {
    name: 'link-200',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-203': {
    name: 'link-203',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-206': {
    name: 'link-206',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-209': {
    name: 'link-209',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-212': {
    name: 'link-212',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-215': {
    name: 'link-215',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-218': {
    name: 'link-218',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-221': {
    name: 'link-221',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-224': {
    name: 'link-224',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-227': {
    name: 'link-227',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-230': {
    name: 'link-230',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-233': {
    name: 'link-233',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-236': {
    name: 'link-236',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-239': {
    name: 'link-239',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-242': {
    name: 'link-242',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-245': {
    name: 'link-245',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-248': {
    name: 'link-248',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-251': {
    name: 'link-251',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-254': {
    name: 'link-254',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-257': {
    name: 'link-257',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-260': {
    name: 'link-260',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-263': {
    name: 'link-263',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-266': {
    name: 'link-266',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-269': {
    name: 'link-269',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-272': {
    name: 'link-272',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-275': {
    name: 'link-275',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-278': {
    name: 'link-278',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-281': {
    name: 'link-281',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-284': {
    name: 'link-284',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-287': {
    name: 'link-287',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-290': {
    name: 'link-290',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-293': {
    name: 'link-293',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-296': {
    name: 'link-296',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-299': {
    name: 'link-299',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-302': {
    name: 'link-302',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-305': {
    name: 'link-305',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-308': {
    name: 'link-308',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-311': {
    name: 'link-311',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-314': {
    name: 'link-314',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-317': {
    name: 'link-317',
    tiers: [
      'a._3mPKP',
    ],
  },
  'link-320': {
    name: 'link-320',
    tiers: [
      'a.ic_ih',
    ],
  },
  'link-322': {
    name: 'link-322',
    tiers: [
      'a.ic_ih',
    ],
  },
  'link-323': {
    name: 'link-323',
    tiers: [
      'a.ic_ih',
    ],
  },
  'ds-center': {
    name: 'ds-center',
    tiers: [
      '//a[contains(text(),"DS Center")]',
    ],
  },
  'seller-log-in': {
    name: 'seller-log-in',
    tiers: [
      '//a[contains(text(),"Seller Log In")]',
    ],
  },
  'non-chinese-seller-registration': {
    name: 'non-chinese-seller-registration',
    tiers: [
      '//a[contains(text(),"Non-Chinese Seller Registration")]',
    ],
  },
  'facebook': {
    name: 'facebook',
    tiers: [
      'a[aria-label="facebook"]',
      '//a[@aria-label="facebook"]',
    ],
  },
  'twitter': {
    name: 'twitter',
    tiers: [
      'a[aria-label="twitter"]',
      '//a[@aria-label="twitter"]',
    ],
  },
  'instagram': {
    name: 'instagram',
    tiers: [
      'a[aria-label="instagram"]',
      '//a[@aria-label="instagram"]',
    ],
  },
  'messenger': {
    name: 'messenger',
    tiers: [
      'a[aria-label="messenger"]',
      '//a[@aria-label="messenger"]',
    ],
  },
  'whatapp': {
    name: 'whatapp',
    tiers: [
      'a[aria-label="whatapp"]',
      '//a[@aria-label="whatapp"]',
    ],
  },
  'dsa-osa': {
    name: 'dsa-osa',
    tiers: [
      '//a[contains(text(),"معلومات DSA/OSA")]',
    ],
  },
  'p': {
    name: 'p',
    tiers: [
      '//a[contains(text(),"Pусский")]',
    ],
  },
  'portuguese': {
    name: 'portuguese',
    tiers: [
      '//a[contains(text(),"Portuguese")]',
    ],
  },
  'spanish': {
    name: 'spanish',
    tiers: [
      '//a[contains(text(),"Spanish")]',
    ],
  },
  'french': {
    name: 'french',
    tiers: [
      '//a[contains(text(),"French")]',
    ],
  },
  'german': {
    name: 'german',
    tiers: [
      '//a[contains(text(),"German")]',
    ],
  },
  'italian': {
    name: 'italian',
    tiers: [
      '//a[contains(text(),"Italian")]',
    ],
  },
  'dutch': {
    name: 'dutch',
    tiers: [
      '//a[contains(text(),"Dutch")]',
    ],
  },
  'turkish': {
    name: 'turkish',
    tiers: [
      '//a[contains(text(),"Turkish")]',
    ],
  },
  'japanese': {
    name: 'japanese',
    tiers: [
      '//a[contains(text(),"Japanese")]',
    ],
  },
  'korean': {
    name: 'korean',
    tiers: [
      '//a[contains(text(),"Korean")]',
    ],
  },
  'thai': {
    name: 'thai',
    tiers: [
      '//a[contains(text(),"Thai")]',
    ],
  },
  'arabic': {
    name: 'arabic',
    tiers: [
      '//a[contains(text(),"Arabic")]',
    ],
  },
  'hebrew': {
    name: 'hebrew',
    tiers: [
      '//a[contains(text(),"Hebrew")]',
    ],
  },
  'polish': {
    name: 'polish',
    tiers: [
      '//a[contains(text(),"Polish")]',
    ],
  },
  'alibaba-group-website': {
    name: 'alibaba-group-website',
    tiers: [
      '//a[contains(text(),"Alibaba Group Website")]',
    ],
  },
  'aliexpress': {
    name: 'aliexpress',
    tiers: [
      '//a[contains(text(),"AliExpress")]',
    ],
  },
  'alimama': {
    name: 'alimama',
    tiers: [
      '//a[contains(text(),"Alimama")]',
    ],
  },
  'alipay': {
    name: 'alipay',
    tiers: [
      '//a[contains(text(),"Alipay")]',
    ],
  },
  'fliggy': {
    name: 'fliggy',
    tiers: [
      '//a[contains(text(),"Fliggy")]',
    ],
  },
  'alibaba-cloud': {
    name: 'alibaba-cloud',
    tiers: [
      '//a[contains(text(),"Alibaba Cloud")]',
    ],
  },
  'alibaba-international': {
    name: 'alibaba-international',
    tiers: [
      '//a[contains(text(),"Alibaba International")]',
    ],
  },
  'alitelecom': {
    name: 'alitelecom',
    tiers: [
      '//a[contains(text(),"AliTelecom")]',
    ],
  },
  'dingtalk': {
    name: 'dingtalk',
    tiers: [
      '//a[contains(text(),"DingTalk")]',
    ],
  },
  'juhuasuan': {
    name: 'juhuasuan',
    tiers: [
      '//a[contains(text(),"Juhuasuan")]',
    ],
  },
  'taobao-marketplace': {
    name: 'taobao-marketplace',
    tiers: [
      '//a[contains(text(),"Taobao Marketplace")]',
    ],
  },
  'tmall': {
    name: 'tmall',
    tiers: [
      '//a[contains(text(),"Tmall")]',
    ],
  },
  'taobao-global': {
    name: 'taobao-global',
    tiers: [
      '//a[contains(text(),"Taobao Global")]',
    ],
  },
  'alios': {
    name: 'alios',
    tiers: [
      '//a[contains(text(),"AliOS")]',
    ],
  },
  'intellectual-property-protection': {
    name: 'intellectual-property-protection',
    tiers: [
      '//a[contains(text(),"Intellectual Property Protection")]',
    ],
  },
  'privacy-policy': {
    name: 'privacy-policy',
    tiers: [
      '//a[contains(text(),"Privacy Policy")]',
    ],
  },
  'terms-of-use': {
    name: 'terms-of-use',
    tiers: [
      '//a[contains(text(),"Terms of Use")]',
    ],
  },
  'user-information-legal-enquiry-guide': {
    name: 'user-information-legal-enquiry-guide',
    tiers: [
      '//a[contains(text(),"User Information Legal Enquiry Guide")]',
    ],
  },
  'close': {
    name: 'close',
    tiers: [
      'button[aria-label="Close"]',
      '//button[@aria-label="Close"]',
    ],
  },
  'google': {
    name: 'google',
    tiers: [
      'button[aria-label="google"]',
      '//button[@aria-label="google"]',
    ],
  },
  'link-436': {
    name: 'link-436',
    tiers: [
      'a._1unVQ._2vtTC._3visN',
    ],
  },
  'link-438': {
    name: 'link-438',
    tiers: [
      'a._1unVQ.jWQub._3visN',
    ],
  },
  'apple': {
    name: 'apple',
    tiers: [
      'button[aria-label="apple"]',
      '//button[@aria-label="apple"]',
    ],
  },
  'link-440': {
    name: 'link-440',
    tiers: [
      'a._1unVQ._2TxBE._3visN',
    ],
  },
  'united-arab-emirates': {
    name: 'united-arab-emirates',
    tiers: [
      'button[aria-label="United Arab Emirates"]',
      '//button[@aria-label="United Arab Emirates"]',
    ],
  },
};
