/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  adminCreateUser, adminDeleteUser, adminListStores, adminListUsers, adminSetPassword, adminUpdateUser,
  type AdminStore, type AdminUser,
} from '../db/admin';
import type { StoreRole } from '../db/auth';
import { ROLE_LABELS } from '../utils/permissions';
import { AdminModal, ErrorBox, Field } from './SysAdminShared';
import PageCard from './ui/PageCard';
import ListToolbar from './ui/ListToolbar';
import DataTable, { RowActions, RoundThumb } from './ui/DataTable';

interface Props {
  triggerBeep: (success: boolean) => void;
}

interface UserForm {
  storeId: string;
  name: string;
  username: string;
  email: string;
  password: string;
  role: StoreRole;
  hourlyRate: number;
  isActive: boolean;
}

const ROLES: StoreRole[] = ['owner', 'manager', 'staff', 'kitchen'];

const roleBadge = (role: string) =>
  role === 'owner' ? 'm3-badge-warning' : role === 'manager' ? 'm3-badge-success'
    : role === 'kitchen' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-primary-container text-on-primary-container';

export default function SysAdminAccounts({ triggerBeep }: Props) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storeFilter, setStoreFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [pwTarget, setPwTarget] = useState<AdminUser | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwError, setPwError] = useState('');
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, s] = await Promise.all([adminListUsers(), adminListStores()]);
      setUsers(u);
      setStores(s);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Không tải được danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u =>
      (storeFilter === 'all' || u.storeId === storeFilter) &&
      (!q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
  }, [users, storeFilter, search]);

  const openNew = () => {
    if (stores.length === 0) { setError('Hãy tạo ít nhất một cửa hàng trước khi thêm tài khoản.'); return; }
    setForm({
      storeId: storeFilter !== 'all' ? storeFilter : stores[0].id, name: '', username: '', email: '', password: '',
      role: 'staff', hourlyRate: 25000, isActive: true,
    });
    setFormError(''); setEditing('new'); triggerBeep(true);
  };
  const openEdit = (u: AdminUser) => {
    setForm({
      storeId: u.storeId || '', name: u.name, username: u.username, email: u.email, password: '',
      role: u.role as StoreRole, hourlyRate: u.hourlyRate, isActive: u.isActive,
    });
    setFormError(''); setEditing(u); triggerBeep(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !editing) return;
    setSaving(true);
    setFormError('');
    try {
      const base = {
        storeId: form.storeId, username: form.username, email: form.email, name: form.name,
        role: form.role, hourlyRate: Number(form.hourlyRate) || 0,
      };
      if (editing === 'new') await adminCreateUser({ ...base, password: form.password });
      else await adminUpdateUser(editing.uid, { ...base, isActive: form.isActive });
      setEditing(null);
      triggerBeep(true);
      await load();
    } catch (err: any) {
      setFormError(err?.message || 'Không lưu được.');
      triggerBeep(false);
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!pwTarget) return;
    try {
      await adminSetPassword(pwTarget.uid, pwValue);
      setPwTarget(null);
      setPwValue('');
      triggerBeep(true);
    } catch (err: any) {
      setPwError(err?.message || 'Không đổi được mật khẩu.');
      triggerBeep(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await adminDeleteUser(deleting.uid);
    setDeleting(null);
    triggerBeep(true);
    await load();
  };

  const formStoreType = stores.find(s => s.id === form?.storeId)?.storeType;

  return (
    <div className="space-y-4">
      <PageCard title={`Tài khoản (${users.length})`}>
        <ErrorBox message={error} />

        <ListToolbar
          filters={
            <select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} className="m3-input !min-h-11 sm:max-w-xs" aria-label="Lọc theo cửa hàng">
              <option value="all">Tất cả cửa hàng</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          }
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Tìm theo tên, tài khoản, email..."
          addLabel="Thêm tài khoản"
          onAdd={openNew}
        />

        {loading ? (
          <p className="py-12 text-center text-on-surface-variant font-semibold">Đang tải...</p>
        ) : (
          <DataTable<AdminUser>
            rows={visible}
            rowKey={u => u.uid}
            emptyMessage="Không có tài khoản phù hợp"
            columns={[
              { key: 'name', header: 'Tên', render: u => (
                <div className={`flex items-center gap-3 ${u.isActive ? '' : 'opacity-60'}`}>
                  <RoundThumb name={u.name} />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{u.name}</p>
                    <p className="text-sm text-on-surface-variant truncate">@{u.username}</p>
                  </div>
                </div>
              ) },
              { key: 'email', header: 'Email', render: u => u.email },
              { key: 'store', header: 'Cửa hàng', render: u => u.storeName },
              { key: 'role', header: 'Vai trò', render: u => (
                <div className="flex flex-wrap gap-1">
                  <span className={`m3-badge ${roleBadge(u.role)}`}>{ROLE_LABELS[u.role as StoreRole] ?? u.role}</span>
                  {!u.isActive && <span className="m3-badge m3-badge-error">Đã khóa</span>}
                </div>
              ) },
            ]}
            renderActions={u => (
              <RowActions onEdit={() => openEdit(u)} onDelete={() => setDeleting(u)} editLabel="Sửa tài khoản" deleteLabel="Xóa tài khoản">
                <button type="button" onClick={() => { setPwTarget(u); setPwValue(''); setPwError(''); }} title="Đổi mật khẩu" aria-label="Đổi mật khẩu" className="m3-icon-btn !w-9 !h-9 text-primary hover:bg-primary-container">
                  <KeyRound className="w-4.5 h-4.5" />
                </button>
              </RowActions>
            )}
          />
        )}
      </PageCard>

      {editing && form && (
        <AdminModal
          title={editing === 'new' ? 'Thêm tài khoản' : 'Sửa tài khoản'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className="m3-btn-outlined flex-1 !min-h-12">Hủy</button>
              <button type="submit" form="account-form" disabled={saving} className="m3-btn-filled flex-1 !min-h-12 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </>
          }
        >
          <form id="account-form" onSubmit={save} className="space-y-4">
            <ErrorBox message={formError} />
            <Field label="Cửa hàng">
              <select value={form.storeId} onChange={e => setForm({ ...form, storeId: e.target.value })} className="m3-input" required>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Họ và tên"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="m3-input" required /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tên tài khoản"><input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} autoCapitalize="none" autoCorrect="off" className="m3-input" required /></Field>
              <Field label="Email"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="m3-input" required /></Field>
            </div>
            {editing === 'new' && (
              <Field label="Mật khẩu (tối thiểu 6 ký tự)"><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="m3-input" required /></Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Vai trò">
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as StoreRole })} className="m3-input">
                  {ROLES.filter(r => r !== 'kitchen' || formStoreType === 'fnb' || form.role === 'kitchen').map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </Field>
              <Field label="Lương mỗi giờ (đ/giờ)"><input type="number" value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: Math.max(0, parseInt(e.target.value) || 0) })} className="m3-input font-mono" /></Field>
            </div>
            {editing !== 'new' && (
              <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-5 h-5" />
                <span className="text-base font-semibold text-on-surface">Tài khoản đang hoạt động (bỏ chọn để khóa)</span>
              </label>
            )}
          </form>
        </AdminModal>
      )}

      {pwTarget && (
        <AdminModal
          title={`Đặt mật khẩu - ${pwTarget.name}`}
          onClose={() => setPwTarget(null)}
          footer={
            <>
              <button onClick={() => setPwTarget(null)} className="m3-btn-outlined flex-1 !min-h-12">Hủy</button>
              <button onClick={savePassword} className="m3-btn-filled flex-1 !min-h-12">Đặt mật khẩu</button>
            </>
          }
        >
          <ErrorBox message={pwError} />
          <Field label="Mật khẩu mới (tối thiểu 6 ký tự)">
            <input type="password" value={pwValue} onChange={e => setPwValue(e.target.value)} className="m3-input" autoFocus />
          </Field>
        </AdminModal>
      )}

      {deleting && (
        <AdminModal
          title="Xóa tài khoản"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button onClick={() => setDeleting(null)} className="m3-btn-outlined flex-1 !min-h-12">Hủy</button>
              <button onClick={confirmDelete} className="m3-btn-danger flex-1 !min-h-12">Xóa tài khoản</button>
            </>
          }
        >
          <p className="text-base text-on-surface">
            Xóa tài khoản <strong>{deleting.name}</strong> (@{deleting.username}) của cửa hàng {deleting.storeName}? Tài khoản này sẽ không đăng nhập được nữa.
          </p>
        </AdminModal>
      )}
    </div>
  );
}
