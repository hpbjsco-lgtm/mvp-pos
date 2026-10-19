/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Ban, History, Printer, Receipt, Search } from 'lucide-react';
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

  const statusFilters: { id: 'all' | 'completed' | 'void'; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'completed', label: 'Hoàn tất' },
    { id: 'void', label: 'Đã hủy' }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-on-surface">Hóa đơn</h2>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm số hóa đơn, khách, thu ngân, số bàn..."
          className="m3-input !rounded-full pl-10"
        />
      </div>

      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
        {statusFilters.map(s => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={`m3-chip !rounded-full whitespace-nowrap ${statusFilter === s.id ? 'm3-chip-selected' : ''}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <History className="w-8 h-8 text-outline-variant" />
          <p className="text-base font-bold">Không tìm thấy hóa đơn nào</p>
          <p className="text-sm">Thử đổi từ khóa hoặc bộ lọc trạng thái.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredOrders.map((o) => {
            const status = o.status || 'completed';
            const isVoid = status === 'void';
            return (
              <div
                key={o.id}
                className={`m3-card p-4 flex gap-3 border-l-4 ${
                  isVoid ? 'border-l-error opacity-60' : 'border-l-secondary'
                }`}
              >
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className={`text-base font-bold text-on-surface font-mono truncate ${isVoid ? 'line-through' : ''}`}>
                        #{o.orderNumber}
                      </h4>
                      <p className="text-sm text-on-surface-variant flex items-center gap-1">
                         {new Date(o.createdAt).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <span className={`m3-badge shrink-0 ${isVoid ? 'm3-badge-error' : 'm3-badge-success'}`}>
                      {isVoid ? 'Đã hủy' : 'Hoàn thành'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
                        <Receipt className="w-4 h-4 text-on-surface-variant" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-on-surface truncate">
                          {o.tableNumber || o.customerName || 'Khách vãng lai'}
                        </p>
                        <p className="text-sm text-on-surface-variant truncate">{o.staffName || '—'}</p>
                      </div>
                    </div>
                    <span className={`text-lg font-bold shrink-0 ${isVoid ? 'text-on-surface-variant' : 'text-primary'}`}>
                      {o.totalAmount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center gap-1.5 border-l border-outline-variant pl-3 shrink-0">
                  <button
                    onClick={() => setReprintOrder(o)}
                    className="m3-icon-btn"
                    title="In lại hóa đơn"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  {canVoid && !isVoid && (
                    <button
                      onClick={() => handleVoidOrder(o)}
                      className="m3-icon-btn hover:text-error"
                      title="Hủy hóa đơn"
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
