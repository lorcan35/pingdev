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

const ROUTE_TIMEOUT_MS = 20_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const title = document.querySelector('h1')?.textContent?.trim() || '';
    const priceEls = document.querySelectorAll('[class*=price], [class*=Price]');
    const price = priceEls[0]?.textContent?.trim() || '';
    const originalPrice = priceEls[1]?.textContent?.trim() || '';
    const rating = document.querySelector('[class*=rating], [class*=star]')?.textContent?.trim() || '';
    const reviews = document.querySelector('[class*=review], [class*=Review]')?.textContent?.trim() || '';
    const store = document.querySelector('[class*=store-name], [class*=Store] a')?.textContent?.trim() || '';
    const shipping = document.querySelector('[class*=shipping], [class*=delivery]')?.textContent?.trim() || '';
    const sold = document.querySelector('[class*=sold], [class*=trade]')?.textContent?.trim() || '';
    const variants = [];
    document.querySelectorAll('[class*=sku-property], [class*=variant]').forEach(group => {
      const name = group.querySelector('[class*=title], [class*=name]')?.textContent?.trim() || '';
      const options = Array.from(group.querySelectorAll('[class*=item], [class*=option], button, a')).map(o => o.textContent?.trim()).filter(t => t && t.length < 50);
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
      const compact = text.replace(/\s+/g, ' ').trim();
      const moneyMatch = compact.match(/(?:AED|\$|€|£|₹)\s*\d+[\d,]*(?:\.\d{1,2})?/i);
      if (moneyMatch) return moneyMatch[0].replace(/\s+/g, ' ').trim();
      const trailing = compact.match(/\d+[\d,]*(?:\.\d{1,2})?/);
      return trailing ? trailing[0] : compact;
    };

    const items = [];
    document.querySelectorAll('[data-asin]').forEach(el => {
      const asin = el.getAttribute('data-asin');
      if (!asin || asin.length < 5) return;
      const title = el.querySelector('h2, [class*=title]')?.textContent?.trim() || '';
      const primaryPrice = el.querySelector('.a-price .a-offscreen, .a-price-whole, [data-cy="price-recipe"] .a-offscreen')?.textContent?.trim() || '';
      const fallbackPrice = el.querySelector('[class*=price]')?.textContent?.trim() || '';
      const price = cleanPrice(primaryPrice || fallbackPrice);
      const rating = el.querySelector('[class*=rating], .a-icon-alt')?.textContent?.trim() || '';
      const reviews = el.querySelector('[class*=review], [aria-label*=stars]')?.getAttribute('aria-label') || '';
      const img = el.querySelector('img')?.src || '';
      const prime = !!el.querySelector('[class*=prime], [aria-label*=Prime]');
      if (title.length > 5 && price) {
        items.push({ asin, title: title.substring(0, 100), price, rating: rating.substring(0, 20), reviews: reviews.substring(0, 30), img: img.substring(0, 150), prime, url: 'https://www.amazon.ae/dp/' + asin });
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
    const imgs = Array.from(document.querySelectorAll('#altImages img, #imageBlock img')).slice(0, 5).map(i => (i as HTMLImageElement).src);
    const features = Array.from(document.querySelectorAll('#feature-bullets li')).map(li => li.textContent?.trim() || '').filter(Boolean).slice(0, 8);
    const asin = location.href.match(/\\/dp\\/([A-Z0-9]+)/)?.[1] || '';
    return { title, price, rating, reviews, seller, availability, prime, images: imgs, features, asin, url: location.href.split('?')[0] };
  })()`,


  claudeResponse: `(() => {
    const msgs = document.querySelectorAll('[class*="message"], [data-testid*="message-content"], .font-claude-message');
    const assistant = Array.from(msgs).filter(el => {
      const role = el.closest('[data-testid*="user"]') ? 'user' : 'assistant';
      return role === 'assistant' || !el.closest('[data-testid*="user"]');
    });
    const last = assistant[assistant.length - 1];
    return last ? last.textContent?.trim()?.substring(0, 5000) || '' : '';
  })()`,

  claudeConversations: `(() => {
    const links = document.querySelectorAll('a[href*="/chat/"]');
    const seen = new Set();
    return Array.from(links)
      .map(a => {
        const title = (a.textContent || '').trim();
        const href = a.href || '';
        const id = href.match(/\/chat\/([^?#/]+)/)?.[1] || '';
        return { title, url: href, id };
      })
      .filter(x => {
        if (!x.id || !x.url.includes('/chat/')) return false;
        if (!x.title || x.title.length < 4) return false;
        if (/new chat|start|upgrade|settings/i.test(x.title)) return false;
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      })
      .slice(0, 20)
      .map(x => ({ ...x, title: x.title.substring(0, 120) }));
  })()`,

  claudeModel: `(() => {
    const modelBtn = document.querySelector('[data-testid="model-selector-dropdown"], #_r_5g_');
    return modelBtn?.textContent?.trim() || 'unknown';
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
};

export function registerAppRoutes(app: FastifyInstance, gatewayUrl: string) {
  app.setErrorHandler((error, _request, reply) => {
    const message = error instanceof Error ? error.message : 'App route failed';
    reply.code(500).send({ ok: false, error: message });
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
    await delay(5000);
    
    // Clean ads
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    
    // Extract products
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.searchResults });
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
    await delay(5000);
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.productDetails });
    return { ok: true, action: 'product', product: result?.result || {}, deviceId };
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
    await delay(4000);
    
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
    await delay(5000);
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.cartItems });
    return { ok: true, action: 'cart', cart: result?.result || {}, deviceId };
  });

  // GET /v1/app/aliexpress/orders
  app.get('/v1/app/aliexpress/orders', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/order/index.html"` });
    await delay(5000);
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.orders });
    return { ok: true, action: 'orders', orders: result?.result || {}, deviceId };
  });

  // GET /v1/app/aliexpress/orders/:orderId
  app.get('/v1/app/aliexpress/orders/:orderId', async (req, reply) => {
    const { orderId } = req.params as any;
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/order/detail.html?orderId=${orderId}"` });
    await delay(5000);
    
    const text = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 2000)' });
    return { ok: true, action: 'trackOrder', orderId, details: text?.result || '', deviceId };
  });

  // GET /v1/app/aliexpress/wishlist
  app.get('/v1/app/aliexpress/wishlist', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/wishlist/index.html"` });
    await delay(5000);
    
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
    
    const encoded = encodeURIComponent(query);
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.amazon.ae/s?k=${encoded}"` });
    await delay(5000);
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.amazonSearch });
    return { ok: true, action: 'search', query, products: result?.result || [], deviceId };
  });

  // POST /v1/app/amazon/product { asin }
  app.post('/v1/app/amazon/product', async (req, reply) => {
    const { asin } = req.body as any;
    if (!asin) return reply.code(400).send({ ok: false, error: 'asin required' });
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.amazon.ae/dp/${asin}"` });
    await delay(5000);
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.amazonProduct });
    return { ok: true, action: 'product', product: result?.result || {}, deviceId };
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
    await delay(5000);
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 2000)' });
    return { ok: true, action: 'cart', content: result?.result || '', deviceId };
  });

  // GET /v1/app/amazon/orders
  app.get('/v1/app/amazon/orders', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.amazon.ae/gp/your-account/order-history"` });
    await delay(5000);
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 3000)' });
    return { ok: true, action: 'orders', content: result?.result || '', deviceId };
  });

  // GET /v1/app/amazon/deals
  app.get('/v1/app/amazon/deals', async (req, reply) => {
    const deviceId = await findAmazonDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Amazon tab open' });
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.amazon.ae/deals"` });
    await delay(5000);
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

    await deviceOp(gatewayUrl, deviceId, 'type', {
      selector: '[data-testid="chat-input"]',
      text: String(message),
      stealth: true,
      clear: true,
    });

    const sendResult = await deviceOp(gatewayUrl, deviceId, 'click', {
      selector: 'button[aria-label="Send message"]',
      stealth: true,
    });

    if (!sendResult?.ok) {
      await deviceOp(gatewayUrl, deviceId, 'eval', {
        expression: `(() => {
          const box = document.querySelector('[data-testid="chat-input"]') || document.querySelector('[data-testid="chat-input-ssr"]');
          if (!box) return 'no-input';
          const evt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
          box.dispatchEvent(evt);
          return 'enter-dispatched';
        })()`,
      });
    }

    await delay(3000);
    return { ok: true, action: 'chat', sent: String(message) };
  });

  // POST /v1/app/claude/chat/new
  app.post('/v1/app/claude/chat/new', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/new"` });
    await delay(3000);
    return { ok: true, action: 'newChat' };
  });

  // GET /v1/app/claude/chat/read
  app.get('/v1/app/claude/chat/read', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const msgs = document.querySelectorAll('[class*="message"], [data-testid*="message"], .font-claude-message, [class*="response"]');
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
    await delay(3000);
    return { ok: true, action: 'openConversation', id };
  });

  // GET /v1/app/claude/model
  app.get('/v1/app/claude/model', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.claudeModel });
    return { ok: true, model: result?.result || 'unknown' };
  });

  // POST /v1/app/claude/model { model }
  app.post('/v1/app/claude/model', async (req, reply) => {
    const { model } = req.body as any;
    if (!model) return reply.code(400).send({ ok: false, error: 'model required' });

    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    await deviceOp(gatewayUrl, deviceId, 'click', { selector: '[data-testid="model-selector-dropdown"]', stealth: true });

    const modelText = String(model);
    const picked = await deviceOp(gatewayUrl, deviceId, 'eval', {
      expression: `(() => {
        const target = ${JSON.stringify('__MODEL__')}.toLowerCase();
        const options = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], button, li, div'));
        const match = options.find(el => (el.textContent || '').trim().toLowerCase().includes(target));
        if (!match) return false;
        match.click();
        return true;
      })()`.replace('__MODEL__', modelText),
    });

    await delay(1200);
    return { ok: !!picked?.result, action: 'setModel', model: modelText };
  });

  // GET /v1/app/claude/projects
  app.get('/v1/app/claude/projects', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const nav = await deviceOp(gatewayUrl, deviceId, 'click', { selector: 'a[aria-label="Projects"]', stealth: true });
    if (!nav?.ok) await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/projects"` });
    await delay(2000);

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
    await delay(3000);
    return { ok: true, action: 'openProject', id };
  });

  // GET /v1/app/claude/artifacts
  app.get('/v1/app/claude/artifacts', async (req, reply) => {
    const deviceId = await findClaudeDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No Claude tab open' });

    const nav = await deviceOp(gatewayUrl, deviceId, 'click', { selector: 'a[aria-label="Artifacts"]', stealth: true });
    if (!nav?.ok) await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://claude.ai/artifacts"` });
    await delay(2000);

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
    await delay(2000);

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

  // GET /v1/apps — list all registered apps
  app.get('/v1/apps', async () => {
    return {
      ok: true,
      apps: [
        {
          name: 'aliexpress',
          displayName: 'AliExpress',
          version: '0.1.0',
          actions: [
            'POST /v1/app/aliexpress/search { query }',
            'POST /v1/app/aliexpress/product { id }',
            'POST /v1/app/aliexpress/cart/add',
            'POST /v1/app/aliexpress/cart/remove { index }',
            'GET  /v1/app/aliexpress/cart',
            'GET  /v1/app/aliexpress/orders',
            'GET  /v1/app/aliexpress/orders/:orderId',
            'GET  /v1/app/aliexpress/wishlist',
            'POST /v1/app/aliexpress/clean',
            'GET  /v1/app/aliexpress/recon',
          ],
        },
        {
          name: 'amazon',
          displayName: 'Amazon UAE',
          version: '0.1.0',
          actions: [
            'POST /v1/app/amazon/search { query }',
            'POST /v1/app/amazon/product { asin }',
            'POST /v1/app/amazon/cart/add',
            'GET  /v1/app/amazon/cart',
            'GET  /v1/app/amazon/orders',
            'GET  /v1/app/amazon/deals',
            'POST /v1/app/amazon/clean',
            'GET  /v1/app/amazon/recon',
          ],
        },

        {
          name: 'claude',
          displayName: 'Claude.ai',
          version: '0.1.0',
          actions: [
            'POST /v1/app/claude/chat { message }',
            'POST /v1/app/claude/chat/new',
            'GET  /v1/app/claude/chat/read',
            'GET  /v1/app/claude/conversations',
            'POST /v1/app/claude/conversation { id }',
            'GET  /v1/app/claude/model',
            'POST /v1/app/claude/model { model }',
            'GET  /v1/app/claude/projects',
            'POST /v1/app/claude/project { id }',
            'GET  /v1/app/claude/artifacts',
            'POST /v1/app/claude/upload { filePath }',
            'GET  /v1/app/claude/search { query }',
            'POST /v1/app/claude/clean',
            'GET  /v1/app/claude/recon',
          ],
        },
      ],
    };
  });
}
