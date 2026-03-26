/**
 * PingApp Routes — High-level app actions mounted on the gateway
 * 
 * Pattern: /v1/app/:appName/:action
 * Each app is a "device driver" for a website — named actions instead of raw selectors.
 * 
 * Currently: aliexpress
 * Future: claude, amazon, perplexity, twitter, etc.
 */

import type { FastifyInstance } from 'fastify';
import { googleAuth, checkGoogleAuth } from './google-auth.js';

const ROUTE_TIMEOUT_MS = 20_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPageLoad(
  gateway: string,
  deviceId: string,
  selector: string,
  fallbackMs = 3000,
  timeoutMs = 10_000,
): Promise<void> {
  try {
    await deviceOp(gateway, deviceId, 'waitFor', {
      selector,
      timeoutMs,
    });
  } catch {
    // Selector not found in time — fall back to a bounded delay.
    await delay(fallbackMs);
  }
}

async function waitForAliExpressPrices(gateway: string, deviceId: string, timeoutMs = 12_000): Promise<void> {
  return waitForPageLoad(
    gateway,
    deviceId,
    '[class*="price"], [class*="Price"], [data-pl*="price"], [data-testid*="price"]',
    1500,
    timeoutMs,
  );
}

/**
 * Navigate only if the tab isn't already on the target URL.
 * After navigation, waits for the content script to reconnect.
 */
async function navigateIfNeeded(
  gateway: string,
  deviceId: string,
  targetUrl: string,
  waitSelector: string,
  fallbackMs = 4000,
  timeoutMs = 12_000,
): Promise<void> {
  // Check current URL
  try {
    const current = await deviceOp(gateway, deviceId, 'eval', { expression: 'window.location.href' });
    const currentUrl = current?.result || '';
    // If already on the right page, just wait for selector
    if (currentUrl === targetUrl || currentUrl === targetUrl + '/') {
      return;
    }
    // For same-origin, check if only path differs
    if (currentUrl.startsWith(targetUrl.replace(/\/$/, ''))) {
      return;
    }
  } catch {
    // Content script may be dead — navigate anyway
  }

  // Navigate
  try {
    await deviceOp(gateway, deviceId, 'eval', { expression: `window.location.href = ${JSON.stringify(targetUrl)}` });
  } catch {
    // Navigation kills content script — this error is expected
  }

  // Wait for page to load with increased timeout for ARM devices
  await waitForPageLoad(gateway, deviceId, waitSelector, fallbackMs, timeoutMs);
}

