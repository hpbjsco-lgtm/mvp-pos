/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { CHILD_TABLE_PARENTS } from '../../../src/db/deviceSchema';
import { NUMBERED_TABLE_COLUMNS } from '../../../src/sync/numberedTables';
import { CHILD_TABLES, NUMBERED_TABLES } from './syncPolicy.mjs';

/** The device change tracking and the server push must agree on which tables are children of which parent. */
describe('child tables of the device and of the server', () => {
  it('are the same', () => {
    const fromServer = {};
    for (const [parentTable, children] of Object.entries(CHILD_TABLES)) {
      for (const child of children) fromServer[child.table] = { parentTable, foreignKey: child.foreignKey };
    }
    expect(CHILD_TABLE_PARENTS).toEqual(fromServer);
  });

  it('number the same documents in the same columns', () => {
    const fromServer = Object.fromEntries(Object.entries(NUMBERED_TABLES).map(([table, spec]) => [table, { numberColumn: spec.numberColumn, tempColumn: spec.tempColumn }]));
    expect(NUMBERED_TABLE_COLUMNS).toEqual(fromServer);
  });
});
