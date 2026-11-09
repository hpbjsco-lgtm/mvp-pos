/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createSqlJsTestDriver } from '../sync/sqlJsTestDriver';
import { MIGRATIONS } from './schema';

describe('migration 18: automatic stock deduction of a store', () => {
  it('is on for every store, existing and new', async () => {
    const driver = await createSqlJsTestDriver();
    for (const migration of MIGRATIONS.filter(m => m.version < 18)) for (const statement of migration.statements) await driver.exec(statement);
    await driver.run(`INSERT INTO stores (id, name, created_at, updated_at) VALUES ('old', 'Old', 'x', 'x')`);
    for (const statement of MIGRATIONS.find(m => m.version === 18)!.statements) await driver.exec(statement);
    await driver.run(`INSERT INTO stores (id, name, created_at, updated_at) VALUES ('new', 'New', 'x', 'x')`);
    const rows = await driver.all<{ id: string; auto_stock_deduction: number }>('SELECT id, auto_stock_deduction FROM stores ORDER BY id');
    expect(rows).toEqual([{ id: 'new', auto_stock_deduction: 1 }, { id: 'old', auto_stock_deduction: 1 }]);
  });
});
