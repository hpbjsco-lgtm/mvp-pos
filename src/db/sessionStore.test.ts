import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSessionUid, getSessionUid, setSessionUid } from './sessionStore';

describe('session store', () => {
  let values: Record<string, string>;
  beforeEach(() => {
    values = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => { values[key] = value; },
      removeItem: (key: string) => { delete values[key]; },
    };
  });
  afterEach(() => { delete (globalThis as any).localStorage; });

  it('is empty until someone signs in', () => expect(getSessionUid()).toBe(''));
  it('remembers and forgets the signed-in user', () => {
    setSessionUid('user-1');
    expect(getSessionUid()).toBe('user-1');
    clearSessionUid();
    expect(getSessionUid()).toBe('');
  });
  it('does not touch the database: two browsers keep separate users', () => {
    setSessionUid('user-1');
    const other: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => other[key] ?? null, setItem: (key: string, value: string) => { other[key] = value; }, removeItem: () => undefined,
    };
    expect(getSessionUid()).toBe('');
  });
});
