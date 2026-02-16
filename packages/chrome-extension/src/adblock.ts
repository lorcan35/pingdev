// PingOS Ad Blocker — hybrid traditional + AI approach
// Traditional: CSS-based hiding of known ad patterns
// AI: recon-based detection of promotional/clutter elements

// Pages where adblock should be GENTLE (only remove obvious ads, not product elements)
const TRANSACTIONAL_URL_PATTERNS = [
  /\/cart/i, /\/shoppingcart/i, /\/checkout/i, /\/order/i,
  /\/payment/i, /\/wishlist/i, /\/p\/order/i, /\/p\/shoppingcart/i,
  /\/account/i, /\/address/i, /\/returns/i,
];

function isTransactionalPage(): boolean {
  return TRANSACTIONAL_URL_PATTERNS.some(p => p.test(location.href));
}

// Common ad selectors (EasyList-inspired subset for major sites)
const TRADITIONAL_AD_SELECTORS = [
  // Generic ad containers
  '[id*="ad-"], [id*="ads-"], [id*="advert"]',
  '[class*="ad-container"], [class*="ad-wrapper"], [class*="ad-slot"]',
  '[class*="advert"], [class*="ad-banner"], [class*="ad-unit"]',
  '[data-ad], [data-ad-slot], [data-google-query-id]',
  
  // Google Ads
  'ins.adsbygoogle, .google-ad, #google_ads_iframe',
  
  // Common ad networks
  '[id*="taboola"], [class*="taboola"]',
  '[id*="outbrain"], [class*="outbrain"]',
  '[class*="sponsored"], [data-sponsored]',
  
  // Popups and overlays
  '[class*="popup-overlay"], [class*="modal-overlay"]',
  '[class*="cookie-banner"], [class*="cookie-consent"]',
  '[id*="cookie"], [class*="gdpr"]',
  
  // Newsletter/signup prompts
  '[class*="newsletter-popup"], [class*="signup-modal"]',
  '[class*="subscribe-overlay"]',
  
  // Social media widgets (clutter)
  '[class*="social-share-"], [class*="share-buttons"]',
  
  // Amazon-specific
  '.AdHolder, [cel_widget_id*="adplacements"]',
  '#ad-endcap-1, #percolate-ui-lpo_div',
  '[class*="sponsored-products"], .s-sponsored-label-info-icon',
  '#nav-swmslot, #rhf',
  
  // AliExpress-specific
  '[class*="banner-ad"], [class*="top-banner"]',
  '.ui-newuser, [class*="coupon-popup"], [class*="new-user"]',
  '[class*="floating-bar"], [class*="download-app"]',
  
  // Generic clutter
  '[class*="sticky-footer"], [class*="bottom-bar"]',
  '[class*="app-download"], [class*="download-banner"]',
  'iframe[src*="doubleclick"], iframe[src*="googlesyndication"]',
  'iframe[src*="amazon-adsystem"]',
];

// Selectors for elements that should be hidden but might break layout if removed
const SOFT_HIDE_SELECTORS = [
  '[class*="sidebar-ad"]',
  '[class*="right-rail-ad"]',
];

