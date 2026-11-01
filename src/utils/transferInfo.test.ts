import { describe, expect, it } from 'vitest';
import { BankAccount } from '../types';
import { buildTransferInfo } from './transferInfo';

const account = (id: string, bankCode: string, isDefault = false): BankAccount => ({
  id, accountName: id, accountNumber: '0011223344', bankCode, bankName: 'Vietcombank', holder: 'NGUYEN VAN A', isDefault, createdAt: '',
});

describe('buildTransferInfo', () => {
  it('returns undefined when the store has no bank account or the bank is unknown', () => {
    expect(buildTransferInfo([])).toBeUndefined();
    expect(buildTransferInfo([account('a', 'NOT-A-BANK')])).toBeUndefined();
  });
  it('uses the default account and encodes the amount when given', () => {
    const info = buildTransferInfo([account('a', 'VCB'), account('b', 'VCB', true)], { amount: 159000, memo: 'Ban 1' })!;
    expect(info.amount).toBe(159000);
    expect(info.accountNumber).toBe('0011223344');
    expect(info.payload).toContain('5406159000');
  });
  it('builds a QR without an amount for a paid receipt', () => {
    const info = buildTransferInfo([account('a', 'VCB')])!;
    expect(info.amount).toBeUndefined();
    expect(info.payload).not.toContain('5406');
  });
});
