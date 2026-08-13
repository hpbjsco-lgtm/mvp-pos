/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { History, Search, Printer, Ban } from 'lucide-react';
import { Order, InventoryBatch, Customer } from '../types';
import ReceiptThermal from './ReceiptThermal';
import { logOperation } from '../utils/logger';

interface OrderHistorySectionProps {
  simOrders: Order[];
  setSimOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  simBatches: InventoryBatch[];
  setSimBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  simCustomers: Customer[];
  setSimCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  simStoreType: 'fnb' | 'retail';
  simUserRole: 'admin' | 'staff';
  triggerBeep: (success: boolean) => void;
  fbStoreProfile: any;
  fbUserProfile: any;
}

export default function OrderHistorySection({
  simOrders,
  setSimOrders,
  simBatches,
  setSimBatches,
  simCustomers,
  setSimCustomers,
  simStoreType,
  simUserRole,
  triggerBeep,
  fbStoreProfile,
  fbUserProfile
}: OrderHistorySectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'void'>('all');
  const [reprintOrder, setReprintOrder] = useState<Order | null>(null);

  const canVoid = simUserRole === 'admin';

  const filteredOrders = simOrders.filter(o => {
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch = !term
      || o.orderNumber.toLowerCase().includes(term)
      || (o.customerName || '').toLowerCase().includes(term)
      || (o.staffName || '').toLowerCase().includes(term)
      || (o.tableNumber || '').toLowerCase().includes(term);
    const status = o.status || 'completed';
    const matchesStatus = statusFilter === 'all' || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleVoidOrder = (order: Order) => {
    if (!canVoid) return;
    if ((order.status || 'completed') === 'void') return;
    if (!confirm(`Bạn có chắc muốn HỦY hóa đơn "${order.orderNumber}"?\n\nHệ thống sẽ hoàn lại tồn kho (nếu là bán lẻ) và trừ lại điểm tích lũy đã cộng cho khách.`)) return;

    logOperation('Lịch sử hóa đơn', 'Hủy hóa đơn', order);

    // Hoàn tồn kho cho các dòng có lô hàng (bán lẻ)
    if (simStoreType === 'retail') {
      setSimBatches(prev => prev.map(b => {
        const restored = order.items.find(it => it.batchId === b.id);
        if (restored) {
          return { ...b, quantity: b.quantity + restored.quantity };
        }
        return b;
      }));
    }

    // Trừ lại điểm tích lũy đã cộng cho khách
    if (order.customerId && order.customerPointsEarned) {
      setSimCustomers(prev => prev.map(c => (
        c.id === order.customerId
          ? { ...c, points: Math.max(0, c.points - (order.customerPointsEarned || 0)) }
          : c
      )));
    }

    setSimOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: 'void' } : o)));
    triggerBeep(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white border border-slate-200 rounded-3xl p-6 shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
            <History className="w-6 h-6 text-emerald-500" />
            Lịch sử hóa đơn
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tra cứu, in lại hóa đơn cũ{canVoid ? ', hoặc hủy đơn hàng bị nhập sai' : ''}.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo số hóa đơn, tên khách, thu ngân, số bàn..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 font-semibold"
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[10px] font-bold">
            {(['all', 'completed', 'void'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg transition-all ${statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {s === 'all' ? 'Tất cả' : s === 'completed' ? 'Hoàn tất' : 'Đã hủy'}
              </button>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
            🧾 Không tìm thấy hóa đơn nào phù hợp bộ lọc.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-4">Số hóa đơn</th>
                  <th className="p-4">Thời gian</th>
                  <th className="p-4">Khách / Bàn</th>
                  <th className="p-4">Thu ngân</th>
                  <th className="p-4 text-right">Tổng tiền</th>
                  <th className="p-4 text-center">Trạng thái</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredOrders.map((o) => {
                  const isVoid = (o.status || 'completed') === 'void';
                  return (
                    <tr key={o.id} className={`hover:bg-slate-50/50 transition-colors ${isVoid ? 'opacity-50' : ''}`}>
                      <td className="p-4 font-mono font-bold text-slate-900">{o.orderNumber}</td>
                      <td className="p-4 text-slate-500">{new Date(o.createdAt).toLocaleString('vi-VN')}</td>
                      <td className="p-4 text-slate-600">{o.tableNumber || o.customerName || 'Khách vãng lai'}</td>
                      <td className="p-4 text-slate-500">{o.staffName || '—'}</td>
                      <td className="p-4 text-right font-black text-slate-900">{o.totalAmount.toLocaleString('vi-VN')} đ</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isVoid ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                          {isVoid ? 'Đã hủy' : 'Hoàn tất'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setReprintOrder(o)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-all cursor-pointer"
                            title="In lại hóa đơn"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {canVoid && !isVoid && (
                            <button
                              onClick={() => handleVoidOrder(o)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-500 hover:text-rose-600 transition-all cursor-pointer"
                              title="Hủy hóa đơn"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {reprintOrder && (
        <ReceiptThermal
          order={reprintOrder}
          storeInfo={{
            name: fbStoreProfile?.name || 'SmartPOS Coffee Shop',
            address: fbStoreProfile?.address || '123 Đường Lê Lợi, TP. HCM',
            phone: fbStoreProfile?.phone || '0901234567',
            storeType: simStoreType
          }}
          staffName={reprintOrder.staffName || fbUserProfile?.name || 'Thu Ngân'}
          onClose={() => { setReprintOrder(null); triggerBeep(true); }}
        />
      )}
    </div>
  );
}
