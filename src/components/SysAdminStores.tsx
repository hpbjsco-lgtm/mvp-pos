/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Coffee, Lock, LockOpen, MapPin, Pencil, Phone, Plus, ShoppingBag, Store, Trash2, Users } from 'lucide-react';
import {
  adminCreateStore, adminCreateUser, adminDeleteStore, adminListStores, adminUpdateStore, wipeAllData,
  type AdminStore, type StoreInput,
} from '../db/admin';
import { AdminModal, ErrorBox, Field } from './SysAdminShared';

interface Props {
  triggerBeep: (success: boolean) => void;
  /** Gọi sau khi xóa toàn bộ dữ liệu (App sẽ đăng xuất và nạp lại). */
  onWiped: () => void;
}

const emptyForm: StoreInput = { name: '', storeType: 'fnb', phone: '', address: '', status: 'active' };

export default function SysAdminStores({ triggerBeep, onWiped }: Props) {
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<AdminStore | 'new' | null>(null);
  const [form, setForm] = useState<StoreInput>(emptyForm);
  const [withSample, setWithSample] = useState(true);
  const [withOwner, setWithOwner] = useState(true);
  const [owner, setOwner] = useState({ name: '', username: '', email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<AdminStore | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');

  const load = useCallback(async () => {
    try {
      setStores(await adminListStores());
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Không tải được danh sách cửa hàng.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openNew = () => {
    setForm(emptyForm); setWithSample(true); setWithOwner(true);
    setOwner({ name: '', username: '', email: '', password: '' });
    setFormError(''); setEditing('new'); triggerBeep(true);
  };
  const openEdit = (s: AdminStore) => {
    setForm({ name: s.name, storeType: s.storeType, phone: s.phone, address: s.address, status: s.status === 'active' ? 'active' : 'rejected' });
    setFormError(''); setEditing(s); triggerBeep(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      if (editing === 'new') {
        if (withOwner && owner.password.length < 6) throw new Error('Mật khẩu chủ cửa hàng cần tối thiểu 6 ký tự.');
        const store = await adminCreateStore({ ...form, withSampleData: withSample });
        if (withOwner) {
          await adminCreateUser({
            storeId: store.id, username: owner.username, email: owner.email, password: owner.password,
            name: owner.name, role: 'owner', hourlyRate: 0,
          });
        }
      } else if (editing) {
        await adminUpdateStore(editing.id, form);
      }
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

  const toggleLock = async (s: AdminStore) => {
    await adminUpdateStore(s.id, {
      name: s.name, storeType: s.storeType, phone: s.phone, address: s.address,
      status: s.status === 'active' ? 'rejected' : 'active',
    });
    triggerBeep(true);
    await load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await adminDeleteStore(deleting.id);
    setDeleting(null);
    triggerBeep(true);
    await load();
  };

  const doWipe = async () => {
    await wipeAllData();
    setWipeOpen(false);
    onWiped();
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Store className="w-6 h-6 text-primary" />
        <div className="flex-1">
          <h2 className="text-xl font-bold text-on-surface">Cửa hàng</h2>
          <p className="text-sm text-on-surface-variant">{stores.length} cửa hàng trên thiết bị này</p>
        </div>
        <button onClick={openNew} className="m3-btn-filled !min-h-12"><Plus className="w-5 h-5" /> Thêm cửa hàng</button>
      </div>

      <ErrorBox message={error} />

      {loading ? (
        <p className="py-12 text-center text-on-surface-variant font-semibold">Đang tải...</p>
      ) : stores.length === 0 ? (
        <div className="m3-card py-14 text-center text-on-surface-variant">
          <Store className="w-10 h-10 mx-auto mb-2 text-outline-variant" />
          <p className="text-base font-bold">Chưa có cửa hàng nào</p>
          <p className="text-sm">Nhấn "Thêm cửa hàng" để tạo cửa hàng đầu tiên.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {stores.map(s => (
            <div key={s.id} className="m3-card p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                  {s.storeType === 'fnb' ? <Coffee className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-on-surface truncate">{s.name}</h3>
                  <p className="text-sm text-on-surface-variant font-mono truncate">{s.id}</p>
                </div>
                <span className={`m3-badge ${s.status === 'active' ? 'm3-badge-success' : 'm3-badge-error'}`}>
                  {s.status === 'active' ? 'Hoạt động' : 'Tạm khóa'}
                </span>
              </div>

              <div className="space-y-1 text-sm text-on-surface-variant">
                <p className="flex items-center gap-2"><span className="m3-badge m3-badge-neutral">{s.storeType === 'fnb' ? 'F&B' : 'Bán lẻ'}</span><Users className="w-4 h-4" /> {s.userCount} tài khoản</p>
                {s.phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4" /> {s.phone}</p>}
                {s.address && <p className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {s.address}</p>}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button onClick={() => openEdit(s)} className="m3-btn-tonal !min-h-11 text-sm"><Pencil className="w-4 h-4" /> Sửa</button>
                <button onClick={() => toggleLock(s)} className="m3-btn-tonal !min-h-11 text-sm">
                  {s.status === 'active' ? <><Lock className="w-4 h-4" /> Khóa</> : <><LockOpen className="w-4 h-4" /> Mở khóa</>}
                </button>
                <button onClick={() => setDeleting(s)} className="m3-btn-danger !min-h-11 text-sm"><Trash2 className="w-4 h-4" /> Xóa</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Vùng nguy hiểm */}
      <div className="m3-card p-4 border-error/40 space-y-2">
        <h3 className="text-base font-bold text-error flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Vùng nguy hiểm</h3>
        <p className="text-sm text-on-surface-variant">Xóa toàn bộ cửa hàng, tài khoản, đơn hàng, kho... trên thiết bị này để bắt đầu lại từ đầu. Không thể hoàn tác.</p>
        <button onClick={() => { setWipeText(''); setWipeOpen(true); }} className="m3-btn-danger !min-h-11">Xóa toàn bộ dữ liệu</button>
      </div>

      {editing && (
        <AdminModal
          title={editing === 'new' ? 'Thêm cửa hàng' : 'Sửa cửa hàng'}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button type="button" onClick={() => setEditing(null)} className="m3-btn-outlined flex-1 !min-h-12">Hủy</button>
              <button type="submit" form="store-form" disabled={saving} className="m3-btn-filled flex-1 !min-h-12 disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </>
          }
        >
          <form id="store-form" onSubmit={save} className="space-y-4">
            <ErrorBox message={formError} />
            <Field label="Tên cửa hàng"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="m3-input" required /></Field>
            <Field label="Mô hình">
              <select value={form.storeType} onChange={e => setForm({ ...form, storeType: e.target.value as 'fnb' | 'retail' })} className="m3-input">
                <option value="fnb">F&B (quán cà phê / nhà hàng)</option>
                <option value="retail">Bán lẻ (siêu thị / tạp hóa)</option>
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Số điện thoại"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="m3-input" /></Field>
              <Field label="Trạng thái">
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as 'active' | 'rejected' })} className="m3-input">
                  <option value="active">Hoạt động</option>
                  <option value="rejected">Tạm khóa (không đăng nhập được)</option>
                </select>
              </Field>
            </div>
            <Field label="Địa chỉ"><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="m3-input" /></Field>

            {editing === 'new' && (
              <>
                <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                  <input type="checkbox" checked={withSample} onChange={e => setWithSample(e.target.checked)} className="w-5 h-5" />
                  <span className="text-base font-semibold text-on-surface">Tạo kèm dữ liệu mẫu (thực đơn, bàn, kho...)</span>
                </label>
                <label className="flex items-center gap-3 min-h-11 cursor-pointer">
                  <input type="checkbox" checked={withOwner} onChange={e => setWithOwner(e.target.checked)} className="w-5 h-5" />
                  <span className="text-base font-semibold text-on-surface">Tạo luôn tài khoản chủ cửa hàng</span>
                </label>
                {withOwner && (
                  <div className="space-y-3 p-3 bg-surface-container rounded-2xl">
                    <Field label="Họ tên chủ cửa hàng"><input value={owner.name} onChange={e => setOwner({ ...owner, name: e.target.value })} className="m3-input" required /></Field>
                    <Field label="Tên tài khoản"><input value={owner.username} onChange={e => setOwner({ ...owner, username: e.target.value })} autoCapitalize="none" className="m3-input" required /></Field>
                    <Field label="Email"><input type="email" value={owner.email} onChange={e => setOwner({ ...owner, email: e.target.value })} className="m3-input" required /></Field>
                    <Field label="Mật khẩu (tối thiểu 6 ký tự)"><input type="password" value={owner.password} onChange={e => setOwner({ ...owner, password: e.target.value })} className="m3-input" required /></Field>
                  </div>
                )}
              </>
            )}
          </form>
        </AdminModal>
      )}

      {deleting && (
        <AdminModal
          title="Xóa cửa hàng"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button onClick={() => setDeleting(null)} className="m3-btn-outlined flex-1 !min-h-12">Hủy</button>
              <button onClick={confirmDelete} className="m3-btn-danger flex-1 !min-h-12">Xóa cửa hàng</button>
            </>
          }
        >
          <p className="text-base text-on-surface">
            Xóa cửa hàng <strong>{deleting.name}</strong> cùng <strong>{deleting.userCount}</strong> tài khoản của cửa hàng? Các tài khoản này sẽ không đăng nhập được nữa.
          </p>
        </AdminModal>
      )}

      {wipeOpen && (
        <AdminModal
          title="Xóa toàn bộ dữ liệu"
          onClose={() => setWipeOpen(false)}
          footer={
            <>
              <button onClick={() => setWipeOpen(false)} className="m3-btn-outlined flex-1 !min-h-12">Hủy</button>
              <button onClick={doWipe} disabled={wipeText !== 'XOA HET'} className="m3-btn-danger flex-1 !min-h-12 disabled:opacity-40">Xóa tất cả</button>
            </>
          }
        >
          <p className="text-base text-on-surface">
            Toàn bộ cửa hàng, tài khoản, đơn hàng, kho, khách hàng... trên thiết bị này sẽ bị <strong>xóa vĩnh viễn</strong>. Bạn sẽ được đăng xuất.
          </p>
          <Field label='Gõ "XOA HET" để xác nhận'>
            <input value={wipeText} onChange={e => setWipeText(e.target.value)} className="m3-input font-mono" autoCapitalize="characters" />
          </Field>
        </AdminModal>
      )}
    </div>
  );
}
