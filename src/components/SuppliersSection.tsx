/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Supplier } from '../types';
import { logOperation } from '../utils/logger';
import PageCard from './ui/PageCard';
import ListToolbar from './ui/ListToolbar';
import DataTable, { RowActions } from './ui/DataTable';

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
      <PageCard title="Quản lý nhà cung cấp">
        <ListToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Tìm nhà cung cấp..."
          addLabel="Thêm mới"
          onAdd={handleOpenAdd}
        />
        <DataTable
          rows={filteredSuppliers}
          rowKey={s => s.id}
          emptyMessage="Không tìm thấy nhà cung cấp nào"
          columns={[
            { key: 'name', header: 'Tên nhà cung cấp', render: s => <span className="font-semibold">{s.name}</span> },
            { key: 'phone', header: 'Số điện thoại', render: s => s.phone || 'Chưa bổ sung' },
            { key: 'email', header: 'Email', render: s => s.email },
            { key: 'address', header: 'Địa chỉ', render: s => s.address },
          ]}
          renderActions={s => (
            <RowActions onEdit={() => handleOpenEdit(s)} onDelete={() => handleDelete(s)} editLabel="Sửa thông tin NCC" deleteLabel="Xóa nhà cung cấp" />
          )}
        />
      </PageCard>

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
