import { describe, expect, it } from 'vitest';
import { orderCustomerName } from './orderCustomer';

const customers = [{ id: 'c1', name: 'Nguyễn An' }];

describe('orderCustomerName', () => {
  it('uses the name stored with the order', () => {
    expect(orderCustomerName({ customerId: 'c1', customerName: 'Tên cũ' }, customers)).toBe('Tên cũ');
  });
  it('looks the name up by id for orders saved without it', () => {
    expect(orderCustomerName({ customerId: 'c1' }, customers)).toBe('Nguyễn An');
  });
  it('is empty without a customer or when the customer no longer exists', () => {
    expect(orderCustomerName({}, customers)).toBe('');
    expect(orderCustomerName({ customerId: 'gone' }, customers)).toBe('');
  });
});
