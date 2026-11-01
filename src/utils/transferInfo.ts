/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BankAccount } from '../types';
import { findBank } from './banks';
import { buildVietQRPayload } from './vietqr';

/** Bank transfer details with the QR code content, as printed on a receipt. */
export interface TransferInfo {
  /** Content of the VietQR code. */
  payload: string;
  bankName: string;
  accountNumber: string;
  holder: string;
  /** Amount encoded in the QR code; absent when the QR code only identifies the account. */
  amount?: number;
}

/**
 * Builds the transfer details of the default bank account (or the first one when none is default).
 *
 * @param accounts Bank accounts of the store.
 * @param options `amount` fixes the amount in the QR code (omit it for a code that only holds the account);
 *   `memo` is the transfer note.
 * @returns The details, or undefined when the store has no bank account or its bank is not in the bank list.
 */
export function buildTransferInfo(accounts: BankAccount[], options: { amount?: number; memo?: string } = {}): TransferInfo | undefined {
  const account = accounts.find(item => item.isDefault) || accounts[0];
  const bank = account ? findBank(account.bankCode) : undefined;
  if (!account || !bank) return undefined;
  return {
    payload: buildVietQRPayload({ bin: bank.bin, accountNumber: account.accountNumber, amount: options.amount ?? 0, memo: options.memo }),
    bankName: account.bankName,
    accountNumber: account.accountNumber,
    holder: account.holder,
    amount: options.amount,
  };
}