/** Inject CSS to hide known ad elements — fast, no DOM manipulation */
export function injectAdBlockCSS(): void {
  const style = document.createElement('style');
  style.id = 'pingos-adblock';
  style.textContent = `
    ${TRADITIONAL_AD_SELECTORS.join(',\n    ')} {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      overflow: hidden !important;
      pointer-events: none !important;
    }
    ${SOFT_HIDE_SELECTORS.join(',\n    ')} {
      opacity: 0 !important;
      pointer-events: none !important;
      max-height: 0 !important;
      overflow: hidden !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

// Safe-only selectors for transactional pages (cart, checkout, orders)
const SAFE_AD_SELECTORS = [
  'ins.adsbygoogle, .google-ad, #google_ads_iframe',
  '[id*="taboola"], [class*="taboola"]',
  '[id*="outbrain"], [class*="outbrain"]',
  '[class*="cookie-banner"], [class*="cookie-consent"]',
  '[id*="cookie"], [class*="gdpr"]',
  '[class*="newsletter-popup"], [class*="signup-modal"]',
  '[class*="subscribe-overlay"]',
  '[class*="app-download"], [class*="download-banner"]',
  '[class*="floating-bar"], [class*="download-app"]',
  'iframe[src*="doubleclick"], iframe[src*="googlesyndication"]',
  'iframe[src*="amazon-adsystem"]',
  '.ui-newuser, [class*="coupon-popup"], [class*="new-user"]',
];

/** Remove ad elements from DOM entirely (more aggressive) */
export function removeAdElements(): { removed: number; selectors: string[] } {
  const transactional = isTransactionalPage();
  const allSelectors = transactional
    ? SAFE_AD_SELECTORS
    : [...TRADITIONAL_AD_SELECTORS, ...SOFT_HIDE_SELECTORS];
  let removed = 0;
  const matched: string[] = [];
  
  for (const sel of allSelectors) {
    try {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        // On transactional pages, never remove elements inside product/cart containers
        const safeEls = transactional
          ? Array.from(els).filter(el => !el.closest('[class*="cart"], [class*="order"], [class*="product"], [class*="item-card"], [class*="checkout"]'))
          : Array.from(els);
        if (safeEls.length > 0) {
          matched.push(`${sel} (${safeEls.length})`);
          safeEls.forEach(el => {
            el.remove();
            removed++;
          });
        }
      }
    } catch { /* invalid selector, skip */ }
  }
  
  return { removed, selectors: matched };
}

/** AI-enhanced cleanup: detect elements that look like ads/clutter based on heuristics */
export function detectClutter(): Array<{ selector: string; reason: string; confidence: number }> {
  const clutter: Array<{ selector: string; reason: string; confidence: number }> = [];
  
  // Heuristic 1: Fixed/sticky position overlays (likely popups/banners)
  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    if ((style.position === 'fixed' || style.position === 'sticky') && 
        el.tagName !== 'NAV' && el.tagName !== 'HEADER' &&
        !el.matches('[role="navigation"], [role="banner"]')) {
      const rect = el.getBoundingClientRect();
      // Large fixed elements that aren't nav are likely banners/popups
      if (rect.height > 60 && rect.width > window.innerWidth * 0.5) {
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className ? `.${el.className.split(' ')[0]}` : '';
        clutter.push({
          selector: id || cls || el.tagName.toLowerCase(),
          reason: 'Large fixed/sticky overlay — likely banner or popup',
          confidence: 0.7,
        });
      }
    }
  });
  
  // Heuristic 2: Iframes from known ad domains
  document.querySelectorAll('iframe').forEach((iframe) => {
    const src = iframe.src || '';
    const adDomains = ['doubleclick', 'googlesyndication', 'amazon-adsystem', 'taboola', 'outbrain', 'facebook.com/plugins'];
    if (adDomains.some(d => src.includes(d))) {
      clutter.push({
        selector: `iframe[src*="${src.substring(0, 40)}"]`,
        reason: `Ad network iframe: ${src.substring(0, 60)}`,
        confidence: 0.95,
      });
    }
  });
  
  // Heuristic 3: Elements with ad-related text
  const adKeywords = /sponsored|advertisement|promoted|ad\b|ads\b|advert/i;
  document.querySelectorAll('[class], [id]').forEach(el => {
    const attrs = `${el.id} ${el.className}`;
    if (adKeywords.test(attrs)) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const sel = el.id ? `#${el.id}` : `.${el.className.split(' ')[0]}`;
        clutter.push({
          selector: sel,
          reason: `Ad-related class/id: ${attrs.substring(0, 40)}`,
          confidence: 0.8,
        });
      }
    }
  });
  
  return clutter;
}

/** Full cleanup: traditional + AI heuristic */
export function fullCleanup(): { cssInjected: boolean; removed: number; clutterDetected: number; transactional: boolean } {
  const transactional = isTransactionalPage();
  
  // On transactional pages, skip CSS injection (too broad) — only do targeted removal
  if (!transactional) {
    injectAdBlockCSS();
  }
  
  const { removed } = removeAdElements();
  const clutter = detectClutter();
  
  // Remove high-confidence clutter (but not on transactional pages)
  let extraRemoved = 0;
  if (!transactional) {
    for (const item of clutter) {
      if (item.confidence >= 0.8) {
        try {
          document.querySelectorAll(item.selector).forEach(el => {
            el.remove();
            extraRemoved++;
          });
        } catch { /* skip */ }
      }
    }
  }
  
  return {
    cssInjected: !transactional,
    removed: removed + extraRemoved,
    clutterDetected: clutter.length,
    transactional,
  };
}