async function extractWithRetries<T>(
  gateway: string,
  deviceId: string,
  expression: string,
  hasData: (value: T) => boolean,
  retries = 2,
  retryDelayMs = 1500,
): Promise<any> {
  let result = await deviceOp(gateway, deviceId, 'eval', { expression });
  for (let i = 0; i < retries; i++) {
    if (hasData(result?.result as T)) return result;
    await delay(retryDelayMs);
    result = await deviceOp(gateway, deviceId, 'eval', { expression });
  }
  return result;
}

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs = ROUTE_TIMEOUT_MS): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...(init || {}), signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Helper: call extension device op
async function deviceOp(gateway: string, deviceId: string, op: string, payload: any = {}): Promise<any> {
  try {
    return await fetchJsonWithTimeout(
      `${gateway}/v1/dev/${deviceId}/${op}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      ROUTE_TIMEOUT_MS,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`deviceOp ${op} failed for ${deviceId}: ${detail}`);
  }
}

// Helper: find device by domain
async function findDeviceByDomain(gateway: string, domain: string): Promise<string | null> {
  try {
    const data: any = await fetchJsonWithTimeout(`${gateway}/v1/devices`, undefined, ROUTE_TIMEOUT_MS);
    const devices = data?.extension?.devices || [];
    const match = devices.find((d: any) => d.url?.includes(domain));
    return match?.deviceId || null;
  } catch {
    return null;
  }
}

// Helper: find AliExpress device
async function findDevice(gateway: string): Promise<string | null> {
  return findDeviceByDomain(gateway, 'aliexpress');
}

async function setAliExpressLocale(gateway: string, deviceId: string): Promise<void> {
  await deviceOp(gateway, deviceId, 'eval', {
    expression: `(() => {
      document.cookie = "aep_usuc_f=site=glo&c_tp=USD&region=AE&b_locale=en_US; path=/; domain=.aliexpress.com";
      document.cookie = "intl_locale=en_US; path=/; domain=.aliexpress.com";
      return true;
    })()`,
  });
}

/**
 * Selector maps for self-heal integration.
 * Maps field names → CSS selectors so broken selectors can be healed
 * individually via the gateway's JIT self-heal pipeline.
 */
const SELECTOR_MAPS: Record<string, Record<string, string | string[]>> = {
  productDetails: {
    title: '[data-pl=product-title], h1:not(:first-of-type), h1[class*=title]',
    price: '[class*=price], [class*=Price]',
    rating: '[class*=rating], [class*=star]',
    reviews: '[class*=review], [class*=Review]',
    store: '[class*=store-detail--storeName], [class*=store-detail] a, [class*=store-name], [class*=Store] a',
    shipping: '[class*=shipping], [class*=delivery]',
    sold: '[class*=sold], [class*=trade]',
  },
  amazonProduct: {
    title: '#productTitle, #title',
    price: '.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, [class*=priceToPay]',
    rating: '#acrPopover, [class*=averageStarRating]',
    reviews: '#acrCustomerReviewText',
    seller: '#sellerProfileTriggerId, #merchant-info',
    availability: '#availability',
  },
  // AliExpress search results
  searchResults: {
    title: 'h3, h1, [class*=title]',
    price: '[class*=price], [class*=Price]',
    rating: '[class*=star], [class*=rating]',
    sold: '[class*=sold], [class*=trade]',
    img: 'img',
  },
  // AliExpress cart
  cartItems: {
    title: '[class*=title], a[href*=item]',
    price: '[class*=price], [class*=Price]',
    quantity: '[class*=quantity] input, [class*=count]',
    store: '[class*=store], [class*=Store]',
  },
  // Amazon search
  amazonSearch: {
    title: 'h2 a, a[class*="s-line-clamp"], a[class*="s-link-style"]',
    price: '.a-price .a-offscreen, .a-price-whole',
    rating: '.a-icon-alt, [class*=rating], [aria-label*=star]',
    reviews: '[class*=review]',
    img: 'img',
  },
  // Claude.ai
  claudeResponse: {
    text: '.font-claude-response',
  },
  claudeConversations: {
    title: 'a[href*="/chat/"]',
  },
  claudeModel: {
    text: '[data-testid="model-selector-dropdown"]',
  },
  claudeProjects: {
    title: 'a[href*="/project/"], a[href*="/projects/"]',
  },
  claudeArtifacts: {
    title: 'a[href*="/artifacts"]',
  },
  // ChatGPT
  chatgptResponse: {
    text: '[data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"] [class*="markdown"], div.agent-turn',
  },
  chatgptConversations: {
    title: 'nav a[href*="/c/"]',
  },
  chatgptModel: {
    text: '[data-testid="model-selector-dropdown"], button[class*="model"]',
  },
  // YouTube
  youtubeSearch: {
    title: '#video-title, h3 a, a#video-title',
    channel: '#channel-name a, ytd-channel-name a, [class*="channel-name"] a',
    views: '#metadata-line, .ytd-video-meta-block',
    duration: 'ytd-thumbnail-overlay-time-status-renderer, [class*="time-status"]',
  },
  youtubeVideo: {
    title: '#title h1 yt-formatted-string, #title h1, h1.ytd-watch-metadata',
    channel: '#channel-name a, ytd-video-owner-renderer #channel-name a',
    views: '#info-strings, #info-text, ytd-watch-info-text',
    likes: 'like-button-view-model button, ytd-toggle-button-renderer #text, [aria-label*="like"]',
    description: '#description-inner, ytd-text-inline-expander #snippet-text, #description .content',
  },
  // Gmail
  gmailInbox: {
    from: '.yX.xY .yW span[email], .yW span.bA4, td.xW .yW span, [data-hovercard-id]',
    subject: '.y6 span, .bog span, .bqe, td.xY .xS .xT .y6 span',
    snippet: '.y2, .xS .xT .y2',
    date: '.xW, td.xW span[title], .xW span',
  },
  gmailMessage: {
    sender: '.gD, [email], .go span[email], [data-hovercard-id]',
    subject: 'h2.hP, .ha h2, [data-thread-perm-id] h2',
    date: '.gH .gK span[title], .g3, .gH .gK',
    body: '.a3s.aiL, .a3s, .ii.gt div, [role="listitem"] .a3s',
  },
  // Google Calendar
  calendarEvents: {
    title: '[data-eventid], [data-eventchip], [role="button"][data-eventid]',
  },
  // Reddit
  redditFeed: {
    title: 'a[slot="title"], [slot="title"], h3, a[data-click-id="body"]',
    subreddit: 'faceplate-tracker[source="subreddit"] a, a[data-click-id="subreddit"]',
    score: 'faceplate-number[type="score"], [id*="vote-score"]',
    comments: 'a[href*="/comments/"] span, [data-click-id="comments"]',
  },
  redditPost: {
    title: 'shreddit-post [slot="title"], h1[slot="title"], [data-testid="post-container"] h1, h1',
    body: '[slot="text-body"], [data-click-id="text"], .Post [class*="RichText"], [id*="post-rtjson-content"]',
    author: 'a[href*="/user/"]',
  },
  // GitHub
  githubSearch: {
    name: 'a.v-align-middle, a[data-testid="link-to-search-result"], .search-title a',
    description: 'p, .mb-1, [class*="description"], h3 ~ div',
    language: '[itemprop="programmingLanguage"], .repo-language-color + span, span[aria-label*="language"]',
    stars: 'a[href*="/stargazers"]',
  },
  githubRepo: {
    name: '[itemprop="name"], strong[itemprop="name"] a, .AppHeader-context-item-label',
    owner: '[rel="author"], [itemprop="author"] a',
    description: '[class*="BorderGrid"] p, .f4.my-3, [itemprop="about"], .repository-content .f4',
    stars: '#repo-stars-counter-star, a[href*="stargazers"] .Counter, a[href*="stargazers"] span',
    forks: '#repo-network-counter, a[href*="forks"] .Counter, a[href*="forks"] span',
    language: '[class*="BorderGrid"] [itemprop="programmingLanguage"], .repository-lang-stats a span',
  },
  githubTrending: {
    name: 'h2 a, h1 a',
    description: 'p, .col-9',
    language: '[itemprop="programmingLanguage"]',
    stars: 'a[href*="/stargazers"]',
    todayStars: '.d-inline-block.float-sm-right, .float-sm-right',
  },
  // X / Twitter
  xTweets: {
    author: '[data-testid="User-Name"]',
    text: '[data-testid="tweetText"]',
    likes: '[data-testid="like"] span, [data-testid="unlike"] span',
    retweets: '[data-testid="retweet"] span, [data-testid="unretweet"] span',
    replies: '[data-testid="reply"] span',
  },
  xProfile: {
    name: '[data-testid="UserName"] span, h2[role="heading"] span',
    bio: '[data-testid="UserDescription"]',
    location: '[data-testid="UserLocation"]',
    followers: 'a[href*="/followers"], a[href*="/verified_followers"]',
    following: 'a[href*="/following"]',
  },
  // LinkedIn
  linkedinFeed: {
    author: '.update-components-actor__name span, .feed-shared-actor__name span',
    content: '.feed-shared-text span, .update-components-text span',
    likes: '.social-details-social-counts__reactions-count, [data-test-id="social-actions__reaction-count"]',
    comments: '.social-details-social-counts__comments, [aria-label*="comment"]',
  },
  linkedinProfile: {
    name: '.text-heading-xlarge, h1',
    headline: '.text-body-medium, .pv-top-card--list .text-body-medium',
    about: '#about ~ div .inline-show-more-text span, section.pv-about-section p',
    location: '.text-body-small[class*="break-words"], .pv-top-card--list-bullet li',
    connections: '[href*="/connections"] span, .pv-top-card--list .t-bold',
  },
  linkedinJobs: {
    title: '.job-card-list__title, a[class*="job-card"]',
    company: '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle',
    location: '.job-card-container__metadata-item, .artdeco-entity-lockup__caption',
  },
  // Hacker News
  hnStories: {
    title: '.titleline a',
    score: '.score',
    author: '.hnuser',
    site: '.sitebit a, .sitestr',
  },
  hnComments: {
    author: '.hnuser',
    text: '.commtext',
  },
  // Substack
  substackFeed: {
    title: 'h2, h3, [class*="post-preview-title"]',
    author: '[class*="author"], [class*="pub-name"], .post-preview-byline',
    excerpt: '[class*="subtitle"], [class*="description"], p',
  },
  substackArticle: {
    title: 'h1, [class*="post-title"]',
    author: '[class*="author-name"], [class*="byline"] a',
    content: '[class*="body"], .available-content, article .markup',
  },
  // Google Sheets
  sheetsActiveCell: {
    nameBox: '#t-name-box',
    formulaBar: '#t-formula-bar-input .cell-input',
  },
  sheetsList: {
    tabs: '.docs-sheet-tab-name',
  },
};

/**
 * healableExtract — tries fast eval first, then heals broken fields via
 * individual `read` ops (which trigger JIT self-heal in the gateway).
 */
async function healableExtract<T extends Record<string, unknown>>(
  gateway: string,
  deviceId: string,
  expression: string,
  selectorMap: Record<string, string | string[]> | undefined,
  hasData: (value: T) => boolean,
  requiredFields: string[] = [],
  retries = 2,
  retryDelayMs = 1500,
): Promise<{ result: T; _healed?: Record<string, string> }> {
  // 1. Fast path: eval with retries (existing behavior)
  let result = await extractWithRetries<T>(gateway, deviceId, expression, hasData, retries, retryDelayMs);
  const data = result?.result as T;

  // If no selector map or data is complete, return fast path result
  if (!selectorMap || !data) return { result: data };

  // 2. Check which required fields are empty
  const emptyFields = (requiredFields.length ? requiredFields : Object.keys(selectorMap))
    .filter((field) => {
      const val = data[field];
      return val === '' || val === undefined || val === null;
    });

  if (emptyFields.length === 0) return { result: data };

  // 3. Heal empty fields via individual `read` operations
  //    These go through gateway → self-heal pipeline automatically
  const healed: Record<string, string> = {};
  for (const field of emptyFields) {
    const selectors = selectorMap[field];
    if (!selectors) continue;

    // Try each selector in the comma-separated list
    const selectorList = typeof selectors === 'string'
      ? selectors.split(',').map((s) => s.trim())
      : selectors;

    for (const sel of selectorList) {
      try {
        const readResult = await deviceOp(gateway, deviceId, 'read', { selector: sel });
        const text = typeof readResult?.result === 'string'
          ? readResult.result.trim()
          : (readResult?.result?.text || '').trim();
        if (text) {
          healed[field] = text;
          (data as any)[field] = text;
          break;
        }
      } catch {
        // read failed for this selector — self-heal may have been attempted
        // in the gateway; continue to next selector
      }
    }
  }

  return {
    result: data,
    ...(Object.keys(healed).length > 0 ? { _healed: healed } : {}),
  };
}

// Extractors (inline for zero-dep)
const EXTRACTORS = {
  searchResults: `(() => {
    const cards = document.querySelectorAll('a[href*="/item/"]');
    const seen = new Set();
    const products = [];
    for (const a of cards) {
      const href = a.href;
      const idMatch = href.match(/item\\/(\\d+)/);
      if (!idMatch || seen.has(idMatch[1])) continue;
      seen.add(idMatch[1]);
      const card = a.closest('[class*=card], [class*=Card], [class*=list-item]') || a;
      const title = card.querySelector('h3, h1, [class*=title]')?.textContent?.trim() || '';
      const price = card.querySelector('[class*=price], [class*=Price]')?.textContent?.trim() || '';
      const rating = card.querySelector('[class*=star], [class*=rating]')?.textContent?.trim() || '';
      const sold = card.querySelector('[class*=sold], [class*=trade]')?.textContent?.trim() || '';
      const img = card.querySelector('img')?.src || '';
      if (title.length > 5) products.push({ id: idMatch[1], title: title.substring(0, 100), price, rating, sold, img: img.substring(0, 150), url: href.split('?')[0] });
    }
    return products.slice(0, 20);
  })()`,

  productDetails: `(() => {
    const title = document.querySelector('[data-pl=product-title]')?.textContent?.trim() || document.querySelector('h1:not(:first-of-type), h1[class*=title]')?.textContent?.trim() || '';
    const priceEls = document.querySelectorAll('[class*=price], [class*=Price]');
    const price = priceEls[0]?.textContent?.trim() || '';
    const originalPrice = priceEls[1]?.textContent?.trim() || '';
    const rating = document.querySelector('[class*=rating], [class*=star]')?.textContent?.trim() || '';
    const reviews = document.querySelector('[class*=review], [class*=Review]')?.textContent?.trim() || '';
    const storeEl = document.querySelector('[class*=store-detail--storeName], [class*=store-detail] a, [class*=store-name], [class*=Store] a');
    const storeRaw = storeEl?.textContent?.trim() || '';
    const store = storeRaw.replace(/^Sold\\s*By/i, '').trim();
    const shipping = document.querySelector('[class*=shipping], [class*=delivery]')?.textContent?.trim() || '';
    const sold = document.querySelector('[class*=sold], [class*=trade]')?.textContent?.trim() || '';
    const variants = [];
    document.querySelectorAll('[class*=sku-item--wrap], [class*=sku-property]').forEach(group => {
      const name = group.querySelector('[class*=sku-item--title], [class*=title], [class*=name]')?.textContent?.trim() || '';
      const imgOptions = Array.from(group.querySelectorAll('[class*=sku-item--image]')).map(el => el.getAttribute('title') || el.querySelector('img')?.alt || '').filter(Boolean);
      const textOptions = Array.from(group.querySelectorAll('[class*=sku-item--text]')).map(o => o.textContent?.trim()).filter(Boolean);
      const options = imgOptions.length ? imgOptions : textOptions.length ? textOptions : Array.from(group.querySelectorAll('button, [role=button]')).map(o => o.getAttribute('title') || o.textContent?.trim()).filter(t => t && t.length < 50);
      if (name || options.length) variants.push({ name, options });
    });
    return { title, price, originalPrice, rating, reviews, store, shipping, sold, variants, url: location.href.split('?')[0], id: location.href.match(/item\\/(\\d+)/)?.[1] || '' };
  })()`,

  cartItems: `(() => {
    const text = document.body.innerText;
    const cartMatch = text.match(/Cart\\s*\\((\\d+)\\)/);
    const items = [];
    document.querySelectorAll('[class*=order-item], [class*=product-item], [class*=cart-item]').forEach(el => {
      const title = el.querySelector('[class*=title], a[href*=item]')?.textContent?.trim() || '';
      const price = el.querySelector('[class*=price], [class*=Price]')?.textContent?.trim() || '';
      const qty = el.querySelector('[class*=quantity] input, [class*=count]')?.value || '1';
      const store = el.querySelector('[class*=store], [class*=Store]')?.textContent?.trim() || '';
      if (title.length > 5) items.push({ title: title.substring(0, 100), price, quantity: qty, store });
    });
    const total = text.match(/Estimated total\\s+([\\w\\s$.,]+)/)?.[1]?.trim() || '';
    return { items, count: cartMatch ? parseInt(cartMatch[1]) : items.length, total, rawText: items.length === 0 ? text.substring(0, 800) : undefined };
  })()`,

  amazonSearch: `(() => {
    const cleanPrice = (text) => {
      if (!text) return '';
      const compact = text.replace(/\\s+/g, ' ').trim();
      const moneyMatch = compact.match(/(?:AED|\\$|€|£|₹|SAR|EGP)\\s*\\d+[\\d,]*(?:\\.\\d{1,2})?/i);
      if (moneyMatch) return moneyMatch[0].replace(/\\s+/g, ' ').trim();
      const trailing = compact.match(/\\d+[\\d,]*(?:\\.\\d{1,2})?/);
      return trailing ? trailing[0] : compact;
    };

    const baseUrl = location.origin;
    const items = [];
    // Prefer the specific search-result component type; fall back to any [data-asin]
    let cards = document.querySelectorAll('[data-component-type="s-search-result"][data-asin]');
    if (!cards.length) cards = document.querySelectorAll('.s-result-item[data-asin]');
    if (!cards.length) cards = document.querySelectorAll('[data-asin]');
    cards.forEach(el => {
      const asin = el.getAttribute('data-asin');
      if (!asin || asin.length < 5) return;
      // Title: Amazon.ae puts brand in h2 and product name in a.s-line-clamp link
      const brand = el.querySelector('h2')?.textContent?.trim() || '';
      const titleLink = el.querySelector('a[class*="s-line-clamp"], a[class*="s-link-style"]');
      const linkText = titleLink?.textContent?.trim() || '';
      const title = brand && linkText && !linkText.toLowerCase().startsWith(brand.toLowerCase()) ? (brand + ' ' + linkText) : (linkText || brand);
      // Price: find the first link/span with a currency pattern in the card
      const priceEl = el.querySelector('.a-price .a-offscreen') || el.querySelector('.a-price-whole');
      let primaryPrice = priceEl?.textContent?.trim() || '';
      if (!primaryPrice) {
        var allLinks = el.querySelectorAll('a, span');
        for (var li = 0; li < allLinks.length; li++) {
          var lt = allLinks[li].textContent || '';
          if (/(?:AED|\\$|€|£|₹)\s*\d/.test(lt) && lt.length < 40) { primaryPrice = lt.trim(); break; }
        }
      }
      const price = cleanPrice(primaryPrice);
      const rating = el.querySelector('.a-icon-alt')?.textContent?.trim() || el.querySelector('[class*=rating]')?.textContent?.trim() || '';
      const reviewsEl = el.querySelector('[aria-label*=star]') || el.querySelector('[class*=review]');
      const reviews = reviewsEl?.getAttribute('aria-label') || reviewsEl?.textContent?.trim() || '';
      const img = el.querySelector('img')?.src || '';
      const prime = !!el.querySelector('[class*=prime], [aria-label*="Prime"]');
      // Accept products with a title even if price is missing (some results show "See options")
      if (title.length > 3) {
        items.push({ asin, title: title.substring(0, 120), price: price || 'N/A', rating: rating.substring(0, 30), reviews: reviews.substring(0, 40), img: img.substring(0, 200), prime, url: baseUrl + '/dp/' + asin });
      }
    });
    return items.slice(0, 20);
  })()`,

  amazonProduct: `(() => {
    const title = document.querySelector('#productTitle, #title')?.textContent?.trim() || '';
    const price = document.querySelector('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, [class*=priceToPay]')?.textContent?.trim() || '';
    const rating = document.querySelector('#acrPopover, [class*=averageStarRating]')?.textContent?.trim() || '';
    const reviews = document.querySelector('#acrCustomerReviewText')?.textContent?.trim() || '';
    const seller = document.querySelector('#sellerProfileTriggerId, #merchant-info')?.textContent?.trim() || '';
    const availability = document.querySelector('#availability')?.textContent?.trim() || '';
    const prime = !!document.querySelector('[class*=prime], #pantryBadge');
    const imgs = Array.from(document.querySelectorAll('#altImages img, #imageBlock img')).slice(0, 5).map(i => i.src || '');
    const features = Array.from(document.querySelectorAll('#feature-bullets li')).map(li => li.textContent?.trim() || '').filter(Boolean).slice(0, 8);
    const asin = location.href.match(/\\/dp\\/([A-Z0-9]+)/)?.[1] || '';
    return { title, price, rating, reviews, seller, availability, prime, images: imgs, features, asin, url: location.href.split('?')[0] };
  })()`,


  claudeResponse: `(() => {
    const msgs = document.querySelectorAll('.font-claude-response');
    const last = msgs[msgs.length - 1];
    return last ? last.textContent?.trim()?.substring(0, 5000) || '' : '';
  })()`,

  claudeConversations: `(() => {
    const links = document.querySelectorAll('a[href*="/chat/"]');
    const seen = new Set();
    return Array.from(links)
      .map(a => {
        const title = (a.textContent || '').trim();
        const href = a.href || a.getAttribute('href') || '';
        const id = href.match(/\\/chat\\/([0-9a-f-]{36})/)?.[1] || href.match(/\\/chat\\/([^?#/]+)/)?.[1] || '';
        return { title, url: href, id };
      })
      .filter(x => {
        if (!x.id || x.id.length < 4) return false;
        if (!x.title || x.title.length < 2) return false;
        if (/^(new chat|start|upgrade|settings|projects?|artifacts?)$/i.test(x.title)) return false;
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      })
      .slice(0, 30)
      .map(x => ({ ...x, title: x.title.substring(0, 120) }));
  })()`,

  claudeModel: `(() => {
    const modelBtn = document.querySelector('[data-testid="model-selector-dropdown"]');
    if (!modelBtn) return 'unknown';
    const text = modelBtn.textContent?.trim() || '';
    return text.replace(/Extended$/, ' Extended').replace(/\\s+/g, ' ').trim() || 'unknown';
  })()`,

  claudeProjects: `(() => {
    const links = document.querySelectorAll('a[href*="/project/"], a[href*="/projects/"]');
    const seen = new Set();
    return Array.from(links)
      .map(a => ({
        title: a.textContent?.trim()?.substring(0, 80) || '',
        url: a.href,
        id: a.href.match(/\/projects?\/([^/?#]+)/)?.[1] || ''
      }))
      .filter(x => x.id && x.id !== 'projects' && x.title.length > 2 && !seen.has(x.id) && seen.add(x.id))
      .slice(0, 30);
  })()`,

  claudeArtifacts: `(() => {
    const links = document.querySelectorAll('a[href*="/artifacts"]');
    return Array.from(links).slice(0, 30).map(a => ({
      title: a.textContent?.trim()?.substring(0, 120) || 'Artifact',
      url: a.href,
      id: a.href.match(/\/artifacts\/?([^/?#]+)?/)?.[1] || ''
    }));
  })()`,

  chatgptResponse: `(() => {
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      const md = last.querySelector('.markdown, [class*="markdown"]');
      return (md || last).textContent?.trim()?.substring(0, 5000) || '';
    }
    const turns = document.querySelectorAll('div.agent-turn');
    if (turns.length > 0) {
      return turns[turns.length - 1].textContent?.trim()?.substring(0, 5000) || '';
    }
    return '';
  })()`,

  chatgptConversations: `(() => {
    const links = document.querySelectorAll('nav a[href*="/c/"]');
    const seen = new Set();
    return Array.from(links)
      .map(a => {
        const title = (a.textContent || '').trim();
        const href = a.href || '';
        const id = href.match(/\\/c\\/([^?#/]+)/)?.[1] || '';
        return { title, url: href, id };
      })
      .filter(x => {
        if (!x.id || !x.url.includes('/c/')) return false;
        if (!x.title || x.title.length < 3) return false;
        if (/new chat|upgrade|settings/i.test(x.title)) return false;
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      })
      .slice(0, 30)
      .map(x => ({ ...x, title: x.title.substring(0, 120) }));
  })()`,

  chatgptModel: `(() => {
    const btn = document.querySelector('[data-testid="model-selector-dropdown"]');
    if (btn) return btn.textContent?.trim() || 'unknown';
    const modelEls = document.querySelectorAll('button[class*="model"]');
    for (const el of modelEls) {
      const t = el.textContent?.trim() || '';
      if (t && t.length < 50 && /gpt|o[1-9]|4o/i.test(t)) return t;
    }
    return 'unknown';
  })()`,

  orders: `(() => {
    const text = document.body.innerText;
    const blocks = text.split(/(?=Completed|Processing|Shipped|To pay|To ship)/g).filter(b => b.includes('Order ID'));
    const orders = blocks.map(b => {
      const id = b.match(/Order ID:\\s*(\\d+)/)?.[1] || '';
      const date = b.match(/Order date:\\s*([\\w\\s,]+?)(?=Order|$)/)?.[1]?.trim() || '';
      const total = b.match(/Total:?\\s*(\\S+\\s*\\S+)/)?.[1]?.trim() || '';
      const status = b.match(/^(Completed|Processing|Shipped|To pay|To ship)/)?.[1] || '';
      return { orderId: id, date, total, status };
    }).filter(o => o.orderId);
    return { orders, count: orders.length };
  })()`,

  // ── YouTube extractors ──
  youtubeSearch: `(() => {
    const results = [];
    const seen = new Set();

    // 1. Standard search/home: ytd-video-renderer / ytd-rich-item-renderer
    document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer').forEach(card => {
      const titleEl = card.querySelector('#video-title, h3 a, a#video-title');
      const title = titleEl?.textContent?.trim() || '';
      const url = titleEl?.closest('a')?.href || titleEl?.href || '';
      const videoId = url.match(/v=([^&]+)/)?.[1] || '';
      if (videoId && seen.has(videoId)) return;
      if (videoId) seen.add(videoId);
      const channel = card.querySelector('#channel-name a, ytd-channel-name a, [class*="channel-name"] a')?.textContent?.trim() || '';
      const metaLine = card.querySelector('#metadata-line, .ytd-video-meta-block');
      const metaText = metaLine?.textContent?.trim() || '';
      const viewsMatch = metaText.match(/([\\d,.]+[KMB]?)\\s*views/i);
      const views = viewsMatch ? viewsMatch[1] + ' views' : '';
      const timeEl = card.querySelector('ytd-thumbnail-overlay-time-status-renderer, [class*="time-status"], span.ytd-thumbnail-overlay-time-status-renderer');
      const durationRaw = timeEl?.textContent?.trim() || '';
      const duration = durationRaw.split(/\\s{2,}|\\n/)[0].trim();
      const thumbnail = videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : '';
      if (title.length > 3) results.push({ title: title.substring(0, 120), channel, views, duration, thumbnail, url: url.split('&')[0] });
    });

    // 2. Explore/trending page: yt-lockup-view-model (different DOM structure)
    document.querySelectorAll('yt-lockup-view-model').forEach(card => {
      const titleA = card.querySelector('h3 a');
      const title = titleA?.textContent?.trim() || '';
      const url = titleA?.href || '';
      const videoId = url.match(/v=([^&]+)/)?.[1] || '';
      if (!title || (videoId && seen.has(videoId))) return;
      if (videoId) seen.add(videoId);
      const spans = Array.from(card.querySelectorAll('yt-lockup-metadata-view-model span')).map(s => s.textContent?.trim()).filter(Boolean);
      const channelLink = card.querySelector('a[href*="/channel/"], a[href*="/@"]');
      const channel = channelLink?.textContent?.trim() || '';
      const viewsSpan = spans.find(s => /views/i.test(s));
      const views = viewsSpan || '';
      const durationEl = card.querySelector('a[href*="watch"]:not(:has(h3))');
      const duration = durationEl?.textContent?.trim() || '';
      const thumbnail = videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : '';
      if (title.length > 3) results.push({ title: title.substring(0, 120), channel, views, duration, thumbnail, url: url.split('&')[0] });
    });

    return results.slice(0, 20);
  })()`,

  youtubeVideo: `(() => {
    const title = document.querySelector('#title h1 yt-formatted-string, #title h1, h1.ytd-watch-metadata')?.textContent?.trim() || '';
    const channel = document.querySelector('#channel-name a, ytd-video-owner-renderer #channel-name a, yt-formatted-string.ytd-channel-name a')?.textContent?.trim() || '';
    const infoStrings = document.querySelector('#info-strings, #info-text, ytd-watch-info-text')?.textContent?.trim() || '';
    const viewsMatch = infoStrings.match(/([\\d,.]+)\\s*views/i) || document.querySelector('#count .ytd-video-primary-info-renderer, [class*="view-count"]')?.textContent?.match(/([\\d,.]+)\\s*views/i);
    const views = viewsMatch ? viewsMatch[1] + ' views' : '';
    const likeBtn = document.querySelector('like-button-view-model button, ytd-toggle-button-renderer #text, [aria-label*="like"]');
    const likes = likeBtn?.getAttribute('aria-label') || likeBtn?.textContent?.trim() || '';
    const descEl = document.querySelector('#description-inner, ytd-text-inline-expander #snippet-text, #description .content, ytd-expandable-video-description-body-renderer');
    const description = descEl?.textContent?.trim()?.substring(0, 1000) || '';
    const comments = [];
    document.querySelectorAll('ytd-comment-thread-renderer, ytd-comment-renderer').forEach(c => {
      const author = c.querySelector('#author-text')?.textContent?.trim() || '';
      const text = c.querySelector('#content-text')?.textContent?.trim() || '';
      if (text) comments.push({ author, text: text.substring(0, 300) });
    });
    const videoId = location.href.match(/v=([^&]+)/)?.[1] || '';
    const thumbnail = videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : '';
    return { title, channel, views, likes, description, thumbnail, comments: comments.slice(0, 10), url: location.href.split('&list')[0] };
  })()`,

  // ── Gmail extractors ──
  gmailInbox: `(() => {
    const rows = document.querySelectorAll('tr.zA, tr[role="row"], div[role="row"]');
    const emails = [];
    rows.forEach(row => {
      const from = row.querySelector('.yX.xY .yW span[email], .yW span.bA4, td.xW .yW span, [data-hovercard-id]')?.textContent?.trim() ||
                   row.querySelector('.yW, [data-tooltip]')?.textContent?.trim() || '';
      const subjectEl = row.querySelector('.y6 span, .bog span, .bqe, td.xY .xS .xT .y6 span');
      const subject = subjectEl?.textContent?.trim() || '';
      const snippet = row.querySelector('.y2, .xS .xT .y2')?.textContent?.trim() || '';
      const date = row.querySelector('.xW, td.xW span[title], .xW span')?.textContent?.trim() || '';
      const unread = row.classList.contains('zE') || !!row.querySelector('.zE, [class*="unread"]');
      if (from || subject) emails.push({ from: from.substring(0, 60), subject: subject.substring(0, 120), snippet: snippet.substring(0, 100), date, unread });
    });
    return emails.slice(0, 30);
  })()`,

  gmailMessage: `(() => {
    const sender = document.querySelector('.gD, [email], .go span[email]')?.textContent?.trim() ||
                   document.querySelector('[data-hovercard-id]')?.textContent?.trim() || '';
    const subject = document.querySelector('h2.hP, .ha h2, [data-thread-perm-id] h2')?.textContent?.trim() || '';
    const date = document.querySelector('.gH .gK span[title], .g3, .gH .gK')?.textContent?.trim() || '';
    const bodyEl = document.querySelector('.a3s.aiL, .a3s, .ii.gt div, [role="listitem"] .a3s');
    const body = bodyEl?.textContent?.trim()?.substring(0, 3000) || '';
    return { sender, subject, date, body };
  })()`,

  // ── Google Calendar extractors ──
  calendarEvents: `(() => {
    const events = [];
    // Day/schedule view chips
    document.querySelectorAll('[data-eventid], [data-eventchip], [role="button"][data-eventid], li[data-eventid]').forEach(el => {
      const title = el.getAttribute('aria-label') || el.textContent?.trim() || '';
      if (title.length > 1) events.push({ title: title.substring(0, 200), raw: true });
    });
    if (events.length === 0) {
      // Fallback: grab visible event text blocks
      document.querySelectorAll('[class*="event"], [class*="chip"], [data-eventchip]').forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.length > 2 && text.length < 300) events.push({ title: text, raw: true });
      });
    }
    return events.slice(0, 40);
  })()`,

  // ── Reddit extractors ──
  redditFeed: `(() => {
    const posts = [];
    const seen = new Set();
    // New Reddit / Shreddit
    document.querySelectorAll('shreddit-post, [data-testid="post-container"], article, faceplate-tracker[source="post"]').forEach(el => {
      // If this is an article wrapper containing a shreddit-post, delegate to the shreddit-post for attributes
      const sp = el.tagName === 'ARTICLE' ? el.querySelector('shreddit-post') : null;
      const target = sp || el;
      const postId = target.getAttribute('id') || '';
      if (postId && seen.has(postId)) return;
      if (postId) seen.add(postId);
      const titleEl = target.querySelector('a[slot="title"], [slot="title"], h3, a[data-click-id="body"]');
      const title = titleEl?.textContent?.trim() || target.getAttribute('post-title') || '';
      const url = titleEl?.closest('a')?.href || titleEl?.href || target.querySelector('a[href*="/comments/"]')?.href || '';
      const subreddit = target.getAttribute('subreddit-prefixed-name') ||
                        target.querySelector('faceplate-tracker[source="subreddit"] a, a[data-click-id="subreddit"]')?.textContent?.trim() ||
                        (target.getAttribute('permalink') || '').match(/\\/r\\/([^/]+)/)?.[0]?.replace(/^\\//, '') || '';
      const score = target.getAttribute('score') ||
                    target.querySelector('faceplate-number[type="score"], [id*="vote-score"]')?.textContent?.trim() ||
                    target.querySelector('faceplate-number, shreddit-post-overflow-menu')?.getAttribute('score') || '';
      const commentCount = target.getAttribute('comment-count') ||
                           target.querySelector('a[href*="/comments/"] span, [data-click-id="comments"]')?.textContent?.trim() || '';
      if (title.length > 3) posts.push({ title: title.substring(0, 150), subreddit, score, comments: commentCount, url });
    });
    return posts.slice(0, 25);
  })()`,

  redditPost: `(() => {
    const title = document.querySelector('shreddit-post [slot="title"], h1[slot="title"], [data-testid="post-container"] h1, h1')?.textContent?.trim() || '';
    const bodyEl = document.querySelector('[slot="text-body"], [data-click-id="text"], .Post [class*="RichText"], [id*="post-rtjson-content"]');
    const body = bodyEl?.textContent?.trim()?.substring(0, 2000) || '';
    const comments = [];
    document.querySelectorAll('shreddit-comment, [class*="Comment"], [data-testid="comment"]').forEach(c => {
      const author = c.getAttribute('author') || c.querySelector('a[href*="/user/"]')?.textContent?.trim() || '';
      const text = c.querySelector('[slot="comment"], [id*="comment-content"], [class*="RichText"]')?.textContent?.trim() || '';
      const score = c.getAttribute('score') || c.querySelector('[id*="vote-score"]')?.textContent?.trim() || '';
      if (text) comments.push({ author, text: text.substring(0, 500), score });
    });
    return { title, body, comments: comments.slice(0, 15), url: location.href };
  })()`,

  // ── GitHub extractors ──
  githubSearch: `(() => {
    const repos = [];
    document.querySelectorAll('.repo-list-item, [data-testid="results-list"] > div, .search-title a, li.repo-list-item').forEach(el => {
      const nameEl = el.querySelector('a.v-align-middle, a[data-testid="link-to-search-result"], .search-title a, a[href*="/"]');
      const name = nameEl?.textContent?.trim() || '';
      const url = nameEl?.href || '';
      const descDiv = el.querySelector('h3 ~ div:not(:has(a[href*="/topics"])):not(:has(ul))');
      const desc = el.querySelector('p, .mb-1, [class*="description"]')?.textContent?.trim() ||
                   descDiv?.textContent?.trim() || '';
      const lang = el.querySelector('[itemprop="programmingLanguage"], .repo-language-color + span, span[aria-label*="language"]')?.textContent?.trim() || '';
      const starsEl = el.querySelector('a[href*="/stargazers"]');
      const stars = starsEl?.querySelector('span')?.textContent?.trim() || starsEl?.getAttribute('aria-label')?.replace(/[^\\d,\\.kmKM]/g, '')?.trim() || '';
      if (name.length > 1) repos.push({ name: name.substring(0, 80), description: desc.substring(0, 200), language: lang, stars, url });
    });
    return repos.slice(0, 20);
  })()`,

  githubRepo: `(() => {
    const name = document.querySelector('[itemprop="name"], strong[itemprop="name"] a, .AppHeader-context-item-label')?.textContent?.trim() || '';
    const owner = document.querySelector('[rel="author"], [itemprop="author"] a')?.textContent?.trim() || '';
    const description = document.querySelector('[class*="BorderGrid"] p, .f4.my-3, [itemprop="about"], .repository-content .f4')?.textContent?.trim() || '';
    const stars = document.querySelector('#repo-stars-counter-star, a[href*="stargazers"] .Counter, a[href*="stargazers"] span')?.textContent?.trim() || '';
    const forks = document.querySelector('#repo-network-counter, a[href*="forks"] .Counter, a[href*="forks"] span')?.textContent?.trim() || '';
    const language = document.querySelector('[class*="BorderGrid"] [itemprop="programmingLanguage"], .repository-lang-stats a span, [data-ga-click*="language"]')?.textContent?.trim() || '';
    const topics = Array.from(document.querySelectorAll('.topic-tag, a[data-octo-click="topic_click"]')).map(t => t.textContent?.trim()).filter(Boolean).slice(0, 10);
    const readmeEl = document.querySelector('#readme article, .markdown-body');
    const readme = readmeEl?.textContent?.trim()?.substring(0, 800) || '';
    return { name, owner, description, stars, forks, language, topics, readme, url: location.href };
  })()`,

  githubTrending: `(() => {
    const repos = [];
    document.querySelectorAll('article.Box-row, .Box-row').forEach(row => {
      const nameEl = row.querySelector('h2 a, h1 a');
      const fullName = nameEl?.textContent?.replace(/\\s+/g, '').trim() || '';
      const url = nameEl?.href || '';
      const desc = row.querySelector('p, .col-9')?.textContent?.trim() || '';
      const lang = row.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim() || '';
      const starsEl = row.querySelector('a[href*="/stargazers"]');
      const stars = starsEl?.textContent?.replace(/[^\\d,\\.kmKM]/g, '')?.trim() || '';
      const todayStars = row.querySelector('.d-inline-block.float-sm-right, .float-sm-right')?.textContent?.trim() || '';
      if (fullName.length > 1) repos.push({ name: fullName.substring(0, 80), description: desc.substring(0, 200), language: lang, stars, todayStars, url });
    });
    return repos.slice(0, 25);
  })()`,

  // ── Twitter/X extractors ──
  xTweets: `(() => {
    const tweets = [];
    const seen = new Set();
    document.querySelectorAll('article[data-testid="tweet"]').forEach(el => {
      const authorEl = el.querySelector('[data-testid="User-Name"]');
      const nameSpans = authorEl ? authorEl.querySelectorAll('span') : [];
      const author = nameSpans[0]?.textContent?.trim() || '';
      const handleEl = Array.from(nameSpans).find(s => (s.textContent || '').startsWith('@'));
      const handle = handleEl?.textContent?.trim() || '';
      const textEl = el.querySelector('[data-testid="tweetText"]');
      const text = textEl?.textContent?.trim()?.substring(0, 280) || '';
      const timeEl = el.querySelector('time');
      const time = timeEl?.getAttribute('datetime') || '';
      const link = timeEl?.closest('a')?.href || '';
      const likes = el.querySelector('[data-testid="like"] span, [data-testid="unlike"] span')?.textContent?.trim() || '0';
      const retweets = el.querySelector('[data-testid="retweet"] span, [data-testid="unretweet"] span')?.textContent?.trim() || '0';
      const replies = el.querySelector('[data-testid="reply"] span')?.textContent?.trim() || '0';
      const key = link || text.substring(0, 60);
      if (key && !seen.has(key)) {
        seen.add(key);
        tweets.push({ author, handle, text, time, likes, retweets, replies, url: link });
      }
    });
    return tweets.slice(0, 25);
  })()`,

  xProfile: `(() => {
    const name = document.querySelector('[data-testid="UserName"] span, h2[role="heading"] span')?.textContent?.trim() || '';
    const bio = document.querySelector('[data-testid="UserDescription"]')?.textContent?.trim() || '';
    const headerItems = document.querySelector('[data-testid="UserProfileHeader_Items"]');
    const loc = headerItems?.querySelector('[data-testid="UserLocation"]')?.textContent?.trim() || '';
    const website = headerItems?.querySelector('a[href*="t.co"]')?.textContent?.trim() || '';
    const statsEls = document.querySelectorAll('a[href*="/followers"], a[href*="/following"], a[href*="/verified_followers"]');
    let followers = '', following = '';
    statsEls.forEach(a => {
      const text = a.textContent || '';
      if (a.href.includes('/followers') && !a.href.includes('verified')) followers = text.trim();
      if (a.href.includes('/following')) following = text.trim();
    });
    const pinned = document.querySelector('[data-testid="socialContext"]')?.closest('article')?.querySelector('[data-testid="tweetText"]')?.textContent?.trim()?.substring(0, 200) || '';
    return { name, bio, location: loc, website, followers, following, pinnedTweet: pinned, url: location.href };
  })()`,

  // ── LinkedIn extractors ──
  linkedinFeed: `(() => {
    const posts = [];
    document.querySelectorAll('.feed-shared-update-v2, [data-urn*="activity"]').forEach(el => {
      const author = el.querySelector('.update-components-actor__name span, .feed-shared-actor__name span')?.textContent?.trim() || '';
      const headline = el.querySelector('.update-components-actor__description span, .feed-shared-actor__description span')?.textContent?.trim() || '';
      const content = el.querySelector('.feed-shared-text span, .update-components-text span')?.textContent?.trim()?.substring(0, 300) || '';
      const likes = el.querySelector('.social-details-social-counts__reactions-count, [data-test-id="social-actions__reaction-count"]')?.textContent?.trim() || '0';
      const comments = el.querySelector('.social-details-social-counts__comments, [aria-label*="comment"]')?.textContent?.trim() || '0';
      if (author || content) posts.push({ author, headline, content, likes, comments });
    });
    return posts.slice(0, 20);
  })()`,

  linkedinProfile: `(() => {
    const name = document.querySelector('.text-heading-xlarge, h1')?.textContent?.trim() || '';
    const headline = document.querySelector('.text-body-medium, .pv-top-card--list .text-body-medium')?.textContent?.trim() || '';
    const about = document.querySelector('#about ~ div .inline-show-more-text span, section.pv-about-section p')?.textContent?.trim()?.substring(0, 500) || '';
    const loc = document.querySelector('.text-body-small[class*="break-words"], .pv-top-card--list-bullet li')?.textContent?.trim() || '';
    const connections = document.querySelector('[href*="/connections"] span, .pv-top-card--list .t-bold')?.textContent?.trim() || '';
    const experience = [];
    document.querySelectorAll('#experience ~ div li, section[id*="experience"] li').forEach(li => {
      const title = li.querySelector('.t-bold span, [class*="title"] span')?.textContent?.trim() || '';
      const company = li.querySelector('.t-normal span, [class*="subtitle"] span')?.textContent?.trim() || '';
      const dates = li.querySelector('.t-black--light span, [class*="date-range"] span')?.textContent?.trim() || '';
      if (title) experience.push({ title, company, dates });
    });
    return { name, headline, about, location: loc, connections, experience: experience.slice(0, 10), url: location.href };
  })()`,

  linkedinJobs: `(() => {
    const jobs = [];
    document.querySelectorAll('.job-card-container, .jobs-search-results__list-item, [data-job-id]').forEach(el => {
      const title = el.querySelector('.job-card-list__title, a[class*="job-card"]')?.textContent?.trim() || '';
      const company = el.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle')?.textContent?.trim() || '';
      const loc = el.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption')?.textContent?.trim() || '';
      const link = el.querySelector('a[href*="/jobs/view/"]')?.href || '';
      const posted = el.querySelector('time')?.textContent?.trim() || '';
      if (title) jobs.push({ title, company, location: loc, posted, url: link });
    });
    return jobs.slice(0, 20);
  })()`,

  // ── Hacker News extractors ──
  hnStories: `(() => {
    const stories = [];
    document.querySelectorAll('.athing').forEach(el => {
      const rank = el.querySelector('.rank')?.textContent?.trim().replace('.', '') || '';
      const titleEl = el.querySelector('.titleline a');
      const title = titleEl?.textContent?.trim() || '';
      const url = titleEl?.href || '';
      const site = el.querySelector('.sitebit a, .sitestr')?.textContent?.trim() || '';
      const subline = el.nextElementSibling;
      const score = subline?.querySelector('.score')?.textContent?.trim() || '0 points';
      const author = subline?.querySelector('.hnuser')?.textContent?.trim() || '';
      const time = subline?.querySelector('.age a')?.textContent?.trim() || '';
      const commentsEl = Array.from(subline?.querySelectorAll('a') || []).find(a => (a.textContent || '').includes('comment'));
      const commentsText = commentsEl?.textContent?.trim() || '0 comments';
      const id = el.getAttribute('id') || '';
      if (title) stories.push({ rank, title, url, site, score, author, time, comments: commentsText, id });
    });
    return stories.slice(0, 30);
  })()`,

  hnComments: `(() => {
    const storyTitle = document.querySelector('.titleline a')?.textContent?.trim() || '';
    const storyUrl = document.querySelector('.titleline a')?.href || '';
    const score = document.querySelector('.score')?.textContent?.trim() || '';
    const comments = [];
    document.querySelectorAll('.comtr').forEach(el => {
      const indent = el.querySelector('.ind img')?.getAttribute('width') || '0';
      const depth = Math.floor(parseInt(indent) / 40);
      const author = el.querySelector('.hnuser')?.textContent?.trim() || '';
      const time = el.querySelector('.age a')?.textContent?.trim() || '';
      const text = el.querySelector('.commtext')?.textContent?.trim()?.substring(0, 500) || '';
      const id = el.getAttribute('id') || '';
      if (text) comments.push({ id, author, time, depth, text });
    });
    return { title: storyTitle, url: storyUrl, score, comments: comments.slice(0, 50) };
  })()`,

  // ── Substack extractors ──
  substackFeed: `(() => {
    const posts = [];
    document.querySelectorAll('[class*="post-preview"], article, .post-preview').forEach(el => {
      const title = el.querySelector('h2, h3, [class*="post-preview-title"]')?.textContent?.trim() || '';
      const author = el.querySelector('[class*="author"], [class*="pub-name"], .post-preview-byline')?.textContent?.trim() || '';
      const publication = el.querySelector('[class*="publication"], [class*="pub-name"]')?.textContent?.trim() || '';
      const excerpt = el.querySelector('[class*="subtitle"], [class*="description"], p')?.textContent?.trim()?.substring(0, 200) || '';
      const link = el.querySelector('a[href*="/p/"]')?.href || el.querySelector('a')?.href || '';
      const date = el.querySelector('time, [class*="date"]')?.textContent?.trim() || '';
      const likes = el.querySelector('[class*="like-count"], [class*="heart"]')?.textContent?.trim() || '';
      if (title) posts.push({ title, author, publication, excerpt, date, likes, url: link });
    });
    return posts.slice(0, 20);
  })()`,

  substackArticle: `(() => {
    const title = document.querySelector('h1, [class*="post-title"]')?.textContent?.trim() || '';
    const subtitle = document.querySelector('[class*="subtitle"], h2')?.textContent?.trim() || '';
    const author = document.querySelector('[class*="author-name"], [class*="byline"] a')?.textContent?.trim() || '';
    const date = document.querySelector('[class*="post-date"], time, [class*="dateline"]')?.textContent?.trim() || '';
    const bodyEl = document.querySelector('[class*="body"], .available-content, article .markup');
    const content = bodyEl?.textContent?.trim()?.substring(0, 5000) || '';
    const likes = document.querySelector('[class*="like-count"], [class*="heart-count"]')?.textContent?.trim() || '';
    const commentCount = document.querySelector('[class*="comment-count"]')?.textContent?.trim() || '';
    return { title, subtitle, author, date, content, likes, comments: commentCount, url: location.href };
  })()`,

  // ── Google Sheets extractors ──
  // Sheets uses canvas rendering — cell values must be read via the formula bar.
  // This extractor reads the currently-selected cell's value from the formula bar.
  sheetsActiveCell: `(() => {
    const nameBox = document.querySelector('#t-name-box');
    const activeCell = nameBox?.value || '';
    const cellInput = document.querySelector('#t-formula-bar-input .cell-input');
    const value = cellInput?.textContent?.trim() || '';
    return { activeCell, value, url: location.href };
  })()`,

  sheetsList: `(() => {
    const tabs = [];
    const seen = new Set();
    document.querySelectorAll('.docs-sheet-tab-name').forEach(el => {
      const name = el.textContent?.trim() || '';
      if (name && !seen.has(name)) { seen.add(name); tabs.push(name); }
    });
    return tabs;
  })()`,
};

/**
 * PingApp function definitions for the function registry.
 * These describe the high-level app actions that can be called via /v1/functions.
 */
export const PINGAPP_FUNCTION_DEFS: Array<{
  app: string;
  domain: string;
  functions: Array<{ name: string; description: string; params: Array<{ name: string; type: string; required?: boolean; description?: string }> }>;
}> = [
  {
    app: 'aliexpress',
    domain: 'aliexpress',
    functions: [
      { name: 'search', description: 'Search for products on AliExpress', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }] },
      { name: 'product', description: 'View product details by ID', params: [{ name: 'id', type: 'string', required: true, description: 'Product ID' }] },
      { name: 'cart_add', description: 'Add current product to cart', params: [] },
      { name: 'cart', description: 'View shopping cart', params: [] },
      { name: 'orders', description: 'View order history', params: [] },
      { name: 'clean', description: 'Remove ads and clutter from page', params: [] },
      { name: 'recon', description: 'Analyze page structure', params: [] },
    ],
  },
  {
    app: 'amazon',
    domain: 'amazon',
    functions: [
      { name: 'search', description: 'Search for products on Amazon', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }] },
      { name: 'product', description: 'View product details by ASIN', params: [{ name: 'asin', type: 'string', required: true, description: 'Amazon ASIN' }] },
      { name: 'cart_add', description: 'Add current product to cart', params: [] },
      { name: 'cart', description: 'View shopping cart', params: [] },
      { name: 'orders', description: 'View order history', params: [] },
      { name: 'deals', description: 'View current deals', params: [] },
      { name: 'clean', description: 'Remove ads and clutter from page', params: [] },
      { name: 'recon', description: 'Analyze page structure', params: [] },
    ],
  },
  {
    app: 'claude',
    domain: 'claude.ai',
    functions: [
      { name: 'chat', description: 'Send a message to Claude', params: [{ name: 'message', type: 'string', required: true, description: 'Message text' }] },
      { name: 'chat_new', description: 'Start a new conversation', params: [] },
      { name: 'chat_read', description: 'Read the latest response', params: [] },
      { name: 'conversations', description: 'List recent conversations', params: [] },
      { name: 'model', description: 'Get or set the active model', params: [{ name: 'model', type: 'string', description: 'Model name to set (omit to get current)' }] },
      { name: 'projects', description: 'List projects', params: [] },
      { name: 'artifacts', description: 'List artifacts', params: [] },
      { name: 'clean', description: 'Remove clutter from page', params: [] },
      { name: 'recon', description: 'Analyze page structure', params: [] },
    ],
  },
  {
    app: 'chatgpt',
    domain: 'chatgpt.com',
    functions: [
      { name: 'chat', description: 'Send a message to ChatGPT', params: [{ name: 'message', type: 'string', required: true, description: 'Message text' }] },
      { name: 'chat_new', description: 'Start a new conversation', params: [] },
      { name: 'chat_read', description: 'Read the latest response', params: [] },
      { name: 'conversations', description: 'List recent conversations', params: [] },
      { name: 'model', description: 'Get or set the active model', params: [{ name: 'model', type: 'string', description: 'Model name to set (omit to get current)' }] },
      { name: 'clean', description: 'Remove clutter from page', params: [] },
      { name: 'recon', description: 'Analyze page structure', params: [] },
    ],
  },
  {
    app: 'youtube',
    domain: 'youtube.com',
    functions: [
      { name: 'search', description: 'Search for videos on YouTube', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }] },
      { name: 'trending', description: 'View trending videos', params: [] },
      { name: 'video', description: 'View video details by ID', params: [{ name: 'id', type: 'string', required: true, description: 'YouTube video ID' }] },
      { name: 'clean', description: 'Remove ads from page', params: [] },
    ],
  },
  {
    app: 'gmail',
    domain: 'mail.google.com',
    functions: [
      { name: 'inbox', description: 'View inbox emails', params: [] },
      { name: 'read', description: 'Read an email by index', params: [{ name: 'index', type: 'number', required: true, description: 'Email row index (0-based)' }] },
      { name: 'compose', description: 'Compose and send an email', params: [{ name: 'to', type: 'string', required: true, description: 'Recipient email' }, { name: 'subject', type: 'string', required: true, description: 'Email subject' }, { name: 'body', type: 'string', required: true, description: 'Email body' }] },
      { name: 'search', description: 'Search emails', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }] },
    ],
  },
  {
    app: 'gcalendar',
    domain: 'calendar.google.com',
    functions: [
      { name: 'today', description: 'View today\'s events', params: [] },
      { name: 'week', description: 'View this week\'s events', params: [] },
      { name: 'create', description: 'Create a calendar event', params: [{ name: 'title', type: 'string', required: true, description: 'Event title' }, { name: 'date', type: 'string', required: true, description: 'Date (YYYY-MM-DD)' }, { name: 'time', type: 'string', description: 'Start time (HH:MM)' }, { name: 'duration', type: 'string', description: 'Duration (e.g. 1h, 30m)' }] },
    ],
  },
  {
    app: 'reddit',
    domain: 'reddit.com',
    functions: [
      { name: 'feed', description: 'View front page posts', params: [] },
      { name: 'subreddit', description: 'View posts in a subreddit', params: [{ name: 'name', type: 'string', required: true, description: 'Subreddit name (without r/)' }] },
      { name: 'post', description: 'View a specific post and comments', params: [{ name: 'url', type: 'string', required: true, description: 'Full post URL' }] },
    ],
  },
  {
    app: 'github',
    domain: 'github.com',
    functions: [
      { name: 'search', description: 'Search repositories, code, or issues', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }, { name: 'type', type: 'string', description: 'Search type: repositories, code, issues (default: repositories)' }] },
      { name: 'repo', description: 'View repository details', params: [{ name: 'owner', type: 'string', required: true, description: 'Repository owner' }, { name: 'name', type: 'string', required: true, description: 'Repository name' }] },
      { name: 'trending', description: 'View trending repositories', params: [{ name: 'language', type: 'string', description: 'Filter by programming language' }] },
    ],
  },
  {
    app: 'twitter',
    domain: 'x.com',
    functions: [
      { name: 'search', description: 'Search tweets on X/Twitter', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }] },
      { name: 'feed', description: 'Extract home timeline tweets', params: [] },
      { name: 'profile', description: 'View a user profile', params: [{ name: 'username', type: 'string', required: true, description: 'Twitter username (without @)' }] },
      { name: 'post', description: 'View a single tweet/thread', params: [{ name: 'id', type: 'string', required: true, description: 'Tweet ID' }] },
    ],
  },
  {
    app: 'linkedin',
    domain: 'linkedin.com',
    functions: [
      { name: 'feed', description: 'Extract LinkedIn feed posts', params: [] },
      { name: 'profile', description: 'View a LinkedIn profile', params: [{ name: 'username', type: 'string', required: true, description: 'LinkedIn username (URL slug)' }] },
      { name: 'search', description: 'Search people, jobs, or companies', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }, { name: 'type', type: 'string', description: 'Search type: people, jobs, companies (default: people)' }] },
      { name: 'jobs', description: 'Search job listings', params: [{ name: 'query', type: 'string', required: true, description: 'Job search query' }] },
    ],
  },
  {
    app: 'hackernews',
    domain: 'news.ycombinator.com',
    functions: [
      { name: 'front', description: 'View front page stories', params: [] },
      { name: 'new', description: 'View newest stories', params: [] },
      { name: 'comments', description: 'View story comments', params: [{ name: 'id', type: 'string', required: true, description: 'Story ID' }] },
      { name: 'ask', description: 'View Ask HN stories', params: [] },
      { name: 'show', description: 'View Show HN stories', params: [] },
    ],
  },
  {
    app: 'substack',
    domain: 'substack.com',
    functions: [
      { name: 'feed', description: 'View Substack homepage feed', params: [] },
      { name: 'article', description: 'Read a Substack article', params: [{ name: 'url', type: 'string', required: true, description: 'Full article URL' }] },
      { name: 'search', description: 'Search across Substack', params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }] },
    ],
  },
  {
    app: 'gsheets',
    domain: 'docs.google.com/spreadsheets',
    functions: [
      { name: 'read', description: 'Read a cell range', params: [{ name: 'range', type: 'string', required: true, description: 'Cell range in A1 notation (e.g. A1:B5)' }] },
      { name: 'write', description: 'Write a value to a cell', params: [{ name: 'cell', type: 'string', required: true, description: 'Cell in A1 notation (e.g. A1)' }, { name: 'value', type: 'string', required: true, description: 'Value to write' }] },
      { name: 'formula', description: 'Read the formula in a cell', params: [{ name: 'cell', type: 'string', required: true, description: 'Cell in A1 notation' }] },
      { name: 'sheet_list', description: 'List all sheet tabs', params: [] },
    ],
  },
];

export function registerAppRoutes(app: FastifyInstance, gatewayUrl: string) {
  app.setErrorHandler((error, _request, reply) => {
    const err = error as Error & { statusCode?: number; code?: string };
    const message = err.message || 'App route failed';
    const parseErr = err.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || /malformed json/i.test(message);

    if (parseErr) {
      return reply.code(400).send({ ok: false, error: 'Malformed JSON body' });
    }

    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ ok: false, error: message });
    }

    return reply.code(500).send({ ok: false, error: message });
  });

  // POST /v1/app/aliexpress/search { query }
  app.post('/v1/app/aliexpress/search', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    // Navigate to search
    await setAliExpressLocale(gatewayUrl, deviceId);
    const encoded = encodeURIComponent(query).replace(/%20/g, '-');
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = \"https://www.aliexpress.com/w/wholesale-${encoded}.html\"` });
    await delay(1500);
    await waitForAliExpressPrices(gatewayUrl, deviceId);
    
    // Clean ads
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    
    // Extract products; retry in case dynamic cards/prices are still hydrating.
    const result = await extractWithRetries<any[]>(
      gatewayUrl,
      deviceId,
      EXTRACTORS.searchResults,
      (products) => Array.isArray(products) && products.some((p: any) => typeof p?.price === 'string' && p.price.trim().length > 0),
    );
    return { ok: true, action: 'search', query, products: result?.result || [], deviceId };
  });

  // POST /v1/app/aliexpress/product { id }
  app.post('/v1/app/aliexpress/product', async (req, reply) => {
    const { id } = req.body as any;
    if (!id) return reply.code(400).send({ ok: false, error: 'product id required' });
    
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await setAliExpressLocale(gatewayUrl, deviceId);
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = \"https://www.aliexpress.com/item/${id}.html\"` });
    await delay(1500);
    await waitForAliExpressPrices(gatewayUrl, deviceId);
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    
    const { result: product, _healed } = await healableExtract<Record<string, unknown>>(
      gatewayUrl,
      deviceId,
      EXTRACTORS.productDetails,
      SELECTOR_MAPS.productDetails,
      (p) => Boolean(p && typeof p.price === 'string' && p.price.trim().length > 0),
      ['title', 'price', 'store'],
    );
    return { ok: true, action: 'product', product: product || {}, ...(_healed ? { _healed } : {}), deviceId };
  });

  // POST /v1/app/aliexpress/cart/add
  app.post('/v1/app/aliexpress/cart/add', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'click', { selector: 'text=Add to cart', stealth: true });
    await delay(2000);
    
    return { ok: result?.ok || false, action: 'addToCart', deviceId };
  });

  // POST /v1/app/aliexpress/cart/remove { index }
  app.post('/v1/app/aliexpress/cart/remove', async (req, reply) => {
    const { index = 0 } = req.body as any;
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    // Navigate to cart first
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/shoppingcart/index.html"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*=order-item], [class*=product-item], [class*=cart-item], [class*=shopping-cart]', 3500);
    
    // Click remove on the nth item
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { 
      expression: `(() => { const btns = document.querySelectorAll('button, [class*=remove], [class*=Remove], [class*=delete]'); const removeBtns = Array.from(btns).filter(b => /remove|delete/i.test(b.textContent)); if (removeBtns[${index}]) { removeBtns[${index}].click(); return 'removed'; } return 'not found'; })()` 
    });
    
    return { ok: result?.result === 'removed', action: 'removeFromCart', index, deviceId };
  });

  // GET /v1/app/aliexpress/cart
  app.get('/v1/app/aliexpress/cart', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/shoppingcart/index.html"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*=order-item], [class*=product-item], [class*=cart-item], [class*=shopping-cart]', 4000);

    const result = await extractWithRetries<Record<string, unknown>>(
      gatewayUrl,
      deviceId,
      EXTRACTORS.cartItems,
      (cart) => Boolean(cart && (Array.isArray((cart as any).items) && (cart as any).items.length > 0 || (cart as any).count > 0)),
    );
    return { ok: true, action: 'cart', cart: result?.result || {}, deviceId };
  });

  // GET /v1/app/aliexpress/orders
  app.get('/v1/app/aliexpress/orders', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/order/index.html"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*=order], [class*=Order]', 4000);

    const result = await extractWithRetries<Record<string, unknown>>(
      gatewayUrl,
      deviceId,
      EXTRACTORS.orders,
      (orders) => Boolean(orders && Array.isArray((orders as any).orders) && (orders as any).orders.length > 0),
    );
    return { ok: true, action: 'orders', orders: result?.result || {}, deviceId };
  });

  // GET /v1/app/aliexpress/orders/:orderId
  app.get('/v1/app/aliexpress/orders/:orderId', async (req, reply) => {
    const { orderId } = req.params as any;
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/order/detail.html?orderId=${orderId}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*=order-detail], [class*=Order]', 4000);
    
    const text = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 2000)' });
    return { ok: true, action: 'trackOrder', orderId, details: text?.result || '', deviceId };
  });

  // GET /v1/app/aliexpress/wishlist
  app.get('/v1/app/aliexpress/wishlist', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/wishlist/index.html"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*=wishlist], [class*=Wishlist], [class*=collection]', 4000);
    
    const text = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 2000)' });
    return { ok: true, action: 'wishlist', content: text?.result || '', deviceId };
  });

  // POST /v1/app/aliexpress/clean
  app.post('/v1/app/aliexpress/clean', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    return { ok: true, action: 'clean', result: result?.result || {}, deviceId };
  });

  // GET /v1/app/aliexpress/recon
  app.get('/v1/app/aliexpress/recon', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'recon', {});
    return { ok: true, action: 'recon', recon: result?.result || {}, deviceId };
  });

  // =============================================
  // AMAZON PingApp
  // =============================================
  
  function findAmazonDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'amazon');
  }

  function findClaudeDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'claude.ai');
  }

  // POST /v1/app/amazon/search { query }
  app.post('/v1/app/amazon/search', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });

    // Detect the current Amazon domain (amazon.com, amazon.ae, etc.) from the tab URL
    const encoded = encodeURIComponent(query);
    const urlResult = await deviceOp(gatewayUrl, deviceId, 'getUrl', {});
    const currentUrl = urlResult?.result || '';
    const domainMatch = currentUrl.match(/https?:\/\/(www\.amazon\.[a-z.]+)/);
    const amazonHost = domainMatch ? domainMatch[1] : 'www.amazon.com';

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://${amazonHost}/s?k=${encoded}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[data-component-type="s-search-result"], .s-result-item, [data-asin]');
    // Note: skip 'clean' for search results — fullCleanup strips price/rating elements

    const result = await extractWithRetries<any[]>(
      gatewayUrl,
      deviceId,
      EXTRACTORS.amazonSearch,
      (products) => Array.isArray(products) && products.length > 0,
    );
    return { ok: true, action: 'search', query, products: result?.result || [], deviceId };
  });

  // POST /v1/app/amazon/product { asin }
  app.post('/v1/app/amazon/product', async (req, reply) => {
    const { asin } = req.body as any;
    if (!asin) return reply.code(400).send({ ok: false, error: 'asin required' });
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });

    // Detect the current Amazon domain from the tab URL (like search does)
    const urlResult = await deviceOp(gatewayUrl, deviceId, 'getUrl', {});
    const currentUrl = urlResult?.result || '';
    const domainMatch = currentUrl.match(/https?:\/\/(www\.amazon\.[a-z.]+)/);
    const amazonHost = domainMatch ? domainMatch[1] : 'www.amazon.com';

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://${amazonHost}/dp/${asin}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '#productTitle, #title, [class*=priceToPay]');
    // Note: skip 'clean' for product pages — fullCleanup strips price/rating elements

    const { result: product, _healed } = await healableExtract<Record<string, unknown>>(
      gatewayUrl,
      deviceId,
      EXTRACTORS.amazonProduct,
      SELECTOR_MAPS.amazonProduct,
      (p) => Boolean(p && ((p as any).title || (p as any).price)),
      ['title', 'price'],
    );
    return { ok: true, action: 'product', product: product || {}, ...(_healed ? { _healed } : {}), deviceId };
  });

  // POST /v1/app/amazon/cart/add
  app.post('/v1/app/amazon/cart/add', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    const result = await deviceOp(gatewayUrl, deviceId, 'click', { selector: '#add-to-cart-button', stealth: true });
    await delay(2000);
    return { ok: result?.ok || false, action: 'addToCart', deviceId };
  });

  // GET /v1/app/amazon/cart
  app.get('/v1/app/amazon/cart', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.amazon.ae/gp/cart/view.html"` });
    await waitForPageLoad(gatewayUrl, deviceId, '#sc-active-cart, #activeCartViewForm, [data-name="Active Items"]', 4000);
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 2000)' });
    return { ok: true, action: 'cart', content: result?.result || '', deviceId };
  });

  // GET /v1/app/amazon/orders
  app.get('/v1/app/amazon/orders', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.amazon.ae/gp/your-account/order-history"` });
    await waitForPageLoad(gatewayUrl, deviceId, '.order-card, [class*=order], #ordersContainer', 4000);
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 3000)' });
    return { ok: true, action: 'orders', content: result?.result || '', deviceId };
  });

  // GET /v1/app/amazon/deals
  app.get('/v1/app/amazon/deals', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.amazon.ae/deals"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*=deal], [class*=Deal], [data-testid*="deal"]', 4000);
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 2000)' });
    return { ok: true, action: 'deals', content: result?.result || '', deviceId };
  });

  // POST /v1/app/amazon/clean
  app.post('/v1/app/amazon/clean', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    const result = await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    return { ok: true, action: 'clean', result: result?.result || {}, deviceId };
  });

  // GET /v1/app/amazon/recon
  app.get('/v1/app/amazon/recon', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    const result = await deviceOp(gatewayUrl, deviceId, 'recon', {});
    return { ok: true, action: 'recon', recon: result?.result || {}, deviceId };
  });


  // =============================================
  // CLAUDE PingApp
  // =============================================

  // POST /v1/app/claude/chat { message, model? }
  app.post('/v1/app/claude/chat', async (req, reply) => {
    const { message } = req.body as any;
    if (!message) return reply.code(400).send({ ok: false, error: 'message required' });

    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    // ProseMirror/tiptap contenteditable: use eval to set content and dispatch events
    const msgText = String(message).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const el = document.querySelector('[data-testid="chat-input"]');
        if (!el) return 'no-input';
        el.focus();
        // Select all existing content
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        // Use execCommand insertText (works with ProseMirror/tiptap)
        document.execCommand('insertText', false, '${msgText}');
        return 'typed';
      })()`,
    });

    // Small delay for tiptap to process the input
    await new Promise(r => setTimeout(r, 300));

    // Send: press Enter on the input (Claude sends on Enter)
    await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const el = document.querySelector('[data-testid="chat-input"]');
        if (!el) return 'no-input';
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        return 'enter-sent';
      })()`,
    });

    await waitForPageLoad(gatewayUrl, deviceId, '.font-claude-response', 3000);
    return { ok: true, action: 'chat', sent: String(message) };
  });

  // POST /v1/app/claude/chat/new
  app.post('/v1/app/claude/chat/new', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/new"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[data-testid="chat-input"]', 3000);
    return { ok: true, action: 'newChat' };
  });

  // GET /v1/app/claude/chat/read
  app.get('/v1/app/claude/chat/read', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const msgs = document.querySelectorAll('.font-claude-response');
        const last = msgs[msgs.length - 1];
        return last?.textContent?.trim()?.substring(0, 5000) || '';
      })()`,
    });

    return { ok: true, action: 'read', response: result?.result || '' };
  });

  // GET /v1/app/claude/conversations
  app.get('/v1/app/claude/conversations', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.claudeConversations });
    return { ok: true, conversations: result?.result || [] };
  });

  // POST /v1/app/claude/conversation { id }
  app.post('/v1/app/claude/conversation', async (req, reply) => {
    const { id } = req.body as any;
    if (!id) return reply.code(400).send({ ok: false, error: 'id required' });

    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/chat/${id}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '.font-claude-response, [data-testid="user-message"]', 3000);
    return { ok: true, action: 'openConversation', id };
  });

  // GET /v1/app/claude/model — get current model
  app.get('/v1/app/claude/model', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.claudeModel });
    return { ok: true, model: result?.result || 'unknown' };
  });

  // GET /v1/app/claude/models — list all available models
  app.get('/v1/app/claude/models', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    // Open dropdown, expand "More models", read list, close — all in one eval
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(async () => {
        const btn = document.querySelector('[data-testid="model-selector-dropdown"]');
        if (!btn) return { error: 'no-selector' };
        const current = btn.textContent.trim().replace(/\\s+/g, ' ');
        btn.click();
        await new Promise(r => setTimeout(r, 400));

        // Expand "More models"
        const items1 = document.querySelectorAll('[role="menuitem"]');
        for (const el of items1) {
          if (el.textContent.includes('More models')) { el.click(); break; }
        }
        await new Promise(r => setTimeout(r, 400));

        // Read all models
        const items2 = document.querySelectorAll('[role="menuitem"]');
        const models = [];
        for (const el of items2) {
          const text = (el.textContent || '').trim().replace(/\\s+/g, ' ');
          if (!text || text.length > 100 || text === 'More models') continue;
          const name = text.replace(/(Most efficient|Think longer|Best for|Fastest|Older model).*$/i, '').trim();
          models.push({ name, fullText: text });
        }

        // Close dropdown
        document.body.click();
        return { current, models };
      })()`,
    });

    const data = result?.result ?? result;
    return { ok: true, current: data?.current || 'unknown', models: data?.models || [] };
  });

  // POST /v1/app/claude/model { model } — switch model
  // Accepts: "sonnet", "opus", "haiku", "extended", or full names like "Opus 4.6"
  app.post('/v1/app/claude/model', async (req, reply) => {
    const { model } = req.body as any;
    if (!model) return reply.code(400).send({ ok: false, error: 'model required' });

    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const modelText = String(model).toLowerCase().trim();

    // All-in-one: open dropdown, expand if needed, find and click target, verify
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(async () => {
        const target = ${JSON.stringify(modelText)};
        const btn = document.querySelector('[data-testid="model-selector-dropdown"]');
        if (!btn) return { picked: false, error: 'no-selector' };
        const before = btn.textContent.trim().replace(/\\s+/g, ' ');

        // Open dropdown
        btn.click();
        await new Promise(r => setTimeout(r, 400));

        // Try to find and click target in top-level items
        function tryClick() {
          const items = document.querySelectorAll('[role="menuitem"]');
          for (const el of items) {
            const t = (el.textContent || '').toLowerCase();
            if (t.includes(target) && !t.includes('more models')) {
              el.click();
              return { picked: true, text: el.textContent.trim() };
            }
          }
          return null;
        }

        let result = tryClick();
        if (result) {
          await new Promise(r => setTimeout(r, 600));
          const after = document.querySelector('[data-testid="model-selector-dropdown"]')?.textContent?.trim()?.replace(/\\s+/g, ' ') || '';
          return { ...result, before, after };
        }

        // Expand "More models"
        const items = document.querySelectorAll('[role="menuitem"]');
        for (const el of items) {
          if (el.textContent.includes('More models')) { el.click(); break; }
        }
        await new Promise(r => setTimeout(r, 400));

        result = tryClick();
        if (result) {
          await new Promise(r => setTimeout(r, 600));
          const after = document.querySelector('[data-testid="model-selector-dropdown"]')?.textContent?.trim()?.replace(/\\s+/g, ' ') || '';
          return { ...result, before, after };
        }

        // Not found — close dropdown
        document.body.click();
        return { picked: false, before };
      })()`,
    });

    const data = result?.result ?? result;

    if (!data?.picked) {
      return reply.code(400).send({
        ok: false,
        error: `Model "${model}" not found. Try: sonnet, opus, haiku, extended, or full names like "Opus 4.6"`,
        current: data?.before || 'unknown',
      });
    }

    // Read model after a short delay — the selector button updates asynchronously
    await delay(1200);
    const after = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.claudeModel });

    return { ok: true, action: 'setModel', model: after?.result || data.text || model, previous: data.before };
  });

  // GET /v1/app/claude/projects
  app.get('/v1/app/claude/projects', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const nav = await deviceOp(gatewayUrl, deviceId, 'click', { selector: 'a[aria-label="Projects"]', stealth: true });
    if (!nav?.ok) await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/projects"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'a[href*="/project/"], a[href*="/projects/"]', 2000);

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.claudeProjects });
    return { ok: true, projects: result?.result || [] };
  });

  // POST /v1/app/claude/project { id }
  app.post('/v1/app/claude/project', async (req, reply) => {
    const { id } = req.body as any;
    if (!id) return reply.code(400).send({ ok: false, error: 'id required' });

    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/project/${id}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[data-testid="chat-input"], [data-testid="chat-input-ssr"]', 3000);
    return { ok: true, action: 'openProject', id };
  });

  // GET /v1/app/claude/artifacts
  app.get('/v1/app/claude/artifacts', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const nav = await deviceOp(gatewayUrl, deviceId, 'click', { selector: 'a[aria-label="Artifacts"]', stealth: true });
    if (!nav?.ok) await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/artifacts"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'a[href*="/artifacts"]', 2000);

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.claudeArtifacts });
    return { ok: true, artifacts: result?.result || [] };
  });

  // POST /v1/app/claude/upload { filePath }
  app.post('/v1/app/claude/upload', async (req, reply) => {
    const { filePath } = req.body as any;
    if (!filePath) return reply.code(400).send({ ok: false, error: 'filePath required' });

    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const uploadResult = await deviceOp(gatewayUrl, deviceId, 'upload', {
      selector: '[data-testid="file-upload"]',
      filePath: String(filePath),
    });

    if (!uploadResult?.ok) {
      await deviceOp(gatewayUrl, deviceId, 'eval', {
        expression: `(() => {
          const input = document.querySelector('[data-testid="file-upload"]');
          if (!input) return false;
          input.click();
          return true;
        })()`,
      });
    }

    return { ok: true, action: 'upload', filePath: String(filePath) };
  });

  // GET /v1/app/claude/search { query }
  app.get('/v1/app/claude/search', async (req, reply) => {
    const { query } = req.query as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });

    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const encoded = encodeURIComponent(String(query));
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/search?q=${encoded}"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'a[href*="/chat/"]', 2000);

    const queryEscaped = JSON.stringify(String(query));
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const q = ${'__QUERY__'}.toLowerCase().trim();
        const links = Array.from(document.querySelectorAll('a[href*="/chat/"]'));
        return links
          .map(a => ({
            title: (a.textContent || '').trim(),
            url: a.href,
            id: a.href.match(/\/chat\/([^?]+)/)?.[1] || ''
          }))
          .filter(x => !q || x.title.toLowerCase().includes(q))
          .slice(0, 30);
      })()`.replace('__QUERY__', queryEscaped),
    });

    return { ok: true, action: 'search', query: String(query), results: result?.result || [] };
  });

  // POST /v1/app/claude/clean
  app.post('/v1/app/claude/clean', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'minimal' });
    return { ok: true, action: 'clean', result: result?.result || {} };
  });

  // GET /v1/app/claude/recon
  app.get('/v1/app/claude/recon', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'recon', {});
    return { ok: true, action: 'recon', recon: result?.result || {} };
  });

  // =============================================
  // CHATGPT PingApp
  // =============================================

  function findChatGPTDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'chatgpt.com');
  }

  // POST /v1/app/chatgpt/chat { message }
  app.post('/v1/app/chatgpt/chat', async (req, reply) => {
    const { message } = req.body as any;
    if (!message) return reply.code(400).send({ ok: false, error: 'message required' });

    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    // Type message into the prompt textarea
    await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const el = document.querySelector('#prompt-textarea');
        if (!el) return 'no-input';
        el.focus();
        el.innerText = ${JSON.stringify(String(message))};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return 'typed';
      })()`,
    });

    await delay(300);

    // Click send button
    const sendResult = await deviceOp(gatewayUrl, deviceId, 'click', {
      selector: '[data-testid="send-button"], button[aria-label="Send prompt"]',
      stealth: true,
    });

    if (!sendResult?.ok) {
      // Fallback: press Enter
      await deviceOp(gatewayUrl, deviceId, 'eval', {
        expression: `(() => {
          const el = document.querySelector('#prompt-textarea');
          if (!el) return 'no-input';
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
          return 'enter-dispatched';
        })()`,
      });
    }

    await waitForPageLoad(gatewayUrl, deviceId, '[data-message-author-role="assistant"], div.agent-turn', 3000);
    return { ok: true, action: 'chat', sent: String(message) };
  });

  // POST /v1/app/chatgpt/chat/new
  app.post('/v1/app/chatgpt/chat/new', async (req, reply) => {
    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://chatgpt.com"` });
    await waitForPageLoad(gatewayUrl, deviceId, '#prompt-textarea', 3000);
    return { ok: true, action: 'newChat' };
  });

  // GET /v1/app/chatgpt/chat/read
  app.get('/v1/app/chatgpt/chat/read', async (req, reply) => {
    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: EXTRACTORS.chatgptResponse,
    });

    return { ok: true, action: 'read', response: result?.result || '' };
  });

  // GET /v1/app/chatgpt/conversations
  app.get('/v1/app/chatgpt/conversations', async (req, reply) => {
    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.chatgptConversations });
    return { ok: true, conversations: result?.result || [] };
  });

  // GET /v1/app/chatgpt/model
  app.get('/v1/app/chatgpt/model', async (req, reply) => {
    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.chatgptModel });
    return { ok: true, model: result?.result || 'unknown' };
  });

  // POST /v1/app/chatgpt/model { model }
  app.post('/v1/app/chatgpt/model', async (req, reply) => {
    const { model } = req.body as any;
    if (!model) return reply.code(400).send({ ok: false, error: 'model required' });

    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    // Click model selector dropdown
    await deviceOp(gatewayUrl, deviceId, 'click', {
      selector: '[data-testid="model-selector-dropdown"], button[class*="model"]',
      stealth: true,
    });

    await delay(500);

    const modelText = String(model);
    const picked = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const target = ${JSON.stringify(modelText)}.toLowerCase();
        const options = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], [role="menuitemradio"], button, li, div'));
        const match = options.find(el => {
          const t = (el.textContent || '').trim().toLowerCase();
          return t.includes(target) || t === target;
        });
        if (!match) return false;
        match.click();
        return true;
      })()`,
    });

    await delay(800);
    return { ok: !!picked?.result, action: 'setModel', model: modelText };
  });

  // POST /v1/app/chatgpt/clean
  app.post('/v1/app/chatgpt/clean', async (req, reply) => {
    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'minimal' });
    return { ok: true, action: 'clean', result: result?.result || {} };
  });

  // GET /v1/app/chatgpt/recon
  app.get('/v1/app/chatgpt/recon', async (req, reply) => {
    const deviceId = await findChatGPTDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No ChatGPT tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'recon', {});
    return { ok: true, action: 'recon', recon: result?.result || {} };
  });

  // =============================================
  // TWITTER/X PingApp
  // =============================================

  function findXDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'x.com');
  }

  // POST /v1/app/twitter/search { query }
  app.post('/v1/app/twitter/search', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findXDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No X/Twitter tab open' });

    const encoded = encodeURIComponent(String(query));
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://x.com/search?q=${encoded}&src=typed_query"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'article[data-testid="tweet"]', 3000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.xTweets,
      (tweets) => Array.isArray(tweets) && tweets.length > 0,
    );
    return { ok: true, action: 'search', query, tweets: result?.result || [], deviceId };
  });

  // GET /v1/app/twitter/feed
  app.get('/v1/app/twitter/feed', async (req, reply) => {
    const deviceId = await findXDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No X/Twitter tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://x.com/home"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'article[data-testid="tweet"]', 3000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.xTweets,
      (tweets) => Array.isArray(tweets) && tweets.length > 0,
    );
    return { ok: true, action: 'feed', tweets: result?.result || [], deviceId };
  });

  // POST /v1/app/twitter/profile { username }
  app.post('/v1/app/twitter/profile', async (req, reply) => {
    const { username } = req.body as any;
    if (!username) return reply.code(400).send({ ok: false, error: 'username required' });
    const deviceId = await findXDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No X/Twitter tab open' });

    const handle = String(username).replace(/^@/, '');
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://x.com/${handle}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[data-testid="UserName"], [data-testid="UserDescription"]', 3000);

    const profileResult = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.xProfile });
    const tweetsResult = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.xTweets,
      (tweets) => Array.isArray(tweets) && tweets.length > 0, 1,
    );
    return { ok: true, action: 'profile', profile: profileResult?.result || {}, recentTweets: tweetsResult?.result || [], deviceId };
  });

  // POST /v1/app/twitter/post { id }
  app.post('/v1/app/twitter/post', async (req, reply) => {
    const { id } = req.body as any;
    if (!id) return reply.code(400).send({ ok: false, error: 'id required' });
    const deviceId = await findXDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No X/Twitter tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://x.com/i/status/${id}"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'article[data-testid="tweet"]', 3000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.xTweets,
      (tweets) => Array.isArray(tweets) && tweets.length > 0,
    );
    const tweets = (result?.result || []) as any[];
    return { ok: true, action: 'post', post: tweets[0] || {}, thread: tweets.slice(1), deviceId };
  });

  // =============================================
  // LINKEDIN PingApp
  // =============================================

  function findLinkedInDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'linkedin.com');
  }

  // GET /v1/app/linkedin/feed
  app.get('/v1/app/linkedin/feed', async (req, reply) => {
    const deviceId = await findLinkedInDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No LinkedIn tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.linkedin.com/feed/"` });
    await waitForPageLoad(gatewayUrl, deviceId, '.feed-shared-update-v2, [data-urn*="activity"]', 3000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.linkedinFeed,
      (posts) => Array.isArray(posts) && posts.length > 0,
    );
    return { ok: true, action: 'feed', posts: result?.result || [], deviceId };
  });

  // POST /v1/app/linkedin/profile { username }
  app.post('/v1/app/linkedin/profile', async (req, reply) => {
    const { username } = req.body as any;
    if (!username) return reply.code(400).send({ ok: false, error: 'username required' });
    const deviceId = await findLinkedInDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No LinkedIn tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.linkedin.com/in/${String(username)}/"` });
    await waitForPageLoad(gatewayUrl, deviceId, '.text-heading-xlarge, h1, .pv-top-card', 3000);

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.linkedinProfile });
    return { ok: true, action: 'profile', profile: result?.result || {}, deviceId };
  });

  // POST /v1/app/linkedin/search { query, type? }
  app.post('/v1/app/linkedin/search', async (req, reply) => {
    const { query, type = 'people' } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findLinkedInDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No LinkedIn tab open' });

    const encoded = encodeURIComponent(String(query));
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.linkedin.com/search/results/all/?keywords=${encoded}&origin=GLOBAL_SEARCH_HEADER"` });
    await waitForPageLoad(gatewayUrl, deviceId, '.search-results-container, .reusable-search__result-container', 3000);

    const text = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 3000)' });
    return { ok: true, action: 'search', query, type: String(type), content: text?.result || '', deviceId };
  });

  // POST /v1/app/linkedin/jobs { query }
  app.post('/v1/app/linkedin/jobs', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findLinkedInDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No LinkedIn tab open' });

    const encoded = encodeURIComponent(String(query));
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.linkedin.com/jobs/search/?keywords=${encoded}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '.job-card-container, .jobs-search-results__list-item, [data-job-id]', 3000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.linkedinJobs,
      (jobs) => Array.isArray(jobs) && jobs.length > 0,
    );
    return { ok: true, action: 'jobs', query, jobs: result?.result || [], deviceId };
  });

  // =============================================
  // HACKER NEWS PingApp
  // =============================================

  function findHNDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'news.ycombinator.com');
  }

  // GET /v1/app/hackernews/front
  app.get('/v1/app/hackernews/front', async (req, reply) => {
    const deviceId = await findHNDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Hacker News tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, 'https://news.ycombinator.com/', '.athing');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.hnStories,
      (stories) => Array.isArray(stories) && stories.length > 0,
    );
    return { ok: true, action: 'front', stories: result?.result || [], deviceId };
  });

  // GET /v1/app/hackernews/new
  app.get('/v1/app/hackernews/new', async (req, reply) => {
    const deviceId = await findHNDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Hacker News tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, 'https://news.ycombinator.com/newest', '.athing');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.hnStories,
      (stories) => Array.isArray(stories) && stories.length > 0,
    );
    return { ok: true, action: 'new', stories: result?.result || [], deviceId };
  });

  // POST /v1/app/hackernews/comments { id }
  app.post('/v1/app/hackernews/comments', async (req, reply) => {
    const { id } = req.body as any;
    if (!id) return reply.code(400).send({ ok: false, error: 'id required' });
    const deviceId = await findHNDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Hacker News tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, `https://news.ycombinator.com/item?id=${id}`, '.comtr, .comment-tree');

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.hnComments });
    return { ok: true, action: 'comments', data: result?.result || {}, deviceId };
  });

  // GET /v1/app/hackernews/ask
  app.get('/v1/app/hackernews/ask', async (req, reply) => {
    const deviceId = await findHNDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Hacker News tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, 'https://news.ycombinator.com/ask', '.athing');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.hnStories,
      (stories) => Array.isArray(stories) && stories.length > 0,
    );
    return { ok: true, action: 'ask', stories: result?.result || [], deviceId };
  });

  // GET /v1/app/hackernews/show
  app.get('/v1/app/hackernews/show', async (req, reply) => {
    const deviceId = await findHNDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Hacker News tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, 'https://news.ycombinator.com/show', '.athing');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.hnStories,
      (stories) => Array.isArray(stories) && stories.length > 0,
    );
    return { ok: true, action: 'show', stories: result?.result || [], deviceId };
  });

  // =============================================
  // SUBSTACK PingApp
  // =============================================

  function findSubstackDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'substack.com');
  }

  // GET /v1/app/substack/feed
  app.get('/v1/app/substack/feed', async (req, reply) => {
    const deviceId = await findSubstackDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Substack tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://substack.com/"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*="post-preview"], article', 3000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.substackFeed,
      (posts) => Array.isArray(posts) && posts.length > 0,
    );
    return { ok: true, action: 'feed', posts: result?.result || [], deviceId };
  });

  // POST /v1/app/substack/article { url }
  app.post('/v1/app/substack/article', async (req, reply) => {
    const { url } = req.body as any;
    if (!url) return reply.code(400).send({ ok: false, error: 'url required' });
    const deviceId = await findSubstackDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Substack tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = ${JSON.stringify(String(url))}` });
    await waitForPageLoad(gatewayUrl, deviceId, 'h1, [class*="post-title"], article', 3000);

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.substackArticle });
    return { ok: true, action: 'article', article: result?.result || {}, deviceId };
  });

  // POST /v1/app/substack/search { query }
  app.post('/v1/app/substack/search', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findSubstackDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Substack tab open' });

    const encoded = encodeURIComponent(String(query));
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://substack.com/search/${encoded}"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[class*="post-preview"], article', 3000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.substackFeed,
      (posts) => Array.isArray(posts) && posts.length > 0,
    );
    return { ok: true, action: 'search', query, posts: result?.result || [], deviceId };
  });

  // =============================================
  // GOOGLE SHEETS PingApp
  // =============================================

  function findSheetsDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'docs.google.com/spreadsheets');
  }

  // Helper: navigate to a cell in Google Sheets via the Name Box
  async function sheetsNavigateToCell(gateway: string, deviceId: string, cellRef: string): Promise<void> {
    await deviceOp(gateway, deviceId, 'click', { selector: '#t-name-box' });
    await delay(200);
    // Select all existing text in name box and clear it
    await deviceOp(gateway, deviceId, 'eval', { expression: `(() => {
      const nb = document.querySelector('#t-name-box');
      if (nb) { nb.select(); nb.value = ''; }
      return true;
    })()` });
    await delay(100);
    await deviceOp(gateway, deviceId, 'type', { selector: '#t-name-box', text: String(cellRef) });
    await delay(100);
    await deviceOp(gateway, deviceId, 'press', { key: 'Enter' });
    await delay(400);
  }

  // Helper: read the formula bar content (contenteditable .cell-input inside #t-formula-bar-input)
  async function sheetsReadFormulaBar(gateway: string, deviceId: string): Promise<string> {
    const result = await deviceOp(gateway, deviceId, 'eval', { expression: `(() => {
      const cellInput = document.querySelector('#t-formula-bar-input .cell-input');
      return cellInput?.textContent?.trim() || '';
    })()` });
    return result?.result || '';
  }

  // Helper: parse A1:B5 range into individual cell refs
  function expandRange(range: string): string[] {
    const match = range.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i);
    if (!match) return [range];
    const colStart = match[1].toUpperCase();
    const rowStart = parseInt(match[2], 10);
    const colEnd = (match[3] || match[1]).toUpperCase();
    const rowEnd = match[4] ? parseInt(match[4], 10) : rowStart;

    const colToNum = (c: string) => { let n = 0; for (let i = 0; i < c.length; i++) n = n * 26 + c.charCodeAt(i) - 64; return n; };
    const numToCol = (n: number) => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };

    const cells: string[] = [];
    for (let r = rowStart; r <= rowEnd; r++) {
      for (let c = colToNum(colStart); c <= colToNum(colEnd); c++) {
        cells.push(numToCol(c) + r);
      }
    }
    return cells;
  }

  // POST /v1/app/gsheets/read { range }
  app.post('/v1/app/gsheets/read', async (req, reply) => {
    const { range } = req.body as any;
    if (!range) return reply.code(400).send({ ok: false, error: 'range required' });
    const deviceId = await findSheetsDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Google Sheets tab open' });

    const cellRefs = expandRange(String(range));
    const cells: Record<string, string> = {};

    for (const ref of cellRefs) {
      await sheetsNavigateToCell(gatewayUrl, deviceId, ref);
      const value = await sheetsReadFormulaBar(gatewayUrl, deviceId);
      cells[ref] = value;
    }

    return { ok: true, action: 'read', range, cells, deviceId };
  });

  // POST /v1/app/gsheets/write { cell, value }
  app.post('/v1/app/gsheets/write', async (req, reply) => {
    const { cell, value } = req.body as any;
    if (!cell || value === undefined) return reply.code(400).send({ ok: false, error: 'cell and value required' });
    const deviceId = await findSheetsDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Google Sheets tab open' });

    // Navigate to the cell via Name Box
    await sheetsNavigateToCell(gatewayUrl, deviceId, String(cell));

    // Click formula bar's contenteditable div, clear it, and type the new value
    await deviceOp(gatewayUrl, deviceId, 'click', { selector: '#t-formula-bar-input .cell-input' });
    await delay(200);
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `(() => {
      const ci = document.querySelector('#t-formula-bar-input .cell-input');
      if (ci) { ci.textContent = ''; ci.focus(); }
      return true;
    })()` });
    await delay(100);
    await deviceOp(gatewayUrl, deviceId, 'type', { selector: '#t-formula-bar-input .cell-input', text: String(value) });
    await delay(200);
    // Press Enter to commit the value
    await deviceOp(gatewayUrl, deviceId, 'press', { key: 'Enter' });
    await delay(300);

    return { ok: true, action: 'write', cell, value: String(value), deviceId };
  });

  // POST /v1/app/gsheets/formula { cell }
  app.post('/v1/app/gsheets/formula', async (req, reply) => {
    const { cell } = req.body as any;
    if (!cell) return reply.code(400).send({ ok: false, error: 'cell required' });
    const deviceId = await findSheetsDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Google Sheets tab open' });

    // Navigate to cell, then read the raw formula from the formula bar
    await sheetsNavigateToCell(gatewayUrl, deviceId, String(cell));
    const formula = await sheetsReadFormulaBar(gatewayUrl, deviceId);
    return { ok: true, action: 'formula', data: { cell, formula }, deviceId };
  });

  // GET /v1/app/gsheets/sheet_list
  app.get('/v1/app/gsheets/sheet_list', async (req, reply) => {
    const deviceId = await findSheetsDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Google Sheets tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.sheetsList });
    return { ok: true, action: 'sheet_list', sheets: result?.result || [], deviceId };
  });

  // =============================================
  // YOUTUBE PingApp
  // =============================================

  function findYouTubeDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'youtube.com');
  }

  // POST /v1/app/youtube/search { query }
  app.post('/v1/app/youtube/search', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findYouTubeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No YouTube tab open' });

    const encoded = encodeURIComponent(String(query));
    await navigateIfNeeded(gatewayUrl, deviceId, `https://www.youtube.com/results?search_query=${encoded}`, 'ytd-video-renderer, ytd-rich-item-renderer');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.youtubeSearch,
      (videos) => Array.isArray(videos) && videos.length > 0,
    );
    return { ok: true, action: 'search', query, videos: result?.result || [], deviceId };
  });

  // GET /v1/app/youtube/trending
  app.get('/v1/app/youtube/trending', async (req, reply) => {
    const deviceId = await findYouTubeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No YouTube tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, 'https://www.youtube.com/feed/explore', 'yt-lockup-view-model, ytd-video-renderer, ytd-rich-item-renderer', 5000, 12_000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.youtubeSearch,
      (videos) => Array.isArray(videos) && videos.length > 0,
    );
    return { ok: true, action: 'trending', videos: result?.result || [], deviceId };
  });

  // POST /v1/app/youtube/video { id }
  app.post('/v1/app/youtube/video', async (req, reply) => {
    const { id } = req.body as any;
    if (!id) return reply.code(400).send({ ok: false, error: 'video id required' });
    const deviceId = await findYouTubeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No YouTube tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, `https://www.youtube.com/watch?v=${id}`, '#title h1, h1.ytd-watch-metadata, #info-strings');

    const result = await extractWithRetries<Record<string, unknown>>(
      gatewayUrl, deviceId, EXTRACTORS.youtubeVideo,
      (v) => Boolean(v && (v as any).title),
    );
    return { ok: true, action: 'video', video: result?.result || {}, deviceId };
  });

  // POST /v1/app/youtube/clean
  app.post('/v1/app/youtube/clean', async (req, reply) => {
    const deviceId = await findYouTubeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No YouTube tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const selectors = ['#masthead-ad', '#player-ads', '.ytp-ad-overlay-container', '.ytp-ad-module', 'ytd-ad-slot-renderer', 'ytd-banner-promo-renderer', 'ytd-promoted-sparkles-web-renderer', 'ytd-display-ad-renderer', 'ytd-in-feed-ad-layout-renderer', '#related ytd-promoted-sparkles-web-renderer'];
        let removed = 0;
        selectors.forEach(s => { document.querySelectorAll(s).forEach(el => { el.remove(); removed++; }); });
        return { removed };
      })()`,
    });
    return { ok: true, action: 'clean', deviceId };
  });

  // =============================================
  // GMAIL PingApp
  // =============================================

  function findGmailDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'mail.google.com');
  }

  // GET /v1/app/gmail/inbox
  app.get('/v1/app/gmail/inbox', async (req, reply) => {
    const deviceId = await findGmailDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Gmail tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://mail.google.com/mail/u/0/#inbox"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'tr.zA, tr[role="row"], div[role="row"]', 4000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.gmailInbox,
      (emails) => Array.isArray(emails) && emails.length > 0,
    );
    return { ok: true, action: 'inbox', emails: result?.result || [], deviceId };
  });

  // POST /v1/app/gmail/read { index }
  app.post('/v1/app/gmail/read', async (req, reply) => {
    const { index = 0 } = req.body as any;
    const deviceId = await findGmailDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Gmail tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const rows = document.querySelectorAll('tr.zA, tr[role="row"], div[role="row"]');
        const target = rows[${Number(index)}];
        if (!target) return false;
        target.click();
        return true;
      })()`,
    });
    await waitForPageLoad(gatewayUrl, deviceId, '.a3s, .a3s.aiL, h2.hP', 3000);

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.gmailMessage });
    return { ok: true, action: 'read', index, message: result?.result || {}, deviceId };
  });

  // POST /v1/app/gmail/compose { to, subject, body }
  app.post('/v1/app/gmail/compose', async (req, reply) => {
    const { to, subject, body } = req.body as any;
    if (!to || !subject || !body) return reply.code(400).send({ ok: false, error: 'to, subject, and body required' });
    const deviceId = await findGmailDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Gmail tab open' });

    await deviceOp(gatewayUrl, deviceId, 'click', { selector: '.T-I.T-I-KE.L3, [gh="cm"], div[role="button"][class*="compose"]', stealth: true });
    await waitForPageLoad(gatewayUrl, deviceId, 'input[name="to"], [name="to"], textarea[name="to"]', 3000);

    await deviceOp(gatewayUrl, deviceId, 'type', { selector: 'input[name="to"], [name="to"], textarea[name="to"]', text: String(to), stealth: true, clear: true });
    await delay(300);
    await deviceOp(gatewayUrl, deviceId, 'type', { selector: 'input[name="subjectbox"], [name="subjectbox"]', text: String(subject), stealth: true, clear: true });
    await delay(300);
    await deviceOp(gatewayUrl, deviceId, 'type', { selector: 'div[aria-label="Message Body"], div[role="textbox"], .Am.Al.editable', text: String(body), stealth: true, clear: true });
    await delay(500);

    await deviceOp(gatewayUrl, deviceId, 'click', { selector: 'div[aria-label*="Send"], [data-tooltip*="Send"], .T-I.J-J5-Ji[aria-label*="Send"]', stealth: true });
    await delay(1500);

    return { ok: true, action: 'compose', to, subject, deviceId };
  });

  // POST /v1/app/gmail/search { query }
  app.post('/v1/app/gmail/search', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findGmailDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Gmail tab open' });

    const encoded = encodeURIComponent(String(query));
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://mail.google.com/mail/u/0/#search/${encoded}"` });
    await waitForPageLoad(gatewayUrl, deviceId, 'tr.zA, tr[role="row"], div[role="row"]', 4000);

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.gmailInbox,
      (emails) => Array.isArray(emails) && emails.length > 0,
    );
    return { ok: true, action: 'search', query, emails: result?.result || [], deviceId };
  });

  // =============================================
  // GOOGLE CALENDAR PingApp
  // =============================================

  function findCalendarDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'calendar.google.com');
  }

  // GET /v1/app/gcalendar/today
  app.get('/v1/app/gcalendar/today', async (req, reply) => {
    const deviceId = await findCalendarDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Google Calendar tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://calendar.google.com/calendar/r/day"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[data-eventid], [data-eventchip], [role="button"][data-eventid]', 3000);

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.calendarEvents });
    return { ok: true, action: 'today', events: result?.result || [], deviceId };
  });

  // GET /v1/app/gcalendar/week
  app.get('/v1/app/gcalendar/week', async (req, reply) => {
    const deviceId = await findCalendarDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Google Calendar tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://calendar.google.com/calendar/r/week"` });
    await waitForPageLoad(gatewayUrl, deviceId, '[data-eventid], [data-eventchip], [role="button"][data-eventid]', 3000);

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.calendarEvents });
    return { ok: true, action: 'week', events: result?.result || [], deviceId };
  });

  // POST /v1/app/gcalendar/create { title, date, time, duration }
  app.post('/v1/app/gcalendar/create', async (req, reply) => {
    const { title, date, time, duration } = req.body as any;
    if (!title || !date) return reply.code(400).send({ ok: false, error: 'title and date required' });
    const deviceId = await findCalendarDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Google Calendar tab open' });

    const dateStr = String(date).replace(/-/g, '');
    const timeStr = time ? String(time).replace(/:/g, '') + '00' : '';
    const datesParam = timeStr ? `${dateStr}T${timeStr}/${dateStr}T${timeStr}` : `${dateStr}/${dateStr}`;
    const encoded = encodeURIComponent(String(title));
    await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `window.location.href = "https://calendar.google.com/calendar/r/eventedit?text=${encoded}&dates=${datesParam}"`,
    });
    await waitForPageLoad(gatewayUrl, deviceId, '[data-key="title"], #xTiIn, input[aria-label*="title"], [aria-label*="Title"]', 3000);

    await delay(1000);
    await deviceOp(gatewayUrl, deviceId, 'click', { selector: '[data-key="save"], button[aria-label*="Save"], [aria-label*="save"]', stealth: true });
    await delay(1500);

    return { ok: true, action: 'create', title, date, time: time || null, duration: duration || null, deviceId };
  });

  // =============================================
  // REDDIT PingApp
  // =============================================

  function findRedditDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'reddit.com');
  }

  // GET /v1/app/reddit/feed
  app.get('/v1/app/reddit/feed', async (req, reply) => {
    const deviceId = await findRedditDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Reddit tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, 'https://www.reddit.com/', 'shreddit-post, [data-testid="post-container"], article');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.redditFeed,
      (posts) => Array.isArray(posts) && posts.length > 0,
    );
    return { ok: true, action: 'feed', posts: result?.result || [], deviceId };
  });

  // POST /v1/app/reddit/subreddit { name }
  app.post('/v1/app/reddit/subreddit', async (req, reply) => {
    const { name } = req.body as any;
    if (!name) return reply.code(400).send({ ok: false, error: 'subreddit name required' });
    const deviceId = await findRedditDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Reddit tab open' });

    const sub = String(name).replace(/^r\//, '');
    await navigateIfNeeded(gatewayUrl, deviceId, `https://www.reddit.com/r/${sub}/`, 'shreddit-post, [data-testid="post-container"], article');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.redditFeed,
      (posts) => Array.isArray(posts) && posts.length > 0,
    );
    return { ok: true, action: 'subreddit', name: sub, posts: result?.result || [], deviceId };
  });

  // POST /v1/app/reddit/post { url }
  app.post('/v1/app/reddit/post', async (req, reply) => {
    const { url } = req.body as any;
    if (!url) return reply.code(400).send({ ok: false, error: 'post url required' });
    const deviceId = await findRedditDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Reddit tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, String(url), 'shreddit-post, [data-testid="post-container"], shreddit-comment');

    const result = await extractWithRetries<Record<string, unknown>>(
      gatewayUrl, deviceId, EXTRACTORS.redditPost,
      (p) => Boolean(p && (p as any).title),
    );
    return { ok: true, action: 'post', post: result?.result || {}, deviceId };
  });

  // =============================================
  // GITHUB PingApp
  // =============================================

  function findGitHubDevice(gateway: string): Promise<string | null> {
    return findDeviceByDomain(gateway, 'github.com');
  }

  // POST /v1/app/github/search { query, type? }
  app.post('/v1/app/github/search', async (req, reply) => {
    const { query, type = 'repositories' } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    const deviceId = await findGitHubDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No GitHub tab open' });

    const encoded = encodeURIComponent(String(query));
    const searchType = String(type).toLowerCase();
    await navigateIfNeeded(gatewayUrl, deviceId, `https://github.com/search?q=${encoded}&type=${searchType}`, '.repo-list-item, [data-testid="results-list"], .search-title');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.githubSearch,
      (repos) => Array.isArray(repos) && repos.length > 0,
    );
    return { ok: true, action: 'search', query, type: searchType, results: result?.result || [], deviceId };
  });

  // POST /v1/app/github/repo { owner, name }
  app.post('/v1/app/github/repo', async (req, reply) => {
    const { owner, name } = req.body as any;
    if (!owner || !name) return reply.code(400).send({ ok: false, error: 'owner and name required' });
    const deviceId = await findGitHubDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No GitHub tab open' });

    await navigateIfNeeded(gatewayUrl, deviceId, `https://github.com/${owner}/${name}`, '[itemprop="name"], .AppHeader-context-item-label, #readme');

    const result = await extractWithRetries<Record<string, unknown>>(
      gatewayUrl, deviceId, EXTRACTORS.githubRepo,
      (r) => Boolean(r && ((r as any).name || (r as any).description)),
    );
    return { ok: true, action: 'repo', repo: result?.result || {}, deviceId };
  });

  // GET /v1/app/github/trending
  app.get('/v1/app/github/trending', async (req, reply) => {
    const { language } = req.query as any;
    const deviceId = await findGitHubDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No GitHub tab open' });

    const langPath = language ? `/${encodeURIComponent(String(language).toLowerCase())}` : '';
    await navigateIfNeeded(gatewayUrl, deviceId, `https://github.com/trending${langPath}`, 'article.Box-row, .Box-row');

    const result = await extractWithRetries<any[]>(
      gatewayUrl, deviceId, EXTRACTORS.githubTrending,
      (repos) => Array.isArray(repos) && repos.length > 0,
    );
    return { ok: true, action: 'trending', language: language || null, repos: result?.result || [], deviceId };
  });

  // ═══════════════════════════════════════════════════════════════════════
  // UNIVERSAL GOOGLE AUTH
  // ═══════════════════════════════════════════════════════════════════════

  // POST /v1/auth/google — trigger Google sign-in flow on any page
  // Body: { deviceId, email?, password?, timeoutMs? }
  app.post('/v1/auth/google', async (req, reply) => {
    const { deviceId, email, password, timeoutMs } = req.body as any;
    if (!deviceId) return reply.code(400).send({ ok: false, error: 'deviceId required' });

    const result = await googleAuth({
      gateway: gatewayUrl,
      deviceId,
      email: email || undefined,
      password: password || undefined,
      timeoutMs: timeoutMs || 30_000,
    });

    return result;
  });

  // POST /v1/auth/google/check — check if current tab is authenticated via Google
  // Body: { deviceId }
  app.post('/v1/auth/google/check', async (req, reply) => {
    const { deviceId } = req.body as any;
    if (!deviceId) return reply.code(400).send({ ok: false, error: 'deviceId required' });

    const result = await checkGoogleAuth(gatewayUrl, deviceId);
    return { ok: true, ...result };
  });

  // POST /v1/auth/google/auto — auto-find a device on a site that needs Google auth and run the flow
  // Body: { domain, email?, password?, timeoutMs? }
  // Finds the first tab matching `domain`, checks auth, and runs Google sign-in if needed.
  app.post('/v1/auth/google/auto', async (req, reply) => {
    const { domain, email, password, timeoutMs } = req.body as any;
    if (!domain) return reply.code(400).send({ ok: false, error: 'domain required (e.g. "notion.so")' });

    const deviceId = await findDeviceByDomain(gatewayUrl, domain);
    if (!deviceId) return reply.code(404).send({ ok: false, error: `No tab open on ${domain}` });

    // Check if already authenticated
    const authCheck = await checkGoogleAuth(gatewayUrl, deviceId);
    if (authCheck.authenticated) {
      return { ok: true, alreadyAuthenticated: true, email: authCheck.email, deviceId };
    }

    // Run the Google OAuth flow
    const result = await googleAuth({
      gateway: gatewayUrl,
      deviceId,
      email: email || undefined,
      password: password || undefined,
      timeoutMs: timeoutMs || 30_000,
    });

    return { ...result, deviceId };
  });

}
