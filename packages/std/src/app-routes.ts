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

// Helper: call extension device op
async function deviceOp(gateway: string, deviceId: string, op: string, payload: any = {}): Promise<any> {
  const res = await fetch(`${gateway}/v1/dev/${deviceId}/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Helper: find AliExpress device
async function findDevice(gateway: string): Promise<string | null> {
  const res = await fetch(`${gateway}/v1/devices`);
  const data: any = await res.json();
  const devices = data?.extension?.devices || [];
  const ali = devices.find((d: any) => 
    d.url?.includes('aliexpress.com') || d.url?.includes('aliexpress')
  );
  return ali?.deviceId || null;
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
  
  // POST /v1/app/aliexpress/search { query }
  app.post('/v1/app/aliexpress/search', async (req, reply) => {
    const { query } = req.body as any;
    if (!query) return reply.code(400).send({ ok: false, error: 'query required' });
    
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    // Navigate to search
    const encoded = encodeURIComponent(query).replace(/%20/g, '-');
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/w/wholesale-${encoded}.html"` });
    await new Promise(r => setTimeout(r, 5000));
    
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
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/item/${id}.html"` });
    await new Promise(r => setTimeout(r, 5000));
    await deviceOp(gatewayUrl, deviceId, 'clean', { mode: 'full' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.productDetails });
    return { ok: true, action: 'product', product: result?.result || {}, deviceId };
  });

  // POST /v1/app/aliexpress/cart/add
  app.post('/v1/app/aliexpress/cart/add', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    const result = await deviceOp(gatewayUrl, deviceId, 'click', { selector: 'text=Add to cart', stealth: true });
    await new Promise(r => setTimeout(r, 2000));
    
    return { ok: result?.ok || false, action: 'addToCart', deviceId };
  });

  // POST /v1/app/aliexpress/cart/remove { index }
  app.post('/v1/app/aliexpress/cart/remove', async (req, reply) => {
    const { index = 0 } = req.body as any;
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    // Navigate to cart first
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/shoppingcart/index.html"` });
    await new Promise(r => setTimeout(r, 4000));
    
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
    await new Promise(r => setTimeout(r, 5000));
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.cartItems });
    return { ok: true, action: 'cart', cart: result?.result || {}, deviceId };
  });

  // GET /v1/app/aliexpress/orders
  app.get('/v1/app/aliexpress/orders', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/order/index.html"` });
    await new Promise(r => setTimeout(r, 5000));
    
    const result = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: EXTRACTORS.orders });
    return { ok: true, action: 'orders', orders: result?.result || {}, deviceId };
  });

  // GET /v1/app/aliexpress/orders/:orderId
  app.get('/v1/app/aliexpress/orders/:orderId', async (req, reply) => {
    const { orderId } = req.params as any;
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/order/detail.html?orderId=${orderId}"` });
    await new Promise(r => setTimeout(r, 5000));
    
    const text = await deviceOp(gatewayUrl, deviceId, 'eval', { expression: 'document.body.innerText.substring(0, 2000)' });
    return { ok: true, action: 'trackOrder', orderId, details: text?.result || '', deviceId };
  });

  // GET /v1/app/aliexpress/wishlist
  app.get('/v1/app/aliexpress/wishlist', async (req, reply) => {
    const deviceId = await findDevice(gatewayUrl);
    if (!deviceId) return reply.code(404).send({ ok: false, error: 'No AliExpress tab open' });
    
    await deviceOp(gatewayUrl, deviceId, 'eval', { expression: `window.location.href = "https://www.aliexpress.com/p/wishlist/index.html"` });
    await new Promise(r => setTimeout(r, 5000));
    
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

  // GET /v1/apps — list all registered apps
  app.get('/v1/apps', async () => {
    return {
      ok: true,
      apps: [{
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
      }],
    };
  });
}
