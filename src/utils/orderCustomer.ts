/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Customer, Order } from '../types';

/**
 * Name of the customer of an order. Orders saved before the name was stored with them only have the
 * customer id, so the name is looked up in the customer list.
 *
 * @param order Order to read.
 * @param customers Customers of the store.
 * @returns The customer's name, or an empty string when the order has no customer.
 */
export function orderCustomerName(order: Pick<Order, 'customerName' | 'customerId'>, customers: Pick<Customer, 'id' | 'name'>[]): string {
  if (order.customerName) return order.customerName;
  return order.customerId ? customers.find(customer => customer.id === order.customerId)?.name ?? '' : '';
}
