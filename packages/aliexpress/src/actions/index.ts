import type { ActionHandler } from '@pingdev/core';

import { searchProducts } from './search-products.js';
import { navigateCategory } from './navigate-category.js';
import { viewProductDetails } from './view-product-details.js';
import { openCart } from './open-cart.js';

export const actions: Record<string, ActionHandler> = {
  searchProducts,
  navigateCategory,
  viewProductDetails,
  openCart,
};
