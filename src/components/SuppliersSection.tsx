/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Edit2, Plus, Search, Trash2, Truck, X } from 'lucide-react';
import { Supplier } from '../types';
import { logOperation } from '../utils/logger';

interface SuppliersSectionProps {
  isOffline: boolean;
  storeId: string;
  triggerBeep: (success: boolean) => void;
  simSuppliers: Supplier[];
  setSimSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
}

export default function SuppliersSection({
  triggerBeep,
  simSuppliers,
  setSimSuppliers
}: SuppliersSectionProps) {
  const suppliers = simSuppliers;
  const [searchQuery, setSearchQuery] = useState('');

  // Form Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form values
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setModalOpen(true);
    triggerBeep(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setFormName(s.name);
    setFormPhone(s.phone);
    setFormEmail(s.email);
    setFormAddress(s.address);
    setModalOpen(true);
    triggerBeep(true);
  };

  // Save Supplier
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Vui lòng nhập tên nhà cung cấp!');
      triggerBeep(false);
      return;
    }

    const supplierId = editingSupplier ? editingSupplier.id : `SUP-${Date.now()}`;
    const newSupplier: Supplier = {
      id: supplierId,
      name: formName.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim(),
      address: formAddress.trim(),
      createdAt: editingSupplier ? editingSupplier.createdAt : new Date().toISOString()
    };

    try {
      if (editingSupplier) {
        logOperation('Quản lý nhà cung cấp', 'Sửa nhà cung cấp', newSupplier);
      } else {
        logOperation('Quản lý nhà cung cấp', 'Thêm nhà cung cấp', newSupplier);
      }

      if (editingSupplier) {
        setSimSuppliers(prev => prev.map(s => s.id === supplierId ? newSupplier : s));
      } else {
        setSimSuppliers(prev => [newSupplier, ...prev]);
      }

      setModalOpen(false);
      triggerBeep(true);
    } catch (err) {
      console.error("Lỗi lưu nhà cung cấp: ", err);
      alert("Lỗi lưu trữ dữ liệu!");
      triggerBeep(false);
    }
  };

  // Delete Supplier
  const handleDelete = async (s: Supplier) => {
    if (!confirm(`Bạn có chắc muốn xóa nhà cung cấp "${s.name}" khỏi hệ thống?`)) {
      return;
    }

    try {
      logOperation('Quản lý nhà cung cấp', 'Xóa nhà cung cấp', s);
      setSimSuppliers(prev => prev.filter(item => item.id !== s.id));
      triggerBeep(true);
    } catch (err) {
      console.error(err);
      alert("Lỗi xóa nhà cung cấp!");
      triggerBeep(false);
    }
  };

  // Filtered list
  const filteredSuppliers = suppliers.filter(s => {
    const term = searchQuery.toLowerCase().trim();
    return s.name.toLowerCase().includes(term) || s.phone.includes(term) || s.email.toLowerCase().includes(term) || s.address.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-on-surface">Nhà cung cấp</h2>
        </div>
        <button onClick={handleOpenAdd} className="m3-btn-filled !min-h-10 !px-4 text-sm">
          <Plus className="w-4 h-4" /> Thêm NCC
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm nhà cung cấp..."
          className="m3-input !rounded-full pl-10"
        />
      </div>

      {filteredSuppliers.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <Truck className="w-8 h-8 text-outline-variant" />
          <p className="text-base font-bold">Không tìm thấy nhà cung cấp nào</p>
          <p className="text-sm">Thử đổi từ khóa tìm kiếm.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredSuppliers.map((s) => (
            <div key={s.id} className="m3-card p-4 flex items-start gap-3">
              <span className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4 text-on-surface-variant" />
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <h4 className="text-base font-bold text-on-surface truncate">{s.name}</h4>
                <p className="text-sm text-on-surface-variant flex items-center gap-1.5 font-mono">
                   {s.phone || 'Chưa bổ sung'}
                </p>
                {s.email && (
                  <p className="text-sm text-on-surface-variant flex items-center gap-1.5 truncate">
                     {s.email}
                  </p>
                )}
                {s.address && (
                  <p className="text-sm text-on-surface-variant flex items-center gap-1.5 truncate" title={s.address}>
                     {s.address}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={() => handleOpenEdit(s)} className="m3-icon-btn" title="Sửa thông tin NCC">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(s)} className="m3-icon-btn hover:text-error" title="Xóa nhà cung cấp">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="m3-card !bg-surface-container-lowest max-w-md w-full p-6 shadow-xl space-y-4">

            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface">
                {editingSupplier ? 'Cập nhật nhà cung cấp' : 'Thêm nhà cung cấp mới'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Tên nhà cung cấp / Công ty đối tác</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ví dụ: Công ty TNHH Cà Phê Măng Đen"
                  className="m3-input"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Số điện thoại liên hệ</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="Ví dụ: 0281234567"
                  className="m3-input font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Địa chỉ Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="contact@nhacungcap.com"
                  className="m3-input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Văn phòng / Địa chỉ nhà kho</label>
                <textarea
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Nhập địa chỉ của nhà cung cấp..."
                  rows={2}
                  className="m3-input !h-auto py-2.5"
                />
              </div>

              <div className="pt-3 border-t border-outline-variant flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="m3-btn-tonal !min-h-10 text-sm">
                  Hủy bỏ
                </button>
                <button type="submit" className="m3-btn-filled !min-h-10 text-sm">
                  Lưu đối tác
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
