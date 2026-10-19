import { describe, it, expect } from 'vitest';
import { canAccess, defaultScreen, normalizeRole, isAdminRole, ROLE_SCREENS } from './permissions';

describe('permissions', () => {
  it('owner and manager can open every screen', () => {
    for (const s of ROLE_SCREENS.owner) {
      expect(canAccess('owner', s)).toBe(true);
      expect(canAccess('manager', s)).toBe(true);
    }
    expect(canAccess('manager', 'reports')).toBe(true);
    expect(canAccess('manager', 'employees')).toBe(true);
  });
  it('staff (waiter / cashier) only reaches the POS screen', () => {
    expect(canAccess('staff', 'pos')).toBe(true);
    for (const s of ['reports', 'kitchen', 'menu', 'tables', 'orders', 'shifts', 'inventory', 'customers', 'employees', 'suppliers', 'account']) {
      expect(canAccess('staff', s)).toBe(false);
    }
  });
  it('kitchen staff only reaches the kitchen screen', () => {
    expect(canAccess('kitchen', 'kitchen')).toBe(true);
    expect(canAccess('kitchen', 'pos')).toBe(false);
    expect(canAccess('kitchen', 'reports')).toBe(false);
  });
  it('sysadmin only reaches the stores and accounts screens', () => {
    expect(canAccess('sysadmin', 'stores')).toBe(true);
    expect(canAccess('sysadmin', 'accounts')).toBe(true);
    for (const s of ['pos', 'reports', 'kitchen', 'menu', 'employees', 'account']) {
      expect(canAccess('sysadmin', s)).toBe(false);
    }
    expect(defaultScreen('sysadmin')).toBe('stores');
  });
  it('store roles cannot open the sysadmin screens', () => {
    for (const r of ['owner', 'manager', 'staff', 'kitchen']) {
      expect(canAccess(r, 'stores')).toBe(false);
      expect(canAccess(r, 'accounts')).toBe(false);
    }
  });
  it('unknown roles get nothing', () => {
    expect(normalizeRole('root')).toBeNull();
    expect(canAccess('root', 'pos')).toBe(false);
    expect(canAccess(undefined, 'pos')).toBe(false);
  });
  it('default landing screen per role', () => {
    expect(defaultScreen('owner')).toBe('reports');
    expect(defaultScreen('manager')).toBe('reports');
    expect(defaultScreen('staff')).toBe('pos');
    expect(defaultScreen('kitchen')).toBe('kitchen');
  });
  it('admin role helper', () => {
    expect(isAdminRole('owner')).toBe(true);
    expect(isAdminRole('manager')).toBe(true);
    expect(isAdminRole('staff')).toBe(false);
    expect(isAdminRole('kitchen')).toBe(false);
  });
});
