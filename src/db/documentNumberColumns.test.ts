/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from './collections';

/** The temporary document code must reach the database and come back, or an offline document cannot be numbered later. */
describe('temporary document codes in the collections', () => {
  it('writes and reads the temporary order number', () => {
    const spec = COLLECTIONS.orders;
    const row = spec.toRow({ id: 'o1', orderNumber: 'TAM-AAAA-1', tempOrderNumber: 'TAM-AAAA-1', items: [] }, 'S1');
    expect(row).toMatchObject({ order_number: 'TAM-AAAA-1', temp_order_number: 'TAM-AAAA-1' });
    expect(spec.fromRow({ ...row, id: 'o1' })).toMatchObject({ orderNumber: 'TAM-AAAA-1', tempOrderNumber: 'TAM-AAAA-1' });
  });

  it('keeps the temporary order number empty for an order numbered by the server', () => {
    const spec = COLLECTIONS.orders;
    const row = spec.toRow({ id: 'o1', orderNumber: 'HD00001', items: [] }, 'S1');
    expect(row.temp_order_number).toBe('');
    expect(spec.fromRow({ ...row, id: 'o1' }).tempOrderNumber).toBeUndefined();
  });

  it('writes and reads the temporary code of stock vouchers and cash vouchers', () => {
    const stock = COLLECTIONS.transactions;
    const cash = COLLECTIONS.cashVouchers;
    expect(cash.toRow({ id: 'v1', code: 'TAM-AAAA-2', tempCode: 'TAM-AAAA-2', type: 'receipt' }, 'S1')).toMatchObject({ code: 'TAM-AAAA-2', temp_code: 'TAM-AAAA-2' });
    expect(cash.fromRow({ id: 'v1', code: 'PT0001', temp_code: 'TAM-AAAA-2', voucher_type: 'receipt' }).tempCode).toBe('TAM-AAAA-2');
    expect(stock.toRow({ id: 't1', transactionNumber: 'TAM-AAAA-3', tempCode: 'TAM-AAAA-3', type: 'import' }, 'S1')).toMatchObject({ transaction_number: 'TAM-AAAA-3', temp_code: 'TAM-AAAA-3' });
    expect(stock.fromRow({ id: 't1', transaction_number: 'PNK0001', temp_code: 'TAM-AAAA-3', type: 'import' }).tempCode).toBe('TAM-AAAA-3');
  });
});
