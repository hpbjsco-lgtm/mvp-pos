/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users, Search, Plus, Edit2, Trash2, Award,
  Phone, Mail, Check, AlertCircle, X, ShieldAlert
} from 'lucide-react';
import { Customer } from '../types';
import { logOperation } from '../utils/logger';

interface CustomersSectionProps {
  isOffline: boolean;
  storeId: string;
  triggerBeep: (success: boolean) => void;
  simCustomers: Customer[];
  setSimCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
}

export default function CustomersSection({
  isOffline,
  storeId,
  triggerBeep,
  simCustomers,
  setSimCustomers
}: CustomersSectionProps) {
  const customers = simCustomers;
  const [searchQuery, setSearchQuery] = useState('');

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
    return c.name.toLowerCase().includes(term) || c.phone.includes(term) || c.email.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-black text-on-surface tracking-tight uppercase flex items-center gap-2">
            <Users className="w-6 h-6 text-secondary" />
            Quản lý cơ sở dữ liệu Khách hàng
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Tra cứu thông tin khách hàng, tích điểm thành viên hội viên và quản lý lịch sử liên hệ.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4.5 py-2.5 bg-primary hover:brightness-110 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Thêm khách hàng mới
        </button>
      </div>

      {/* Main Grid table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 shadow-sm space-y-4">
        {/* Controls */}
        <div className="flex items-center relative">
          <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm khách hàng theo Tên, Số điện thoại hoặc Email..."
            className="w-full pl-10 pr-4 py-3 border border-outline-variant rounded-xl text-xs focus:ring-1 focus:ring-primary font-semibold"
          />
        </div>

        {/* List Content */}
        {filteredCustomers.length === 0 ? (
          <div className="py-16 text-center text-on-surface-variant text-xs border border-dashed border-outline-variant rounded-2xl">
            🔍 Không tìm thấy hồ sơ khách hàng nào phù hợp bộ lọc tìm kiếm.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-outline-variant">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant font-bold uppercase border-b border-outline-variant">
                  <th className="p-4">Tên khách hàng</th>
                  <th className="p-4">Số điện thoại</th>
                  <th className="p-4">Địa chỉ Email</th>
                  <th className="p-4 text-center">Điểm tích lũy</th>
                  <th className="p-4 text-center">Hạng thẻ</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-on-surface">
                {filteredCustomers.map((c) => {
                  const isWalkin = c.id === 'khach-vang-lai';
                  // Calculate tier
                  let tierName = 'Đồng (Bronze)';
                  let tierColor = 'bg-surface-container-high text-on-surface-variant border border-outline-variant';
                  if (c.points >= 500) {
                    tierName = 'Kim Cương (Diamond)';
                    tierColor = 'bg-cyan-50 text-cyan-700 border border-cyan-200';
                  } else if (c.points >= 200) {
                    tierName = 'Vàng (Gold)';
                    tierColor = 'bg-tertiary-container text-on-tertiary-container border border-tertiary-container';
                  } else if (c.points >= 50) {
                    tierName = 'Bạc (Silver)';
                    tierColor = 'bg-primary-container text-primary border border-primary-container';
                  }

                  return (
                    <tr key={c.id} className={`hover:bg-surface-container/50 transition-colors ${isWalkin ? 'bg-surface-container/30' : ''}`}>
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                            isWalkin ? 'bg-slate-200 text-on-surface-variant' : 'bg-secondary-container text-secondary'
                          }`}>
                            {c.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-extrabold text-on-surface">{c.name}</p>
                            <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">{c.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-on-surface-variant">
                        {c.phone || <span className="text-outline">Chưa cập nhật</span>}
                      </td>
                      <td className="p-4 text-on-surface-variant">
                        {c.email || <span className="text-outline">Chưa cập nhật</span>}
                      </td>
                      <td className="p-4 text-center">
                        <span className="font-black text-on-surface font-mono text-sm">
                          {c.points}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${tierColor}`}>
                          {tierName}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(c)}
                            disabled={isWalkin}
                            className={`p-1.5 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-primary transition-all cursor-pointer ${
                              isWalkin ? 'opacity-30 cursor-not-allowed' : ''
                            }`}
                            title="Chỉnh sửa thông tin"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            disabled={isWalkin}
                            className={`p-1.5 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-error transition-all cursor-pointer ${
                              isWalkin ? 'opacity-30 cursor-not-allowed' : ''
                            }`}
                            title="Xóa khách hàng"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail card displaying Premium Loyalty Program Rules */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-3xl p-6 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="absolute top-0 right-0 w-36 h-36 bg-surface-container-lowest/5 rounded-full blur-2xl" />
        <div className="space-y-2">
          <span className="bg-surface-container-lowest/10 text-white border border-white/20 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase">Chương trình Loyalty VIP</span>
          <h3 className="text-base font-extrabold tracking-tight">Cơ chế tích điểm thành viên tự động</h3>
          <p className="text-xs text-white/80 max-w-xl">
            Khi thanh toán hóa đơn, cứ mỗi <strong>10,000 đ</strong> chi tiêu, thành viên sẽ tự động tích lũy được <strong>1 điểm</strong>. Điểm tích lũy dùng để xếp hạng hội viên (Đồng, Bạc, Vàng, Kim Cương) và trừ trực tiếp vào hóa đơn tiếp theo.
          </p>
        </div>
        <div className="flex items-center gap-3.5 bg-surface-container-lowest/10 border border-white/20 rounded-2xl px-5 py-4 backdrop-blur-sm">
          <Award className="w-8 h-8 text-yellow-300 animate-pulse flex-shrink-0" />
          <div className="text-left">
            <p className="text-xs font-extrabold uppercase">Thống kê hội viên</p>
            <p className="text-xs text-white/80 mt-0.5">Thành viên: <strong>{customers.filter(c => c.id !== 'khach-vang-lai').length} người</strong></p>
          </div>
        </div>
      </div>

      {/* Modal Dialog Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant max-w-md w-full p-6 shadow-xl space-y-4">
            
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-sm font-black text-on-surface uppercase">
                {editingCustomer ? 'Cập nhật thông tin khách hàng' : 'Thêm hồ sơ khách hàng mới'}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-on-surface-variant transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Họ và tên khách hàng</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn Hải"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold focus:ring-1 focus:ring-primary"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Số điện thoại</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="Ví dụ: 0912345678"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Địa chỉ Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="username@domain.com"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Điểm tích lũy thành viên</label>
                <input
                  type="number"
                  value={formPoints}
                  onChange={(e) => setFormPoints(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="pt-4 border-t border-outline-variant flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface-variant rounded-xl font-bold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary hover:brightness-110 text-white rounded-xl font-bold shadow transition-all cursor-pointer"
                >
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
