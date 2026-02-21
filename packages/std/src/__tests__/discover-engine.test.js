// @pingdev/std — Tests for Zero-Shot Site Adaptation (discover engine)
import { describe, it, expect } from 'vitest';
import { discoverPage } from '../discover-engine.js';
describe('discoverPage', () => {
    it('classifies a product page with price and title', () => {
        const result = discoverPage({
            url: 'https://www.amazon.com/dp/B09XXXYYY',
            title: 'Wireless Headphones',
            meta: { 'og:type': 'product' },
            jsonLd: [{ '@type': 'Product', name: 'Wireless Headphones', price: '$49.99' }],
            elements: [
                { tag: 'h1', text: 'Wireless Headphones', selector: 'h1.product-title', attributes: { itemprop: 'name' } },
                { tag: 'span', text: '$49.99', selector: 'span.price-value', classes: ['price-value'] },
                { tag: 'span', ariaLabel: '4.5 out of 5 stars', selector: 'span.rating', classes: ['rating'] },
                { tag: 'img', id: 'main-product-img', selector: '#main-product-img', classes: ['product-image'] },
            ],
        });
        expect(result.pageType).toBe('product');
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
        expect(result.schemas.length).toBeGreaterThanOrEqual(1);
        expect(result.schemas[0].name).toBe('product');
        expect(result.schemas[0].fields).toHaveProperty('price');
        expect(result.schemas[0].fields).toHaveProperty('title');
    });
    it('classifies a search/listing page', () => {
        const result = discoverPage({
            url: 'https://www.amazon.com/s?q=headphones',
            title: 'Amazon Search: headphones',
            elements: [
                { tag: 'input', attributes: { type: 'search', name: 'q' }, selector: 'input[name="q"]', ariaLabel: 'Search' },
            ],
            repeatedGroups: [
                {
                    containerSelector: 'div.search-results',
                    itemSelector: 'div.result-card',
                    count: 20,
                    sampleFields: { title: 'h3', price: '.price' },
                },
            ],
        });
        expect(result.pageType).toBe('search');
        expect(result.confidence).toBeGreaterThanOrEqual(0.3);
        expect(result.schemas.length).toBeGreaterThanOrEqual(1);
        expect(result.schemas[0].name).toBe('search_results');
        expect(result.schemas[0].fields).toHaveProperty('items');
    });
    it('classifies an article page', () => {
        const result = discoverPage({
            url: 'https://blog.example.com/my-article',
            title: 'How to Build a Browser OS',
            meta: { 'og:type': 'article' },
            jsonLd: [{ '@type': 'Article', headline: 'How to Build a Browser OS' }],
            elements: [
                { tag: 'article', selector: 'article.post', text: 'Long article body...' },
                { tag: 'h1', text: 'How to Build a Browser OS', selector: 'h1.article-title' },
                { tag: 'span', classes: ['author'], text: 'John Doe', selector: 'span.author', attributes: { itemprop: 'author' } },
                { tag: 'time', selector: 'time.published', attributes: { itemprop: 'datePublished' } },
            ],
        });
        expect(result.pageType).toBe('article');
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
        expect(result.schemas[0].name).toBe('article');
        expect(result.schemas[0].fields).toHaveProperty('body');
        expect(result.schemas[0].fields).toHaveProperty('author');
    });
    it('classifies a feed/social page', () => {
        const result = discoverPage({
            url: 'https://www.reddit.com/r/programming',
            meta: { 'og:site_name': 'Reddit' },
            repeatedGroups: [
                {
                    containerSelector: 'div.feed',
                    itemSelector: 'div.post',
                    count: 25,
                },
            ],
        });
        expect(result.pageType).toBe('feed');
        expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });
    it('classifies a table/data page', () => {
        const result = discoverPage({
            url: 'https://stats.example.com/data',
            tables: [
                {
                    selector: 'table#main',
                    headers: ['Name', 'Age', 'Score'],
                    rowCount: 50,
                },
            ],
        });
        expect(result.pageType).toBe('table');
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
        expect(result.schemas[0].name).toBe('table_data');
        expect(result.schemas[0].fields).toHaveProperty('table');
        expect(result.schemas[0].fields).toHaveProperty('name');
    });
    it('classifies a form page', () => {
        const result = discoverPage({
            url: 'https://example.com/signup',
            forms: [
                {
                    selector: 'form#signup',
                    action: '/api/signup',
                    method: 'POST',
                    inputs: [
                        { name: 'email', type: 'email', selector: 'input[name="email"]', label: 'Email' },
                        { name: 'password', type: 'password', selector: 'input[name="password"]', label: 'Password' },
                        { name: 'name', type: 'text', selector: 'input[name="name"]', label: 'Full Name' },
                    ],
                },
            ],
        });
        expect(result.pageType).toBe('form');
        expect(result.confidence).toBeGreaterThanOrEqual(0.3);
        expect(result.schemas[0].name).toBe('form');
        expect(result.schemas[0].fields).toHaveProperty('email');
        expect(result.schemas[0].fields).toHaveProperty('password');
    });
    it('classifies a chat interface', () => {
        const result = discoverPage({
            url: 'https://chatgpt.com/',
            elements: [
                { tag: 'textarea', selector: '#prompt-textarea' },
                { tag: 'button', text: 'Send', ariaLabel: 'Send message', selector: 'button[aria-label="Send message"]' },
            ],
            repeatedGroups: [
                {
                    containerSelector: 'div.chat',
                    itemSelector: 'div.message',
                    count: 5,
                },
            ],
        });
        expect(result.pageType).toBe('chat');
        expect(result.confidence).toBeGreaterThanOrEqual(0.3);
        expect(result.schemas[0].fields).toHaveProperty('input');
        expect(result.schemas[0].fields).toHaveProperty('sendButton');
    });
    it('returns unknown for empty snapshot', () => {
        const result = discoverPage({});
        expect(result.pageType).toBe('unknown');
        expect(result.confidence).toBe(0);
        expect(result.schemas).toEqual([]);
    });
    it('extracts metadata from meta tags', () => {
        const result = discoverPage({
            url: 'https://example.com',
            meta: { 'og:title': 'My Page', 'og:description': 'A cool page' },
            elements: [],
        });
        expect(result.metadata).toBeDefined();
        expect(result.metadata['og:title']).toBe('My Page');
    });
    it('returns confidence capped at 0.99', () => {
        // Product page with all signals maxed
        const result = discoverPage({
            url: 'https://shop.example.com/product/1',
            meta: { 'og:type': 'product' },
            jsonLd: [{ '@type': 'Product' }],
            elements: [
                { tag: 'h1', text: 'Premium Widget', selector: 'h1', attributes: { itemprop: 'name' } },
                { tag: 'span', text: '$999.99', selector: '.price' },
                { tag: 'span', ariaLabel: '5 stars rating', selector: '.rating', classes: ['rating'] },
                { tag: 'img', id: 'product-img', selector: '#product-img', classes: ['product-main'] },
            ],
        });
        expect(result.confidence).toBeLessThanOrEqual(0.99);
    });
});
//# sourceMappingURL=discover-engine.test.js.map