/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../types';

/** A line of an order as far as cost is concerned: the dish and the toppings chosen with each portion. */
export interface CostedLine {
  productId: string;
  quantity: number;
  toppings?: { productId: string; quantity: number }[];
}

/**
 * Cost of one portion of a line: the cost set up for the dish plus the cost set up for each topping on it. A dish
 * made from a recipe has its cost worked out from the recipe when it is saved, so this is the cost of its ingredients.
 * The size does not change the cost.
 *
 * @param line The line.
 * @param products Dishes and toppings with their cost.
 * @returns Cost of one portion; an item that is not found counts as 0.
 */
export function lineUnitCost(line: Pick<CostedLine, 'productId' | 'toppings'>, products: Pick<Product, 'id' | 'cost'>[]): number {
  const costOf = (productId: string) => products.find(product => product.id === productId)?.cost || 0;
  const toppings = (line.toppings || []).reduce((sum, topping) => sum + costOf(topping.productId) * topping.quantity, 0);
  return costOf(line.productId) + toppings;
}

/**
 * Total cost of the lines of an order.
 *
 * @param lines Lines of the order.
 * @param products Dishes and toppings with their cost.
 * @returns Sum of portion cost x number of portions.
 */
export function orderCost(lines: CostedLine[], products: Pick<Product, 'id' | 'cost'>[]): number {
  return lines.reduce((sum, line) => sum + lineUnitCost(line, products) * line.quantity, 0);
}
