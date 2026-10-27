/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import DragScrollRow from './DragScrollRow';
import React, { useState } from 'react';
import { Edit2, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { Customer } from '../types';
import { logOperation } from '../utils/logger';

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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-on-surface">Khách hàng</h2>
        </div>
        <button onClick={handleOpenAdd} className="m3-btn-filled !bg-secondary !text-on-secondary !min-h-10 !px-4 text-sm">
          <Plus className="w-4 h-4" /> Thêm mới
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm theo Tên hoặc Số điện thoại..."
          className="m3-input !rounded-full pl-10"
        />
      </div>

      <DragScrollRow className="gap-2 pb-1">
        {tierFilters.map(t => (
          <button
            key={t.id}
            onClick={() => setTierFilter(t.id)}
            className={`m3-chip !rounded-full whitespace-nowrap ${tierFilter === t.id ? 'm3-chip-selected' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </DragScrollRow>

      {/* Danh sách khách hàng */}
      {filteredCustomers.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <Users className="w-8 h-8 text-outline-variant" />
          <p className="text-base font-bold">Không tìm thấy khách hàng nào</p>
          <p className="text-sm">Thử đổi từ khóa tìm kiếm hoặc bộ lọc hạng thẻ.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredCustomers.map((c) => {
            const isWalkin = c.id === 'khach-vang-lai';
            const tier = getTier(c.points);

            return (
              <div key={c.id} className={`m3-card p-4 border-l-4 ${tier.barClass} ${isWalkin ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm uppercase shrink-0">
                      {c.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-bold text-on-surface truncate">{c.name}</p>
                      <p className="text-sm text-on-surface-variant font-mono truncate">{c.phone || 'Chưa cập nhật SĐT'}</p>
                    </div>
                  </div>
                  {!isWalkin && (
                    <span className={`m3-badge shrink-0 ${tier.badgeClass}`}>
                       {tier.name}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-outline-variant">
                  <div>
                    <p className="text-sm text-on-surface-variant">Điểm tích lũy</p>
                    <p className="text-lg font-bold text-on-surface flex items-center gap-1">
                       {c.points}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(c)}
                      disabled={isWalkin}
                      className={`m3-icon-btn ${isWalkin ? 'opacity-30 cursor-not-allowed' : ''}`}
                      title="Chỉnh sửa thông tin"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={isWalkin}
                      className={`m3-icon-btn hover:text-error ${isWalkin ? 'opacity-30 cursor-not-allowed' : ''}`}
                      title="Xóa khách hàng"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
