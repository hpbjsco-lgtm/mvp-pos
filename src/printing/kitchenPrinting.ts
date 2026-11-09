/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildKitchenTicketDocument, KitchenTicketInput } from './kitchenTicketDocument';
import { getPrinterSettings } from './printerSettings';
import { canPrintDirectly, printReceipt } from './receiptPrinting';

/**
 * Prints the kitchen ticket when this device is set to do so (a printer is chosen and "print kitchen
 * tickets" is on in the printer settings); otherwise it does nothing. The ticket goes to the kitchen printer
 * when one is chosen and to the receipt printer otherwise.
 *
 * @param input Table, sender, items and time of the ticket.
 * @returns True when a ticket was printed, false when printing is off on this device.
 * @throws Error with a readable message when printing is on but the printer fails.
 */
export async function printKitchenTicketIfEnabled(input: KitchenTicketInput): Promise<boolean> {
  if (!getPrinterSettings().printKitchenTicket || !canPrintDirectly('kitchen')) return false;
  await printReceipt(buildKitchenTicketDocument(input), 'kitchen');
  return true;
}
