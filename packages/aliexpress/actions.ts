/**
 * AliExpress PingApp — High-level shopping actions
 * 
 * These are composite operations that chain PingOS primitives (eval, click, type, clean, recon)
 * into meaningful shopping workflows. Any model can call these via:
 *   POST /v1/app/aliexpress/:action
 */

const DEVICE_PREFIX = 'chrome-';
const BASE_URL = 'https://www.aliexpress.com';

// Extraction patterns for AliExpress pages
export const extractors = {
  
  /** Extract product cards from search results */
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
      const priceEl = card.querySelector('[class*=price], [class*=Price]');
      const price = priceEl?.textContent?.trim() || '';
      const rating = card.querySelector('[class*=star], [class*=rating]')?.textContent?.trim() || '';
      const sold = card.querySelector('[class*=sold], [class*=trade]')?.textContent?.trim() || '';
      const img = card.querySelector('img')?.src || '';
      if (title.length > 5) {
        products.push({ id: idMatch[1], title: title.substring(0, 100), price, rating, sold, img: img.substring(0, 150), url: href.split('?')[0] });
      }
    }
    return products.slice(0, 20);
  })()`,

  /** Extract product details from product page */
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
    const imgs = Array.from(document.querySelectorAll('[class*=slider] img, [class*=gallery] img')).slice(0, 5).map(i => i.src);
    
    // Variants/options
    const variants = [];
    document.querySelectorAll('[class*=sku-property], [class*=variant]').forEach(group => {
      const name = group.querySelector('[class*=title], [class*=name]')?.textContent?.trim() || '';
      const options = Array.from(group.querySelectorAll('[class*=item], [class*=option], button, a')).map(o => o.textContent?.trim()).filter(t => t && t.length < 50);
      if (name || options.length) variants.push({ name, options });
    });
    
    return { title, price, originalPrice, rating, reviews, store, shipping, sold, images: imgs, variants, url: location.href.split('?')[0], id: location.href.match(/item\\/(\\d+)/)?.[1] || '' };
  })()`,

  /** Extract cart contents */
  cartItems: `(() => {
    const items = [];
    document.querySelectorAll('[class*=order-item], [class*=product-item], [class*=cart-item]').forEach(el => {
      const title = el.querySelector('[class*=title], a[href*=item]')?.textContent?.trim() || '';
      const price = el.querySelector('[class*=price], [class*=Price]')?.textContent?.trim() || '';
      const qty = el.querySelector('[class*=quantity] input, [class*=count]')?.value || el.querySelector('[class*=quantity], [class*=count]')?.textContent?.trim() || '1';
      const store = el.querySelector('[class*=store], [class*=Store]')?.textContent?.trim() || '';
      const img = el.querySelector('img')?.src || '';
      if (title.length > 5) items.push({ title: title.substring(0, 100), price, quantity: qty, store, img: img.substring(0, 150) });
    });
    
    // Also get summary
    const total = document.querySelector('[class*=total], [class*=Total], [class*=summary]')?.textContent?.trim() || '';
    const cartCount = document.querySelector('[class*=cart-count], [class*=Cart] [class*=num]')?.textContent?.trim() || '';
    
    // Fallback: parse from body text
    if (items.length === 0) {
      const text = document.body.innerText;
      const cartMatch = text.match(/Cart\\s*\\((\\d+)\\)/);
      return { items: [], count: cartMatch ? parseInt(cartMatch[1]) : 0, total, rawText: text.substring(0, 600) };
    }
    
    return { items, count: items.length, total };
  })()`,

  /** Extract order list */
  orders: `(() => {
    const orders = [];
    const orderBlocks = document.querySelectorAll('[class*=order-item], [class*=order-card]');
    orderBlocks.forEach(block => {
      const status = block.querySelector('[class*=status], [class*=Status]')?.textContent?.trim() || '';
      const date = block.querySelector('[class*=date], [class*=time]')?.textContent?.trim() || '';
      const orderId = block.querySelector('[class*=order-id], [class*=orderId]')?.textContent?.trim() || '';
      const total = block.querySelector('[class*=total], [class*=Total], [class*=price]')?.textContent?.trim() || '';
      const items = Array.from(block.querySelectorAll('[class*=product], [class*=title] a, img[class*=product]')).slice(0, 3).map(el => el.textContent?.trim() || el.src || '').filter(Boolean);
      orders.push({ status, date, orderId: orderId.replace(/[^0-9]/g, ''), total, items });
    });
    
    // Fallback: parse from text
    if (orders.length === 0) {
      const text = document.body.innerText;
      const idMatches = [...text.matchAll(/Order ID:\\s*(\\d+)/g)];
      return { orders: idMatches.map(m => ({ orderId: m[1] })), rawText: text.substring(0, 800) };
    }
    
    return { orders };
  })()`,

  /** Extract wishlist items */
  wishlistItems: `(() => {
    const items = [];
    document.querySelectorAll('[class*=wish-item], [class*=product-card], [class*=item-card]').forEach(el => {
      const title = el.querySelector('[class*=title], a')?.textContent?.trim() || '';
      const price = el.querySelector('[class*=price]')?.textContent?.trim() || '';
      const img = el.querySelector('img')?.src || '';
      if (title.length > 5) items.push({ title: title.substring(0, 100), price, img: img.substring(0, 150) });
    });
    return { items, count: items.length };
  })()`,
};

/** 
 * Action definitions for gateway route registration.
 * Each action: { method, path, handler description }
 */
export const actions = {
  search: {
    method: 'POST',
    path: '/v1/app/aliexpress/search',
    params: ['query'],
    description: 'Search products. Returns up to 20 results with id, title, price, rating, sold count.',
  },
  product: {
    method: 'POST', 
    path: '/v1/app/aliexpress/product',
    params: ['id'],
    description: 'Get product details: title, price, variants, rating, reviews, store, shipping.',
  },
  addToCart: {
    method: 'POST',
    path: '/v1/app/aliexpress/cart/add',
    params: [],
    description: 'Add the currently viewed product to cart. Must be on a product page.',
  },
  removeFromCart: {
    method: 'POST',
    path: '/v1/app/aliexpress/cart/remove',
    params: ['index'],
    description: 'Remove item at index from cart.',
  },
  viewCart: {
    method: 'GET',
    path: '/v1/app/aliexpress/cart',
    params: [],
    description: 'Get cart contents with items, quantities, prices, total.',
  },
  viewOrders: {
    method: 'GET',
    path: '/v1/app/aliexpress/orders',
    params: [],
    description: 'Get order history with status, dates, order IDs.',
  },
  trackOrder: {
    method: 'GET',
    path: '/v1/app/aliexpress/orders/:orderId',
    params: ['orderId'],
    description: 'Track a specific order.',
  },
  viewWishlist: {
    method: 'GET',
    path: '/v1/app/aliexpress/wishlist',
    params: [],
    description: 'Get wishlist items.',
  },
  account: {
    method: 'GET',
    path: '/v1/app/aliexpress/account',
    params: [],
    description: 'Get account overview.',
  },
  clean: {
    method: 'POST',
    path: '/v1/app/aliexpress/clean',
    params: [],
    description: 'Remove ads and clutter from current page. Smart — gentle on cart/checkout.',
  },
  recon: {
    method: 'GET',
    path: '/v1/app/aliexpress/recon',
    params: [],
    description: 'Analyze current page structure, interactive elements, forms.',
  },
};
