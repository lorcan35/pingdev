import { describe, it, expect } from 'vitest';

describe('aliexpress PingApp', () => {
  describe('searchProducts', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['searchProducts']).toBeDefined();
    });
  });

  describe('navigateCategory', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['navigateCategory']).toBeDefined();
    });
  });

  describe('viewProductDetails', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['viewProductDetails']).toBeDefined();
    });
  });

  describe('openCart', () => {
    it('should be defined', async () => {
      const { actions } = await import('../src/actions/index.js');
      expect(actions['openCart']).toBeDefined();
    });
  });

});
