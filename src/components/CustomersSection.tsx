/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Customer } from '../types';
import { logOperation } from '../utils/logger';
import PageCard from './ui/PageCard';
import FilterPills from './ui/FilterPills';
import ListToolbar from './ui/ListToolbar';
import DataTable, { RoundThumb, RowActions } from './ui/DataTable';

interface CustomersSectionProps {
  isOffline: boolean;
  storeId: string;
  triggerBeep: (success: boolean) => void;
  simCustomers: Customer[];
  setSimCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
}

type Tier = 'bronze' | 'silver' | 'gold' | 'diamond';

const getTier = (points: number): { id: Tier; name: string; badgeClass: string; barClass: string } => {
  if (points >= 500) return { id: 'diamond', name: 'Kim cương', badgeClass: 'bg-primary-container text-on-primary-container', barClass: 'border-l-primary' };
  if (points >= 200) return { id: 'gold', name: 'Vàng', badgeClass: 'm3-badge-warning', barClass: 'border-l-tertiary' };
  if (points >= 50) return { id: 'silver', name: 'Bạc', badgeClass: 'm3-badge-neutral', barClass: 'border-l-outline' };
  return { id: 'bronze', name: 'Đồng', badgeClass: 'm3-badge-neutral', barClass: 'border-l-outline-variant' };
};

export default function CustomersSection({
  triggerBeep,
  simCustomers,
  setSimCustomers
}: CustomersSectionProps) {
  const customers = simCustomers;
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'all' | Tier>('all');

  // Form Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form values
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPoints, setFormPoints] = useState<number>(0);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormPoints(0);
    setModalOpen(true);
    triggerBeep(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (c: Customer) => {
    if (c.id === 'khach-vang-lai') {
      alert('Không thể chỉnh sửa thông tin khách vãng lai mặc định!');
      triggerBeep(false);
      return;
    }
    setEditingCustomer(c);
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormEmail(c.email);
    setFormPoints(c.points);
    setModalOpen(true);
    triggerBeep(true);
  };

  // Save Customer (Add/Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      alert('Vui lòng nhập tên khách hàng!');
      triggerBeep(false);
      return;
    }

    const customerId = editingCustomer ? editingCustomer.id : `CUST-${Date.now()}`;
    const newCustomer: Customer = {
      id: customerId,
      name: formName.trim(),
      phone: formPhone.trim(),
      email: formEmail.trim(),
      points: Number(formPoints) || 0,
      createdAt: editingCustomer ? editingCustomer.createdAt : new Date().toISOString()
    };

    try {
      if (editingCustomer) {
        logOperation('Quản lý khách hàng', 'Sửa khách hàng', newCustomer);
      } else {
        logOperation('Quản lý khách hàng', 'Thêm khách hàng', newCustomer);
      }

      if (editingCustomer) {
        setSimCustomers(prev => prev.map(c => c.id === customerId ? newCustomer : c));
      } else {
        setSimCustomers(prev => [newCustomer, ...prev]);
      }

      setModalOpen(false);
      triggerBeep(true);
    } catch (err) {
      console.error("Lỗi lưu thông tin khách hàng: ", err);
      alert("Lỗi lưu trữ dữ liệu!");
      triggerBeep(false);
    }
  };

  // Delete Customer
  const handleDelete = async (c: Customer) => {
    if (c.id === 'khach-vang-lai') {
      alert('Không được xóa khách vãng lai mặc định!');
      triggerBeep(false);
      return;
    }

    if (!confirm(`Bạn có chắc muốn xóa khách hàng "${c.name}" khỏi hệ thống?`)) {
      return;
    }

    try {
      logOperation('Quản lý khách hàng', 'Xóa khách hàng', c);
      setSimCustomers(prev => prev.filter(item => item.id !== c.id));
      triggerBeep(true);
    } catch (err) {
      console.error(err);
      alert("Lỗi xóa khách hàng!");
      triggerBeep(false);
    }
  };

  // Filtered list
  const filteredCustomers = customers.filter(c => {
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = c.name.toLowerCase().includes(term) || c.phone.includes(term) || c.email.toLowerCase().includes(term);
    const matchesTier = tierFilter === 'all' || getTier(c.points).id === tierFilter;
    return matchesSearch && matchesTier;
  });

  const tierFilters: { id: 'all' | Tier; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'diamond', label: 'Kim cương' },
    { id: 'gold', label: 'Vàng' },
    { id: 'silver', label: 'Bạc' },
    { id: 'bronze', label: 'Đồng' }
  ];

  return (
    <div className="space-y-4">
      <PageCard title="Quản lý khách hàng">
        <ListToolbar
          filters={<FilterPills options={tierFilters.map(t => ({ value: t.id, label: t.label }))} value={tierFilter} onChange={setTierFilter} />}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Tìm tên hoặc số điện thoại..."
          addLabel="Thêm mới"
          onAdd={handleOpenAdd}
        />
        <DataTable
          rows={filteredCustomers}
          rowKey={c => c.id}
          emptyMessage="Không tìm thấy khách hàng nào"
          columns={[
            { key: 'avatar', header: 'Ảnh', className: 'w-16', render: c => <RoundThumb name={c.name} /> },
            { key: 'name', header: 'Tên khách hàng', render: c => <span className="font-semibold">{c.name}</span> },
            { key: 'phone', header: 'Số điện thoại', render: c => c.phone || 'Chưa cập nhật SĐT' },
            { key: 'tier', header: 'Hạng', render: c => (c.id === 'khach-vang-lai' ? '' : getTier(c.points).name) },
            { key: 'points', header: 'Điểm tích lũy', className: 'text-right', render: c => c.points },
          ]}
          renderActions={c => (c.id === 'khach-vang-lai' ? null : (
            <RowActions onEdit={() => handleOpenEdit(c)} onDelete={() => handleDelete(c)} editLabel="Chỉnh sửa thông tin" deleteLabel="Xóa khách hàng" />
          ))}
        />
      </PageCard>

      {/* Modal Dialog Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="m3-card !bg-surface-container-lowest max-w-md w-full p-6 shadow-xl space-y-4">

            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface">
                {editingCustomer ? 'Cập nhật thông tin khách hàng' : 'Thêm khách hàng mới'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Họ và tên khách hàng</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn Hải"
                  className="m3-input"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Số điện thoại</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="Ví dụ: 0912345678"
                  className="m3-input font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Địa chỉ Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="username@domain.com"
                  className="m3-input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Điểm tích lũy thành viên</label>
                <input
                  type="number"
                  value={formPoints}
                  onChange={(e) => setFormPoints(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="m3-input font-mono"
                />
              </div>

              <div className="pt-3 border-t border-outline-variant flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="m3-btn-tonal !min-h-10 text-sm">
                  Hủy bỏ
                </button>
                <button type="submit" className="m3-btn-filled !min-h-10 text-sm">
                  Lưu hồ sơ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
