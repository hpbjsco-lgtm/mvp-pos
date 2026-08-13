/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Truck, Search, Plus, Edit2, Trash2, MapPin,
  Phone, Mail, Check, AlertCircle, X, ShieldAlert
} from 'lucide-react';
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
  isOffline,
  storeId,
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
    <div className="space-y-6">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white border border-slate-200 rounded-3xl p-6 shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-500" />
            Quản lý nhà cung cấp (Suppliers)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Đăng ký và quản lý thông tin các đơn vị cung cấp nguyên vật liệu, lô hàng hóa nhập kho.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Thêm nhà cung cấp mới
        </button>
      </div>

      {/* Main Grid table */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        {/* Controls */}
        <div className="flex items-center relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm theo Tên nhà cung cấp, Điện thoại, Email hoặc Địa chỉ..."
            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 font-semibold"
          />
        </div>

        {/* List Content */}
        {filteredSuppliers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
            🚚 Không tìm thấy đối tác nhà cung cấp nào phù hợp bộ lọc tìm kiếm.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-4">Đối tác cung ứng</th>
                  <th className="p-4">Số điện thoại</th>
                  <th className="p-4">Địa chỉ Email</th>
                  <th className="p-4">Văn phòng / Địa chỉ</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredSuppliers.map((s) => {
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs uppercase border border-slate-200">
                            {s.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-900">{s.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{s.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-slate-600">
                        {s.phone || <span className="text-slate-300">Chưa bổ sung</span>}
                      </td>
                      <td className="p-4 text-slate-500">
                        {s.email || <span className="text-slate-300">Chưa bổ sung</span>}
                      </td>
                      <td className="p-4 text-slate-500 max-w-xs truncate" title={s.address}>
                        {s.address || <span className="text-slate-300">Chưa bổ sung</span>}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-all cursor-pointer"
                            title="Sửa thông tin NCC"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-rose-600 transition-all cursor-pointer"
                            title="Xóa nhà cung cấp"
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

      {/* Modal Dialog Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 uppercase">
                {editingSupplier ? 'Cập nhật nhà cung cấp' : 'Thêm nhà cung cấp mới'}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tên nhà cung cấp / Công ty đối tác</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ví dụ: Công ty TNHH Cà Phê Măng Đen"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Số điện thoại liên hệ</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="Ví dụ: 0281234567"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Địa chỉ Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="contact@nhacungcap.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Văn phòng / Địa chỉ nhà kho</label>
                <textarea
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Nhập địa chỉ của nhà cung cấp..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition-all cursor-pointer"
                >
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
