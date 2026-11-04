import { describe, expect, it } from 'vitest';
import { planReload } from './liveRefresh';

describe('planReload', () => {
  it('maps tables to the collections and carts that show them', () => {
    expect(planReload(['kitchen_items'])).toEqual({ keys: ['kitchenItems'], carts: false });
    expect(planReload(['dining_tables', 'carts', 'cart_items'])).toEqual({ keys: ['tables'], carts: true });
  });
  it('reloads the parent collection when only its child table changed', () => {
    expect(planReload(['order_items']).keys).toEqual(['orders']);
    expect(planReload(['inventory_transaction_items']).keys).toEqual(['transactions', 'ingredientTransactions']);
  });
  it('ignores tables the app does not hold in memory', () => {
    expect(planReload(['activity_logs', 'stores', 'sync_log'])).toEqual({ keys: [], carts: false });
  });
});
